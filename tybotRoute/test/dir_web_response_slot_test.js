'use strict';

const assert = require('assert');
const redis = require('redis');
const { TdCache } = require('../TdCache');
const { DirWebResponse } = require('../tiledeskChatbotPlugs/directives/DirWebResponse');
const { RESULT_PREFIX } = require('../utils/WebhookResult');

describe('DirWebResponse fills the sync webhook slot', function () {
  const REQ = 'support-group-slot-test-1';
  const SLOT = RESULT_PREFIX + REQ;
  let tdcache, sub, received;

  before(async () => {
    tdcache = new TdCache({ host: 'localhost', port: 6379 });
    await tdcache.connect();
    sub = redis.createClient({ url: 'redis://localhost:6379' });
    await sub.connect();
    await sub.subscribe('/webhooks/' + REQ, (m) => received.push(m));
  });

  beforeEach(async () => {
    received = [];
    await tdcache.client.del(SLOT);
  });

  afterEach(async () => {
    await tdcache.client.del(SLOT);
  });

  after(async () => {
    await sub.quit();
    await tdcache.client.quit();
    await tdcache.subscriberClient.quit();
  });

  function build(cache) {
    return new DirWebResponse({
      projectId: 'p1', requestId: REQ, token: 't',
      tdcache: cache || tdcache, supportRequest: { draft: false }, reply: {}
    });
  }

  function run(dir, action) {
    return new Promise((resolve) => dir.execute({ action }, resolve));
  }

  async function waitPublish(n = 1) {
    for (let i = 0; i < 50 && received.length < n; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  async function seedPending() {
    await tdcache.client.hSet(SLOT, { state: 'pending', webhook_id: 'w1' });
    await tdcache.client.expire(SLOT, 600);
  }

  const action = (status) => ({ status, bodyType: 'json', payload: '{"x":1}' });

  it('completes the slot and publishes', async () => {
    await seedPending();
    await run(build(), action('201'));
    await waitPublish();
    const slot = await tdcache.client.hGetAll(SLOT);
    assert.strictEqual(slot.state, 'completed');
    assert.strictEqual(slot.status, '201');
    assert.strictEqual(slot.payload, '{"x":1}');
    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0], '{"status":"201","payload":{"x":1}}');
  });

  it('writes nothing without a slot', async () => {
    await run(build(), action('201'));
    await waitPublish();
    assert.strictEqual(received.length, 1);
    assert.strictEqual(await tdcache.client.exists(SLOT), 0);
  });

  it('defaults a non-numeric status to 200', async () => {
    await seedPending();
    await run(build(), action('abc'));
    await waitPublish();
    const slot = await tdcache.client.hGetAll(SLOT);
    assert.strictEqual(slot.state, 'completed');
    assert.strictEqual(slot.status, '200');
  });

  it('keeps the first Web Response', async () => {
    await seedPending();
    await run(build(), { status: '201', bodyType: 'json', payload: '{"n":1}' });
    await run(build(), { status: '202', bodyType: 'json', payload: '{"n":2}' });
    await waitPublish(2);
    const slot = await tdcache.client.hGetAll(SLOT);
    assert.strictEqual(slot.status, '201');
    assert.strictEqual(slot.payload, '{"n":1}');
  });

  it('publishes even when the slot write fails', async () => {
    const failing = {
      client: { eval: () => Promise.reject(new Error('boom')) },
      hgetall: (k) => tdcache.hgetall(k),
      publish: (k, v) => tdcache.publish(k, v)
    };
    await run(build(failing), action('201'));
    await waitPublish();
    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0], '{"status":"201","payload":{"x":1}}');
  });
});
