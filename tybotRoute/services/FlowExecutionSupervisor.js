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
  constructor({ resumeFn, intervalMs, leaseTtlMs, batchSize, maxAttempts, resumeTimeoutMs, redisClient, cleanupEnabled, cleanupDelayMs, cleanupBatchSize }) {
    if (typeof resumeFn !== 'function') {
      throw new Error('FlowExecutionSupervisor: resumeFn(doc) is required');
    }
    this.resumeFn = resumeFn;
    this.intervalMs = intervalMs || 10_000;
    this.leaseTtlMs = leaseTtlMs || 60_000;
    this.batchSize = batchSize || 10;
    this.maxAttempts = maxAttempts || 5;
    // Hard upper bound for a single resume. If exceeded we abandon the
    // attempt, release the lease, and let recoverStuckLeases route the
    // doc to needs_review on the next tick.
    //
    // Why this exists: a buggy/trashed/deleted bot can cause resumeFn to
    // hang forever (e.g. DirIntent firing an HTTP call that never returns
    // because the target intent is missing, or a callback never invoked).
    // One such "poison pill" was enough to freeze the entire supervisor —
    // _tick sets this.running=true, the awaited resume never resolves,
    // every subsequent tick returns early at the running-guard, and the
    // backlog grows unbounded.
    //
    // Default 30s comfortably exceeds normal resume latency (a few ms to
    // a few hundred ms) but stops poison pills from cascading.
    this.resumeTimeoutMs = resumeTimeoutMs || 30_000;
    this.workerId = `${os.hostname()}:${process.pid}:${uuidv4().substring(0, 8)}`;
    this.timer = null;
    this.running = false;
    this.shutdownRequested = false;

    // Cleanup config — optional, off if no redisClient provided.
    this.redisClient = redisClient || null;
    this.cleanupEnabled = cleanupEnabled !== false && !!this.redisClient;
    this.cleanupDelayMs = cleanupDelayMs || 600_000;   // 10 min
    this.cleanupBatchSize = cleanupBatchSize || 50;
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
      // Resume pass — claim and run due executions
      for (let i = 0; i < this.batchSize; i++) {
        if (this.shutdownRequested) break;
        const doc = await FlowExecutionStore.claimDue(this.workerId, this.leaseTtlMs);
        if (!doc) break;
        await this._resume(doc);
      }
      // Cleanup pass — delete Redis keys for executions completed >delay ago
      if (this.cleanupEnabled && !this.shutdownRequested) {
        await this._cleanupCompleted();
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * Cleanup pass — delete the per-request_id Redis keys for executions
   * that have been completed for longer than `cleanupDelayMs`. The delay
   * gives any async post-completion writers (transcripts, loggers) time
   * to finish before we wipe the slate.
   *
   * Failed / needs_review executions are NOT cleaned up here so operators
   * can still inspect the Redis state during troubleshooting.
   *
   * The Mongo doc itself is never deleted — it's the audit trail. Only
   * Redis keys are reclaimed, which is where the bulk of the long-term
   * disk growth lives (especially the :parameters hash).
   */
  async _cleanupCompleted() {
    let cleaned = 0;
    try {
      const docs = await FlowExecutionStore.findCompletedForCleanup({
        delayMs: this.cleanupDelayMs,
        limit: this.cleanupBatchSize
      });
      for (const doc of docs) {
        if (this.shutdownRequested) break;
        const keys = FlowExecutionStore.redisKeysFor(doc.request_id);
        if (!keys.length) continue;
        try {
          // node-redis client.del accepts a variadic array. Single
          // round-trip per execution. DEL is O(1) per key and ignores
          // non-existent ones, so it's safe to delete the full set even
          // if some keys never existed for this particular execution.
          await this.redisClient.del(keys);
          await FlowExecutionStore.markRedisCleaned(doc.execution_id);
          cleaned++;
        } catch (err) {
          winston.error(`(FlowExecutionSupervisor) cleanup failed for ${doc.execution_id}:`, err);
          // Leave redis_cleaned_at unset so we retry on the next tick.
        }
      }
      if (cleaned > 0) {
        winston.info(`(FlowExecutionSupervisor) cleanup pass freed Redis keys for ${cleaned} completed executions`);
      }
    } catch (err) {
      winston.error('(FlowExecutionSupervisor) cleanup pass error:', err);
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
      // Promise.race against a hard timeout so a hung resume can't lock
      // the supervisor. The losing promise (whichever it is) doesn't get
      // cancelled — Node has no cancellation primitive — but the await
      // returns and the next iteration of the resume loop proceeds. The
      // orphaned promise eventually settles in the background; its
      // failure handler is a no-op because we already released the lease.
      const TIMEOUT = Symbol('resume-timeout');
      let timer;
      const timeoutPromise = new Promise(resolve => {
        timer = setTimeout(() => resolve(TIMEOUT), this.resumeTimeoutMs);
      });
      // Swallow late settlements from a timed-out resumeFn so they don't
      // surface as unhandledRejection long after we've moved on.
      const wrappedResume = Promise.resolve()
        .then(() => this.resumeFn(doc))
        .catch(err => { winston.warn(`(FlowExecutionSupervisor) late resume rejection for ${exec_id}:`, err && err.message); });
      const result = await Promise.race([wrappedResume, timeoutPromise]);
      clearTimeout(timer);
      if (result === TIMEOUT) {
        // Throw into the catch block below so we get the standard
        // "release lease + record last_error + back off" treatment.
        throw new Error(`resumeFn exceeded ${this.resumeTimeoutMs}ms timeout`);
      }
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
