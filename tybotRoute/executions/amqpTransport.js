'use strict';

const EXCHANGE = 'tiledesk.executions';
const BACKOFF_MIN_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const PUBLISH_TIMEOUT_MS = 10000;

/**
 * AMQP transport for trace events. Nothing connects on require: the connection
 * is opened lazily by createAmqpTransport() and re-opened with backoff (1s..30s)
 * whenever it drops. publish() rejects while disconnected.
 */
function createAmqpTransport(url, opts) {
  // opts.publishTimeoutMs: max wait for a broker confirm (default 10 s); also lets tests shorten it.
  const publishTimeoutMs = (opts && opts.publishTimeoutMs) || PUBLISH_TIMEOUT_MS;
  let conn = null;
  let channel = null;
  let closed = false;
  let timer = null;
  let backoff = BACKOFF_MIN_MS;

  function scheduleReconnect() {
    if (closed || timer) return;
    timer = setTimeout(() => { timer = null; connect(); }, backoff);
    if (timer.unref) timer.unref();
    backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
  }

  function lost(c) {
    // ignore events of a connection/channel that is no longer the current one
    if (c && c !== conn) return;
    const old = conn;
    channel = null;
    conn = null;
    if (old) old.close().catch(() => {});
    scheduleReconnect();
  }

  async function connect() {
    if (closed) return;
    let c = null;
    try {
      const amqp = require('amqplib');
      c = await amqp.connect(url);
      const mine = c;
      c.on('error', () => {});
      c.on('close', () => lost(mine));
      const ch = await c.createConfirmChannel();
      ch.on('error', () => {});
      // a broker-side channel close leaves the connection open: tear it down and reconnect
      ch.on('close', () => { if (channel === ch) lost(mine); });
      await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
      if (closed) { c.close().catch(() => {}); return; }
      conn = c;
      channel = ch;
      backoff = BACKOFF_MIN_MS;
    } catch (e) {
      if (c) c.close().catch(() => {});
      scheduleReconnect();
    }
  }

  connect();

  return {
    // test-only hook: gives tests the live channel to close or stub it
    _channel: () => channel,
    publish(routingKey, buffer) {
      if (!channel) return Promise.reject(new Error('amqp not connected'));
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('amqp publish confirm timeout')), publishTimeoutMs);
        if (t.unref) t.unref();
        const done = (err) => { clearTimeout(t); if (err) reject(err); else resolve(); };
        try {
          channel.publish(EXCHANGE, routingKey, buffer,
            { persistent: true, contentType: 'application/json' }, done);
        } catch (e) { clearTimeout(t); reject(e); }
      });
    },
    async close() {
      closed = true;
      if (timer) { clearTimeout(timer); timer = null; }
      const c = conn;
      channel = null;
      conn = null;
      if (c) { try { await c.close(); } catch (e) { /* ignore */ } }
    },
  };
}

module.exports = { createAmqpTransport, EXCHANGE };
