var mongoose = require('mongoose');
var Schema = mongoose.Schema;

/**
 * FlowExecution — persistent checkpoint for a single run of a fire-and-forget
 * automation (request_id prefixed with "automation-request-").
 *
 * Lifecycle:
 *   1. Bot is dispatched via POST /block/:project/:bot/:block_id. The handler
 *      creates a FlowExecution doc with status=running and the snapshot needed
 *      to resume (message envelope + directives array + initial parameters).
 *   2. As each directive executes, the engine updates `current` with the
 *      directive index, name, started_at, and the deadline (started_at +
 *      timeout for that directive type — e.g. wait.millis, HTTP timeout).
 *   3. Side-effecting directives (send_email, web_request, ...) consult and
 *      append to `side_effects` keyed by a deterministic `idempotency_key`,
 *      so that resuming after a crash never duplicates the external call.
 *   4. When the last directive completes, status=completed.
 *
 * Recovery (FlowExecutionSupervisor):
 *   - Periodically polls for {status: running, current.expected_end_at < now,
 *     lease expired}, atomically claims with a lease, and resumes from
 *     `current.directive_index` via the engine's resumeFromIndex().
 *   - The lease is renewed during resume to prevent two workers acting on
 *     the same execution. Stuck-in-processing recovery is implicit via the
 *     lease TTL.
 *
 * Conversational bots (request_id not prefixed with "automation-request-")
 * are NOT modelled here — their reconciliation lives in PHP
 * (Picallex/Services/WhatsApp/Crons/TreatConversationalBots).
 */
var FlowExecutionSchema = new Schema({
  // Identity
  execution_id: { type: String, required: true, unique: true, index: true },
  request_id: { type: String, required: true, index: true },
  bot_id: { type: String, required: true, index: true },
  project_id: { type: String, required: true, index: true },
  token: { type: String, required: true },

  // Trigger metadata — what kicked this off (block_id, raw payload)
  trigger: {
    block_id: { type: String },
    payload: { type: Schema.Types.Mixed }
  },

  // Snapshot — everything needed to reconstruct runtime context on resume
  snapshot: {
    message: { type: Schema.Types.Mixed, required: true },
    reply: { type: Schema.Types.Mixed },
    supportRequest: { type: Schema.Types.Mixed, required: true },
    directives: { type: [Schema.Types.Mixed], required: true },
    parameters: { type: Schema.Types.Mixed, default: {} }
  },

  // Where the execution is right now
  current: {
    directive_index: { type: Number, default: 0 },
    directive_name: { type: String },
    started_at: { type: Date },
    // Wall-clock deadline — when supervisor considers it stuck/due.
    // For DirWait: started_at + wait.millis (could be days).
    // For HTTP-like: started_at + ~30-60s budget (covers timeout+grace).
    // For instant directives: started_at + a small budget (e.g. 5s).
    expected_end_at: { type: Date, index: true }
  },

  // Status lifecycle:
  //   running       — engine actively processing directives (lease may be held)
  //   waiting       — paused on a DirWait, supervisor will resume when
  //                   current.expected_end_at <= now. This is the ONLY status
  //                   the supervisor auto-resumes from. Distinguishing
  //                   'waiting' from 'running' prevents the supervisor from
  //                   re-firing side-effects of mid-flow crashes (which would
  //                   otherwise look like "running with expired deadline").
  //   completed     — chain finished normally
  //   failed        — exhausted retries
  //   needs_review  — crashed mid-flow; operator must inspect (auto-retry
  //                   disabled to avoid duplicate side-effects)
  status: {
    type: String,
    enum: ['running', 'waiting', 'completed', 'failed', 'needs_review'],
    default: 'running',
    index: true
  },

  // Idempotency log — append-only.
  // idempotency_key is deterministic (execution_id + directive_index +
  // optional content hash) so a resume that re-enters a side-effect
  // directive finds the prior result and skips the external call.
  side_effects: {
    type: [{
      _id: false,
      idempotency_key: { type: String, required: true },
      directive_name: { type: String, required: true },
      directive_index: { type: Number, required: true },
      result: { type: Schema.Types.Mixed },
      executed_at: { type: Date, default: Date.now },
      duration_ms: { type: Number }
    }],
    default: []
  },

  // Supervisor lease — atomic claim during resume
  lease: {
    worker_id: { type: String },
    until: { type: Date }
  },

  attempts: { type: Number, default: 0 },
  last_error: { type: String },

  // Bookkeeping
  created_at: { type: Date, default: Date.now, index: true },
  updated_at: { type: Date, default: Date.now },
  completed_at: { type: Date, index: true },

  // Redis cleanup tracking. The supervisor deletes the per-request_id
  // Redis keys once an execution has been completed for some time
  // (FLOW_REDIS_CLEANUP_DELAY_MS) to keep Redis from growing unbounded.
  // The Mongo doc itself is NEVER deleted by the supervisor — kept for
  // audit / debugging indefinitely.
  redis_cleaned_at: { type: Date },

  // Tiledesk's engine can run MULTIPLE directive chains within a single
  // request_id (e.g. DirIntent navigation → chain #1 finishes → chain #2
  // starts with a different directives array). Each chain is treated as
  // a distinct execution unit for resilience purposes, but they share
  // the same execution_id for traceability.
  //
  // When a new chain begins (processDirectives is called and finds the
  // doc in status='completed'), the previous chain's state is archived
  // here and the active fields (status, current, side_effects, snapshot)
  // are reset for the new chain. This preserves full audit history
  // while keeping the active fields accurate for the supervisor.
  //
  // The most recent chain is the "active" one (lives in the top-level
  // fields); earlier chains live in this array in order.
  previous_chains: {
    type: [{
      _id: false,
      chain_index: { type: Number, required: true },
      message: { type: Schema.Types.Mixed },
      reply: { type: Schema.Types.Mixed },
      directives: { type: [Schema.Types.Mixed] },
      current: { type: Schema.Types.Mixed },        // last-known position before completion
      side_effects: { type: [Schema.Types.Mixed] },
      started_at: { type: Date },
      completed_at: { type: Date }
    }],
    default: []
  }
}, {
  collection: 'flow_executions'
});

// Compound index for the supervisor poll query — the hot path.
FlowExecutionSchema.index({ status: 1, 'current.expected_end_at': 1 });

// Side-effect lookup must be cheap; idempotency_key is in an embedded array.
// Mongo can hit a multikey index on the array's nested field.
FlowExecutionSchema.index({ 'side_effects.idempotency_key': 1 });

FlowExecutionSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

var FlowExecution = mongoose.model('flow_execution', FlowExecutionSchema);
module.exports = FlowExecution;
