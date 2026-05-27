const crypto = require('crypto');
const FlowExecution = require('../models/flow_execution');
const winston = require('../utils/winston');

/**
 * FlowExecutionStore — encapsulates Mongo operations on flow_executions.
 *
 * Why a separate layer (vs. calling the model directly from the engine):
 *   - All concurrency-sensitive operations (claim, advance, idempotent
 *     side-effect append) live here, so the engine doesn't have to know
 *     about lease semantics or atomic-update operators.
 *   - Easier to mock in tests.
 *   - One place to add metrics / logging later.
 *
 * Naming conventions:
 *   - `executionId` is the canonical id used in the URL of the resume worker
 *     and as the prefix for idempotency_key. Derived from the request_id
 *     (e.g. "automation-request-<projectId>-<uuid>" -> "<uuid>" is the
 *     execution_id portion).
 */
class FlowExecutionStore {

  /**
   * Derive the execution_id (stable, deterministic) from a request_id.
   * Returns null if the request_id is not in the automation form.
   *
   * The automation prefix is "automation-request-<project_id>-<exec_id>".
   * We strip both the prefix and the project_id so that the same trigger
   * always lands on the same execution_id (idempotent dispatch from PHP).
   */
  static executionIdFromRequestId(requestId, projectId) {
    if (!requestId || !requestId.startsWith('automation-request-')) return null;
    const tail = requestId.substring('automation-request-'.length);
    // tail is "<projectId>-<execId>" but project ids contain hyphens too,
    // so we anchor on the known projectId prefix.
    if (projectId && tail.startsWith(projectId + '-')) {
      return tail.substring(projectId.length + 1);
    }
    // Fallback: take everything after the last hyphen (covers ids generated
    // by the server when projectId is unknown at parse time).
    const lastDash = tail.lastIndexOf('-');
    return lastDash >= 0 ? tail.substring(lastDash + 1) : tail;
  }

  /**
   * Idempotent get-or-create. Called at the entrypoint of every automation
   * dispatch. If a doc already exists for the execution_id, returns it
   * untouched — that means we're being re-dispatched (e.g. the worker
   * resuming, or PHP retrying the trigger) and the in-progress state wins.
   */
  static async getOrCreate({ executionId, requestId, botId, projectId, token, trigger, snapshot }) {
    const existing = await FlowExecution.findOne({ execution_id: executionId });
    if (existing) {
      return { doc: existing, created: false };
    }
    try {
      const doc = await FlowExecution.create({
        execution_id: executionId,
        request_id: requestId,
        bot_id: botId,
        project_id: projectId,
        token: token,
        trigger: trigger || {},
        snapshot: snapshot,
        status: 'running',
        current: {
          directive_index: 0,
          started_at: new Date(),
          expected_end_at: new Date(Date.now() + 5000) // initial budget; updated by engine
        }
      });
      return { doc, created: true };
    } catch (err) {
      // Race: another worker beat us. Re-fetch.
      if (err && err.code === 11000) {
        const doc = await FlowExecution.findOne({ execution_id: executionId });
        return { doc, created: false };
      }
      throw err;
    }
  }

  /**
   * Mark the engine entering a directive. Updates `current` with the index,
   * name, start time, and deadline. Returns the updated doc so callers can
   * inspect side_effects on the same read.
   *
   * Caller computes `expectedTimeoutMs` based on directive type:
   *   - DirWait: action.millis
   *   - DirWebRequest: HTTP timeout + headroom (e.g. 60s)
   *   - DirAskGPT / DirAssistant: model timeout + headroom (e.g. 120s)
   *   - everything else: small constant (e.g. 5_000)
   */
  static async beginDirective(executionId, { directiveIndex, directiveName, expectedTimeoutMs, parameters }) {
    const now = new Date();
    const set = {
      'current.directive_index': directiveIndex,
      'current.directive_name': directiveName,
      'current.started_at': now,
      'current.expected_end_at': new Date(now.getTime() + (expectedTimeoutMs || 5000)),
      updated_at: now
    };
    // Snapshot the live parameters into Mongo so they survive even a full
    // Redis wipe. Mongo is the durable source of truth; Redis is cache.
    // On resume the supervisor rehydrates these back into Redis before
    // running the next directive. Folded into this single write to avoid
    // an extra round-trip per directive.
    if (parameters !== undefined && parameters !== null) {
      set['snapshot.parameters'] = parameters;
    }
    return await FlowExecution.findOneAndUpdate(
      { execution_id: executionId },
      { $set: set },
      { new: true }
    );
  }

