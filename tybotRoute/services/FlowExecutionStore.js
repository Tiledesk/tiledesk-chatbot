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
  static async beginDirective(executionId, { directiveIndex, directiveName, expectedTimeoutMs }) {
    const now = new Date();
    return await FlowExecution.findOneAndUpdate(
      { execution_id: executionId },
      {
        $set: {
          'current.directive_index': directiveIndex,
          'current.directive_name': directiveName,
          'current.started_at': now,
          'current.expected_end_at': new Date(now.getTime() + (expectedTimeoutMs || 5000)),
          updated_at: now
        }
      },
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
}

module.exports = { FlowExecutionStore };
