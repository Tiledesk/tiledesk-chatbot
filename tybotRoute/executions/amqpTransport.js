'use strict';

const EXCHANGE = 'tiledesk.executions';
const BACKOFF_MIN_MS = 1000;
const BACKOFF_MAX_MS = 30000;

/**
 * AMQP transport for trace events. Nothing connects on require: the connection
 * is opened lazily by createAmqpTransport() and re-opened with backoff (1s..30s)
 * whenever it drops. publish() rejects while disconnected.
 */
function createAmqpTransport(url) {
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

  function lost() {
    channel = null;
    conn = null;
    scheduleReconnect();
  }

  async function connect() {
    if (closed) return;
    try {
      const amqp = require('amqplib');
      const c = await amqp.connect(url);
      c.on('error', () => {});
      c.on('close', lost);
      const ch = await c.createConfirmChannel();
      ch.on('error', () => {});
      await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
      if (closed) { c.close().catch(() => {}); return; }
      conn = c;
      channel = ch;
      backoff = BACKOFF_MIN_MS;
    } catch (e) {
      scheduleReconnect();
    }
  }

  connect();

  return {
    publish(routingKey, buffer) {
      if (!channel) return Promise.reject(new Error('amqp not connected'));
      return new Promise((resolve, reject) => {
        try {
          channel.publish(EXCHANGE, routingKey, buffer,
            { persistent: true, contentType: 'application/json' },
            (err) => (err ? reject(err) : resolve()));
        } catch (e) { reject(e); }
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