  /**
   * Look up a previously recorded side-effect by idempotency_key.
   * Used to short-circuit re-execution after a crash.
   */
  static findSideEffect(doc, idempotencyKey) {
    if (!doc || !doc.side_effects) return null;
    return doc.side_effects.find(se => se.idempotency_key === idempotencyKey) || null;
  }

  /**
   * Append a completed side-effect to the log. The $push is atomic and the
   * idempotency_key is the de-dup key (we also re-check on read in
   * findSideEffect — belt-and-braces).
   */
  static async appendSideEffect(executionId, { idempotencyKey, directiveName, directiveIndex, result, durationMs }) {
    return await FlowExecution.updateOne(
      { execution_id: executionId },
      {
        $push: {
          side_effects: {
            idempotency_key: idempotencyKey,
            directive_name: directiveName,
            directive_index: directiveIndex,
            result: result,
            executed_at: new Date(),
            duration_ms: durationMs
          }
        },
        $set: { updated_at: new Date() }
      }
    );
  }

  /**
   * Generate a deterministic idempotency key for a directive at a given
   * index of an execution. Includes a content hash so that "the same
   * directive at the same index" only matches if the content also matches
   * (defensive against directive arrays being regenerated).
   */
  static idempotencyKey(executionId, directiveIndex, directive) {
    const hash = crypto.createHash('sha1')
      .update(JSON.stringify(directive || {}))
      .digest('hex')
      .substring(0, 12);
    return `${executionId}:${directiveIndex}:${hash}`;
  }

