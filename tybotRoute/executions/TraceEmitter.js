'use strict';

const os = require('os');
const winston = require('../utils/winston');
const { getConfig } = require('./config');

const RETRY_MS = 1000;
const WARN_EVERY_MS = 60000;
const WINDOW = 100;
const DEFAULT_BUFFER_MAX_BYTES = 67108864;

/**
 * Non-blocking publisher: emit() only enqueues in a buffer bounded by count and
 * bytes (oldest dropped when over either cap) and never throws. Entries are
 * published in order on the transport's one channel with up to WINDOW of them
 * awaiting their confirm at once (amqplib keeps the publish order). After a
 * failure nothing new is sent; once the window has settled, the unconfirmed
 * entries go back to the head in order and a 1s timer retries. A redelivered
 * entry is harmless: ingest dedupes by event key.
 */
class TraceEmitter {
  constructor({ transport, bufferMax, bufferMaxBytes, windowMax, pod } = {}) {
    this.transport = transport;
    this.bufferMax = bufferMax > 0 ? bufferMax : 10000;
    this.bufferMaxBytes = bufferMaxBytes > 0 ? bufferMaxBytes : DEFAULT_BUFFER_MAX_BYTES;
    this.windowMax = windowMax > 0 ? windowMax : WINDOW;
    this.pod = pod || os.hostname();
    this.buffer = [];
    this.bufferBytes = 0;
    this.inFlight = 0;
    this.published = 0;
    this.dropped = 0;
    this._order = 0;
    this._failedRound = null; // unconfirmed entries of the window that saw a failure
    this._idleWaiters = [];
    this._droppedAtWarn = 0;
    this._retryTimer = null;
    this._warnTimer = null;
    this._stopped = false;
  }

  emit(envelope) {
    try {
      const entry = { routingKey: 'exec.' + envelope.id_project + '.' + envelope.type, body: Buffer.from(JSON.stringify(envelope)) };
      this.buffer.push(entry);
      this.bufferBytes += entry.body.length;
      this._enforceCaps();
      this._ensureWarn();
      if (!this._stopped) this._pump();
    } catch (e) {
      this.dropped++;
    }
  }

  /** Drops the oldest buffered entries while over the count or the byte cap. */
  _enforceCaps() {
    while (this.buffer.length > 0 && (this.buffer.length > this.bufferMax || this.bufferBytes > this.bufferMaxBytes)) {
      this.bufferBytes -= this.buffer.shift().body.length;
      this.dropped++;
    }
  }

  /** Fills the window from the head of the buffer; paused during a failed round and until the retry. */
  _pump() {
    while (this.buffer.length > 0 && this.inFlight < this.windowMax && !this._failedRound && !this._retryTimer) {
      const entry = this.buffer.shift();
      this.bufferBytes -= entry.body.length;
      const order = this._order++;
      this.inFlight++;
      let p;
      try {
        p = Promise.resolve(this.transport.publish(entry.routingKey, entry.body));
      } catch (e) {
        p = Promise.reject(e);
      }
      p.then(() => {
        this.published++;
        this._settled();
      }, () => {
        (this._failedRound = this._failedRound || []).push({ order, entry });
        this._settled();
      });
    }
    this._wakeIfIdle();
  }

  _settled() {
    this.inFlight--;
    if (this._failedRound) {
      if (this.inFlight > 0) return;
      const back = this._failedRound.sort((a, b) => a.order - b.order).map((r) => r.entry);
      this._failedRound = null;
      this.buffer.unshift(...back);
      for (const entry of back) this.bufferBytes += entry.body.length;
      this._enforceCaps();
      this._scheduleRetry();
      this._wake();
      return;
    }
    if (!this._stopped) this._pump();
    else this._wakeIfIdle();
  }

  _wakeIfIdle() {
    if (this.inFlight === 0 && (this.buffer.length === 0 || this._retryTimer || this._stopped)) this._wake();
  }

  _wake() {
    const waiters = this._idleWaiters;
    this._idleWaiters = [];
    for (const w of waiters) w();
  }

  _scheduleRetry() {
    if (this._retryTimer || this._stopped) return;
    this._retryTimer = setTimeout(() => { this._retryTimer = null; this._pump(); }, RETRY_MS);
    if (this._retryTimer.unref) this._retryTimer.unref();
  }

  _ensureWarn() {
    if (this._warnTimer || this._stopped) return;
    this._warnTimer = setInterval(() => {
      if (this.dropped > this._droppedAtWarn) {
        winston.warn('(TraceEmitter) trace events dropped (buffer full): total ' + this.dropped + ', +' + (this.dropped - this._droppedAtWarn) + ' in the last minute');
        this._droppedAtWarn = this.dropped;
      }
    }, WARN_EVERY_MS);
    if (this._warnTimer.unref) this._warnTimer.unref();
  }

  /**
   * Publishes buffered entries now (skipping a pending retry wait), in order. Resolves when the
   * buffer is empty and nothing is in flight, or when a failed round has put its entries back.
   */
  flush() {
    return new Promise((resolve) => {
      this._idleWaiters.push(resolve);
      if (this._retryTimer && !this._failedRound) { clearTimeout(this._retryTimer); this._retryTimer = null; }
      const stopped = this._stopped;
      this._stopped = false;
      try { this._pump(); } finally { this._stopped = stopped; }
    });
  }

  stats() {
    return { published: this.published, dropped: this.dropped, buffered: this.buffer.length, bufferedBytes: this.bufferBytes, inFlight: this.inFlight };
  }

  /** Stops timers (tests / shutdown). */
  stop() {
    this._stopped = true;
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
    if (this._warnTimer) { clearInterval(this._warnTimer); this._warnTimer = null; }
  }
}

const NOOP_TRANSPORT = { publish: async () => {}, close: async () => {} };

let singleton = null;

function getEmitter() {
  if (singleton) return singleton;
  let transport = NOOP_TRANSPORT;
  let bufferMax;
  let bufferMaxBytes;
  try {
    const cfg = getConfig();
    bufferMax = cfg.bufferMax;
    bufferMaxBytes = cfg.bufferMaxBytes;
    if (cfg.amqpUrl) transport = require('./amqpTransport').createAmqpTransport(cfg.amqpUrl);
  } catch (e) {
    winston.warn('(TraceEmitter) transport setup failed: ' + (e && e.message));
  }
  singleton = new TraceEmitter({ transport, bufferMax, bufferMaxBytes, pod: os.hostname() });
  return singleton;
}

function setEmitterForTests(emitter) {
  singleton = emitter || null;
}

function buildEnvelope({ ctx, seq, type, data }) {
  return {
    event_version: 1,
    type,
    execution_id: ctx.execution_id,
    seq,
    at: new Date().toISOString(),
    id_project: ctx.id_project,
    agent_id: ctx.agent_id,
    agent_version: ctx.agent_version,
    request_id: ctx.request_id,
    pod: os.hostname(),
    data,
  };
}

module.exports = { TraceEmitter, getEmitter, setEmitterForTests, buildEnvelope };
