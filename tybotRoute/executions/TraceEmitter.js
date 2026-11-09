'use strict';

const os = require('os');
const winston = require('../utils/winston');
const { getConfig } = require('./config');

const RETRY_MS = 1000;
const WARN_EVERY_MS = 60000;

/**
 * Non-blocking publisher: emit() only enqueues in a bounded buffer (oldest
 * dropped when full) and never throws. A drain loop publishes in order; on a
 * transport failure the entry returns to the head and a 1s timer retries.
 */
class TraceEmitter {
  constructor({ transport, bufferMax, pod } = {}) {
    this.transport = transport;
    this.bufferMax = bufferMax > 0 ? bufferMax : 10000;
    this.pod = pod || os.hostname();
    this.buffer = [];
    this.published = 0;
    this.dropped = 0;
    this._droppedAtWarn = 0;
    this._draining = null;
    this._retryTimer = null;
    this._warnTimer = null;
    this._stopped = false;
  }

  emit(envelope) {
    try {
      const entry = { routingKey: 'exec.' + envelope.id_project + '.' + envelope.type, body: Buffer.from(JSON.stringify(envelope)) };
      this.buffer.push(entry);
      while (this.buffer.length > this.bufferMax) {
        this.buffer.shift();
        this.dropped++;
      }
      this._ensureWarn();
      this._kick();
    } catch (e) {
      this.dropped++;
    }
  }

  _kick() {
    if (this._draining || this._stopped) return;
    this._draining = this._drain().then(() => { this._draining = null; }, () => { this._draining = null; });
  }

  async _drain() {
    while (this.buffer.length > 0) {
      const entry = this.buffer.shift();
      try {
        await this.transport.publish(entry.routingKey, entry.body);
        this.published++;
      } catch (e) {
        // back to the head, unless the buffer filled meanwhile (oldest is dropped)
        if (this.buffer.length < this.bufferMax) this.buffer.unshift(entry);
        else this.dropped++;
        this._scheduleRetry();
        return false;
      }
    }
    return true;
  }

  _scheduleRetry() {
    if (this._retryTimer || this._stopped) return;
    this._retryTimer = setTimeout(() => { this._retryTimer = null; this._kick(); }, RETRY_MS);
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

  /** Publishes buffered entries now, in order. Resolves when the buffer is empty or the transport fails. */
  async flush() {
    if (this._draining) { try { await this._draining; } catch (e) { /* ignore */ } }
    try { await this._drain(); } catch (e) { /* ignore */ }
  }

  stats() {
    return { published: this.published, dropped: this.dropped, buffered: this.buffer.length };
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
  try {
    const cfg = getConfig();
    bufferMax = cfg.bufferMax;
    if (cfg.amqpUrl) transport = require('./amqpTransport').createAmqpTransport(cfg.amqpUrl);
  } catch (e) {
    winston.warn('(TraceEmitter) transport setup failed: ' + (e && e.message));
  }
  singleton = new TraceEmitter({ transport, bufferMax, pod: os.hostname() });
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