  /**
   * Atomically claim an execution for resumption. Used by the supervisor.
   *
   * Returns the claimed doc, or null if nothing is due / all due are
   * already leased.
   */
  static async claimDue(workerId, leaseTtlMs) {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + leaseTtlMs);
    return await FlowExecution.findOneAndUpdate(
      {
        status: 'running',
        'current.expected_end_at': { $lte: now },
        $or: [
          { 'lease.until': null },
          { 'lease.until': { $lt: now } }
        ]
      },
      {
        $set: {
          'lease.worker_id': workerId,
          'lease.until': leaseUntil,
          updated_at: now
        },
        $inc: { attempts: 1 }
      },
      { sort: { 'current.expected_end_at': 1 }, new: true }
    );
  }

  /**
   * Release the lease (e.g. after resume succeeds and the engine has
   * advanced `current`). We don't delete the doc — completion is signalled
   * separately via markCompleted.
   */
  static async releaseLease(executionId) {
    return await FlowExecution.updateOne(
      { execution_id: executionId },
      { $set: { 'lease.worker_id': null, 'lease.until': null, updated_at: new Date() } }
    );
  }

  static async markCompleted(executionId) {
    return await FlowExecution.updateOne(
      { execution_id: executionId },
      {
        $set: {
          status: 'completed',
          completed_at: new Date(),
          'lease.worker_id': null,
          'lease.until': null,
          updated_at: new Date()
        }
      }
    );
  }

  /**
   * Mark as failed after exhausting retry attempts.
   * `needs_review` is used when we detect a side-effect occurred but we
   * can't safely re-execute (manual operator action required).
   */
  static async markFailed(executionId, error, { needsReview } = {}) {
    return await FlowExecution.updateOne(
      { execution_id: executionId },
      {
        $set: {
          status: needsReview ? 'needs_review' : 'failed',
          last_error: error && error.message ? error.message : String(error),
          'lease.worker_id': null,
          'lease.until': null,
          updated_at: new Date()
        }
      }
    );
  }

  /**
   * Recover executions whose lease expired while in supervisor hands
   * (worker crashed mid-resume). Just clear the lease so the next poll
   * picks them up again.
   */
  static async recoverStuckLeases() {
    const now = new Date();
    const r = await FlowExecution.updateMany(
      { 'lease.until': { $lt: now }, status: 'running' },
      { $set: { 'lease.worker_id': null, 'lease.until': null } }
    );
    if (r.modifiedCount > 0) {
      winston.warn(`(FlowExecutionStore) recovered ${r.modifiedCount} stuck leases`);
    }
    return r.modifiedCount || 0;
  }

  /**
   * Snapshot the current parameters into the doc. Done at directive
   * boundaries so resume sees up-to-date variables.
   */
  static async updateParameters(executionId, parameters) {
    return await FlowExecution.updateOne(
      { execution_id: executionId },
      { $set: { 'snapshot.parameters': parameters || {}, updated_at: new Date() } }
    );
  }

  /**
   * Archive the current chain state into previous_chains[] and reset the
   * active fields to start a fresh chain on the same execution_id.
   *
   * Called by the engine on every NEW processDirectives invocation that
   * finds an existing doc — Tiledesk's HTTP routes invoke
   * processDirectives once per bot reply, and intent navigation triggers
   * separate roundtrips that hit the route again with a different
   * directives array. Each such call is by definition a new chain.
   *
   * The previous chain's snapshot (directives, message, reply), current
   * pointer, side_effects log, and timestamps are preserved in
   * previous_chains[]. The active fields are reset:
   *   - status='running' so the supervisor can pick it up if needed
   *   - current.directive_index=0
   *   - attempts=0, last_error=null, completed_at=null, redis_cleaned_at=null
   *   - side_effects=[] (idempotency keys are scoped to a chain)
   *   - lease cleared (the previous chain's supervisor may still hold it
   *     transiently; the engine takes priority over a stale lease)
   *
   * Idempotency: uses atomic findOneAndUpdate keyed by execution_id only,
   * so concurrent calls may both archive (rare but not catastrophic —
   * the archive log just gets duplicate entries). For tighter guarantees
   * we'd need a write-side lock that we don't have today.
   */
  static async archiveAndStartNewChain(executionId, { newMessage, newReply, newSupportRequest, newDirectives, newParameters }) {
    const current = await FlowExecution.findOne({ execution_id: executionId });
    if (!current) {
      throw new Error(`archiveAndStartNewChain: execution ${executionId} not found`);
    }
    const chainIndex = (current.previous_chains || []).length;
    const archive = {
      chain_index: chainIndex,
      message: current.snapshot && current.snapshot.message,
      reply: current.snapshot && current.snapshot.reply,
      directives: (current.snapshot && current.snapshot.directives) || [],
      current: current.current || {},
      side_effects: current.side_effects || [],
      started_at: current.current && current.current.started_at,
      completed_at: current.completed_at
    };
    const updated = await FlowExecution.findOneAndUpdate(
      { execution_id: executionId },
      {
        $push: { previous_chains: archive },
        $set: {
          status: 'running',
          'current.directive_index': 0,
          'current.directive_name': null,
          'current.started_at': null,
          'current.expected_end_at': null,
          attempts: 0,
          last_error: null,
          completed_at: null,
          redis_cleaned_at: null,
          side_effects: [],
          'lease.worker_id': null,
          'lease.until': null,
          'snapshot.message': newMessage !== undefined ? newMessage : current.snapshot.message,
          'snapshot.reply': newReply !== undefined ? newReply : current.snapshot.reply,
          'snapshot.supportRequest': newSupportRequest !== undefined ? newSupportRequest : current.snapshot.supportRequest,
          'snapshot.directives': newDirectives !== undefined ? newDirectives : current.snapshot.directives,
          'snapshot.parameters': newParameters !== undefined ? newParameters : (current.snapshot.parameters || {}),
          updated_at: new Date()
        }
      },
      { new: true }
    );
    return updated || await FlowExecution.findOne({ execution_id: executionId });
  }

  /**
   * Find executions that completed at least `delayMs` ago and have not yet
   * had their Redis keys cleaned. Used by the supervisor's cleanup pass.
   *
   * Only `status=completed` are considered. Failed / needs_review are
   * intentionally preserved so operators can inspect Redis state.
   */
  static async findCompletedForCleanup({ delayMs, limit }) {
    const cutoff = new Date(Date.now() - delayMs);
    return await FlowExecution.find({
      status: 'completed',
      redis_cleaned_at: null,
      completed_at: { $lte: cutoff }
    }).limit(limit || 50).lean();
  }

  /**
   * Stamp the doc as cleaned so the next cleanup pass skips it.
   */
  static async markRedisCleaned(executionId) {
    return await FlowExecution.updateOne(
      { execution_id: executionId },
      { $set: { redis_cleaned_at: new Date() } }
    );
  }

  /**
   * The full list of per-request_id Redis keys produced by the chatbot
   * engine. Kept in this file (not buried in the supervisor) so that any
   * future engine code that introduces a new key can be reflected here in
   * one place.
   *
   * NOTE: keep this in sync with TiledeskChatbot and IntentForm. If a new
   * `tilebot:requests:<id>:<suffix>` key appears, add the suffix here.
   */
  static redisKeysFor(requestId) {
    if (!requestId) return [];
    return [
      `tilebot:${requestId}`,
      `tilebot:requests:${requestId}:parameters`,
      `tilebot:requests:${requestId}:locked`,
      `tilebot:requests:${requestId}:action:locked`,
      `tilebot:requests:${requestId}:step`,
      `tilebot:requests:${requestId}:started`,
      `tilebot:requests:${requestId}:currentFieldIndex`,
      `tilebot:requests:${requestId}:currentForm`,
      `tilebot:botId_requests:${requestId}`
    ];
  }
}

module.exports = { FlowExecutionStore };
