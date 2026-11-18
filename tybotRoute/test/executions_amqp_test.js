'use strict';

// Needs a real broker: EXECUTIONS_TEST_AMQP_URL=amqp://guest:guest@localhost:5672
const assert = require('assert');
const URL = process.env.EXECUTIONS_TEST_AMQP_URL;
const { createAmqpTransport, EXCHANGE } = require('../executions/amqpTransport');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await wait(50); }
  return false;
}

(URL ? describe : describe.skip)('executions: amqpTransport (real broker)', function () {
  this.timeout(15000);
  let amqp, conn, ch, queue, transport;

  before(async function () {
    amqp = require('amqplib');
    conn = await amqp.connect(URL);
    ch = await conn.createChannel();
    await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
    queue = (await ch.assertQueue('', { exclusive: true })).queue;
    await ch.bindQueue(queue, EXCHANGE, 'exec.#');
  });
  after(async function () {
    if (transport) await transport.close();
    if (conn) await conn.close().catch(() => {});
  });

  async function getOne() {
    let msg = false;
    await until(async () => { msg = await ch.get(queue, { noAck: true }); return !!msg; }, 5000);
    return msg;
  }

  it('publish lands on a queue bound to exec.# with persistent + application/json', async function () {
    transport = createAmqpTransport(URL);
    assert.ok(await until(() => transport._channel(), 5000), 'connected');
    await transport.publish('exec.P1.action.start', Buffer.from('{"a":1}'));
    const msg = await getOne();
    assert.ok(msg, 'message received');
    assert.strictEqual(msg.fields.routingKey, 'exec.P1.action.start');
    assert.strictEqual(msg.properties.deliveryMode, 2);
    assert.strictEqual(msg.properties.contentType, 'application/json');
    assert.strictEqual(msg.content.toString(), '{"a":1}');
  });

  it('reconnects after a channel-level close and a later publish succeeds', async function () {
    const first = transport._channel();
    first.close(); // channel closes, the connection stays open
    await assert.rejects(() => transport.publish('exec.P1.x', Buffer.from('{}')));
    assert.ok(await until(() => transport._channel() && transport._channel() !== first, 6000), 'new channel');
    await transport.publish('exec.P1.after', Buffer.from('{"b":2}'));
    const msg = await getOne();
    assert.strictEqual(msg.fields.routingKey, 'exec.P1.after');
  });

  it('publish rejects when the confirm never arrives (timeout)', async function () {
    const t = createAmqpTransport(URL, { publishTimeoutMs: 100 });
    try {
      assert.ok(await until(() => t._channel(), 5000), 'connected');
      t._channel().publish = () => true; // swallow: no confirm callback
      const started = Date.now();
      await assert.rejects(() => t.publish('exec.P1.x', Buffer.from('{}')), /timeout/);
      assert.ok(Date.now() - started < 2000);
    } finally { await t.close(); }
  });

  it('publish rejects while disconnected', async function () {
    const t = createAmqpTransport('amqp://guest:guest@127.0.0.1:1');
    try { await assert.rejects(() => t.publish('exec.P.x', Buffer.from('{}')), /not connected/); }
    finally { await t.close(); }
  });
});
