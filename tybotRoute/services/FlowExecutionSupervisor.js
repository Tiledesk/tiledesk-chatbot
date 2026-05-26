const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { FlowExecutionStore } = require('./FlowExecutionStore');
const winston = require('../utils/winston');

/**
 * FlowExecutionSupervisor — periodic worker that resumes due flow_executions.
 *
 * A run is "due" when:
 *   - status = 'running'
 *   - current.expected_end_at <= now
 *   - no active lease (or lease expired)
 *
 * Polling cadence (default 10s) trades freshness for Mongo load. Tune via
 * env. The atomic `claimDue` uses findOneAndUpdate so concurrent
 * supervisors across replicas don't double-process the same execution.
 *
 * Resume strategy:
 *   - For WAIT-derived deadlines, the engine already advanced
 *     `current.directive_index` to the directive AFTER the wait, so
 *     resumeFromIndex(idx) just runs the next directive.
 *   - For non-WAIT (mid-execute crash), `current.directive_index` points
 *     at the crashed directive itself. resumeFromIndex(idx) re-enters it.
 *     The idempotency log prevents double side-effects.
 *
 * Resume runtime is provided by the caller via the `resumeFn` callback,
 * which knows how to reconstruct the chatbot + DirectivesChatbotPlug for
 * a given FlowExecution doc. (Keeping that out of this file avoids
 * circular imports with the engine.)
 */
class FlowExecutionSupervisor {
  constructor({ resumeFn, intervalMs, leaseTtlMs, batchSize, maxAttempts }) {
    if (typeof resumeFn !== 'function') {
      throw new Error('FlowExecutionSupervisor: resumeFn(doc) is required');
    }
    this.resumeFn = resumeFn;
    this.intervalMs = intervalMs || 10_000;
    this.leaseTtlMs = leaseTtlMs || 60_000;
    this.batchSize = batchSize || 10;
    this.maxAttempts = maxAttempts || 5;
    this.workerId = `${os.hostname()}:${process.pid}:${uuidv4().substring(0, 8)}`;
    this.timer = null;
    this.running = false;
    this.shutdownRequested = false;
  }

  start() {
    if (this.timer) {
      winston.warn('(FlowExecutionSupervisor) already running');
      return;
    }
    winston.info(`(FlowExecutionSupervisor) starting worker=${this.workerId} interval=${this.intervalMs}ms`);
    this.timer = setInterval(() => {
      this._tick().catch(err => winston.error('(FlowExecutionSupervisor) tick error:', err));
    }, this.intervalMs);
    // Kick once immediately for shorter cold-start latency
    this._tick().catch(err => winston.error('(FlowExecutionSupervisor) initial tick error:', err));
  }

  async stop() {
    this.shutdownRequested = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Wait for in-flight tick to finish (bounded)
    let waited = 0;
    while (this.running && waited < 30_000) {
      await new Promise(r => setTimeout(r, 100));
      waited += 100;
    }
    winston.info('(FlowExecutionSupervisor) stopped');
  }

  async _tick() {
    if (this.running || this.shutdownRequested) return;
    this.running = true;
    try {
      await FlowExecutionStore.recoverStuckLeases();
      for (let i = 0; i < this.batchSize; i++) {
        if (this.shutdownRequested) break;
        const doc = await FlowExecutionStore.claimDue(this.workerId, this.leaseTtlMs);
        if (!doc) break;
        await this._resume(doc);
      }
    } finally {
      this.running = false;
    }
  }

  async _resume(doc) {
    const exec_id = doc.execution_id;
    winston.info(`(FlowExecutionSupervisor) resuming execution=${exec_id} index=${doc.current?.directive_index} attempts=${doc.attempts}`);
    try {
      if (doc.attempts > this.maxAttempts) {
        winston.warn(`(FlowExecutionSupervisor) max attempts exceeded for ${exec_id}; marking failed`);
        await FlowExecutionStore.markFailed(exec_id, new Error('max attempts exceeded'));
        return;
      }
      await this.resumeFn(doc);
      // The engine itself advances `current` and marks completed when the
      // last directive runs. So we don't unconditionally markCompleted
      // here. We just release the lease as a safety net in case the
      // engine took a non-final path (e.g. another WAIT).
      await FlowExecutionStore.releaseLease(exec_id);
    } catch (err) {
      winston.error(`(FlowExecutionSupervisor) resume failed for ${exec_id}:`, err);
      // Bump deadline forward to avoid a hot retry loop. The retry policy
      // is "exponential-ish": push the deadline by 30s per attempt, capped
      // at 5 min.
      const backoffMs = Math.min(30_000 * (doc.attempts || 1), 300_000);
      try {
        // Reuse beginDirective to slide the deadline; do not bump the index.
        await FlowExecutionStore.beginDirective(exec_id, {
          directiveIndex: doc.current.directive_index,
          directiveName: doc.current.directive_name,
          expectedTimeoutMs: backoffMs
        });
        // Record latest error message for ops visibility (markFailed only
        // fires after maxAttempts; until then we still want to see what's
        // breaking).
        const FlowExecution = require('../models/flow_execution');
        await FlowExecution.updateOne(
          { execution_id: exec_id },
          { $set: { last_error: err && err.message ? err.message : String(err) } }
        );
        await FlowExecutionStore.releaseLease(exec_id);
      } catch (e2) {
        winston.error(`(FlowExecutionSupervisor) backoff update failed for ${exec_id}:`, e2);
      }
    }
  }
}

module.exports = { FlowExecutionSupervisor };
