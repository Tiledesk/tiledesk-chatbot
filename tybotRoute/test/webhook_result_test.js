'use strict';

const assert = require('assert');
const redis = require('redis');
const { completeIfPending, finishIfPending, RESULT_PREFIX } = require('../utils/WebhookResult');

describe('WebhookResult slot helper', function () {
  let client;
  const KEYS = ['r1', 'r2'].map((r) => RESULT_PREFIX + r);

  before(async () => {
    client = redis.createClient({ url: 'redis://localhost:6379' });
    await client.connect();
  });

  beforeEach(async () => {
    await client.del(KEYS);
    await client.hSet(RESULT_PREFIX + 'r1', { state: 'pending', webhook_id: 'w1' });
    await client.expire(RESULT_PREFIX + 'r1', 600);
  });

  afterEach(async () => {
    delete process.env.WEBHOOK_RESULT_MAX_BYTES;
    await client.del(KEYS);
  });

  after(async () => {
    await client.quit();
  });

  it('completes a pending slot', async () => {
    assert.strictEqual(await completeIfPending(client, 'r1', { status: 201, payload: { a: 1 } }), true);
    const h = await client.hGetAll(RESULT_PREFIX + 'r1');
    assert.strictEqual(h.state, 'completed');
    assert.strictEqual(h.status, '201');
    assert.strictEqual(h.payload, '{"a":1}');
    assert.ok(h.updated_at);
  });

  it('keeps the first Web Response', async () => {
    await completeIfPending(client, 'r1', { status: 201, payload: { a: 1 } });
    assert.strictEqual(await completeIfPending(client, 'r1', { status: 202, payload: { b: 2 } }), false);
    const h = await client.hGetAll(RESULT_PREFIX + 'r1');
    assert.strictEqual(h.status, '201');
    assert.strictEqual(h.payload, '{"a":1}');
  });

  it('writes nothing without a slot', async () => {
    assert.strictEqual(await completeIfPending(client, 'r2', { status: 200, payload: {} }), false);
    assert.strictEqual(await client.exists(RESULT_PREFIX + 'r2'), 0);
  });

  it('defaults a non-numeric status to 200', async () => {
    for (const s of ['', 'abc']) {
      await client.hSet(RESULT_PREFIX + 'r1', 'state', 'pending');
      await completeIfPending(client, 'r1', { status: s, payload: {} });
      assert.strictEqual((await client.hGetAll(RESULT_PREFIX + 'r1')).status, '200');
    }
  });

  it('marks a payload over the cap', async () => {
    process.env.WEBHOOK_RESULT_MAX_BYTES = '5';
    await completeIfPending(client, 'r1', { status: 200, payload: { long: 'value' } });
    const h = await client.hGetAll(RESULT_PREFIX + 'r1');
    assert.strictEqual(h.payload_too_large, 'true');
    assert.strictEqual('payload' in h, false);
    assert.strictEqual(h.state, 'completed');
  });

  it('keeps the TTL', async () => {
    await completeIfPending(client, 'r1', { status: 200, payload: {} });
    assert.ok((await client.ttl(RESULT_PREFIX + 'r1')) > 500);
  });

  it('finishIfPending writes replaced_by', async () => {
    assert.strictEqual(await finishIfPending(client, 'r1', 'replaced', { replaced_by: 'r9' }), true);
    const h = await client.hGetAll(RESULT_PREFIX + 'r1');
    assert.strictEqual(h.state, 'replaced');
    assert.strictEqual(h.replaced_by, 'r9');
    assert.strictEqual(await finishIfPending(client, 'r1', 'failed'), false);
  });
});
