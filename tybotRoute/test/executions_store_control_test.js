'use strict';

const assert = require('assert');
const redis = require('redis');
const { ExecutionStore } = require('../executions/ExecutionStore');
const { getConfig } = require('../executions/config');

describe('ExecutionStore control keys', function () {
  let client, store;
  const run = Math.random().toString(36).slice(2, 10);
  const ids = [];
  function eid(n) { const id = `ctl-${run}-${n}`; ids.push(id); return id; }

  before(async function () {
    client = redis.createClient({ url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}` });
    await client.connect();
    store = new ExecutionStore(client);
  });
  after(async function () {
    for (const id of ids) for (const s of ['stop', 'owner', 'transit']) await client.del(`exec:${id}:${s}`);
    await client.quit();
  });

  it('getStop returns null, then the value set by SET exec:{id}:stop hard', async function () {
    const id = eid('stop');
    assert.strictEqual(await store.getStop(id), null);
    await client.set(`exec:${id}:stop`, 'hard', { EX: 60 });
    assert.strictEqual(await store.getStop(id), 'hard');
    await client.set(`exec:${id}:stop`, 'soft', { EX: 60 });
    assert.strictEqual(await store.getStop(id), 'soft');
  });

  it('acquireLease is exclusive: second pod gets false', async function () {
    const id = eid('lease');
    assert.strictEqual(await store.acquireLease(id, 'podA', 15000), true);
    assert.strictEqual(await store.acquireLease(id, 'podB', 15000), false);
    assert.strictEqual(await client.get(`exec:${id}:owner`), 'podA');
    const pttl = await client.pTTL(`exec:${id}:owner`);
    assert.ok(pttl > 14000 && pttl <= 15000, `pttl ${pttl}`);
  });

  it('renewLease extends for the owner only; a non-owner does not extend the TTL', async function () {
    const id = eid('renew');
    await store.acquireLease(id, 'podA', 3000);
    assert.strictEqual(await store.renewLease(id, 'podB', 60000), false);
    assert.ok(await client.pTTL(`exec:${id}:owner`) <= 3000);
    assert.strictEqual(await store.renewLease(id, 'podA', 60000), true);
    assert.ok(await client.pTTL(`exec:${id}:owner`) > 3000);
  });

  it('renewLease acquires an absent key (acquire-or-renew) and never takes another pod\'s', async function () {
    const id = eid('renew-none');
    assert.strictEqual(await store.renewLease(id, 'podA', 3000), true, 'absent: acquired');
    assert.strictEqual(await client.get(`exec:${id}:owner`), 'podA');
    const pttl = await client.pTTL(`exec:${id}:owner`);
    assert.ok(pttl > 0 && pttl <= 3000, `PX set, pttl ${pttl}`);
    assert.strictEqual(await store.renewLease(id, 'podB', 3000), false, 'owned by another pod');
    assert.strictEqual(await client.get(`exec:${id}:owner`), 'podA');
  });

  it('releaseLease by a non-owner keeps the key; by the owner deletes it', async function () {
    const id = eid('release');
    await store.acquireLease(id, 'podA', 15000);
    await store.releaseLease(id, 'podB');
    assert.strictEqual(await client.get(`exec:${id}:owner`), 'podA');
    await store.releaseLease(id, 'podA');
    assert.strictEqual(await client.get(`exec:${id}:owner`), null);
  });

  it('setTransit sets PX ≈ 120000; clearTransit deletes it', async function () {
    const id = eid('transit');
    await store.setTransit(id, 120000);
    const pttl = await client.pTTL(`exec:${id}:transit`);
    assert.ok(pttl > 119000 && pttl <= 120000, `pttl ${pttl}`);
    assert.ok(Number.isFinite(Number(await client.get(`exec:${id}:transit`))));
    await store.clearTransit(id);
    assert.strictEqual(await client.exists(`exec:${id}:transit`), 0);
  });

  describe('config', function () {
    const keys = ['EXECUTIONS_LEASE_MS', 'EXECUTIONS_HEARTBEAT_MS', 'EXECUTIONS_TRANSIT_MS'];
    const saved = {};
    beforeEach(function () { keys.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; }); });
    afterEach(function () { keys.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }); });

    it('config defaults 15000/5000/120000', function () {
      const c = getConfig();
      assert.strictEqual(c.leaseMs, 15000);
      assert.strictEqual(c.heartbeatMs, 5000);
      assert.strictEqual(c.transitMs, 120000);
    });
    it('config reads the env overrides', function () {
      process.env.EXECUTIONS_LEASE_MS = '1000';
      process.env.EXECUTIONS_HEARTBEAT_MS = '200';
      process.env.EXECUTIONS_TRANSIT_MS = '3000';
      const c = getConfig();
      assert.deepStrictEqual([c.leaseMs, c.heartbeatMs, c.transitMs], [1000, 200, 3000]);
    });
  });

  it('methods resolve null/false when the client rejects', async function () {
    const bad = () => Promise.reject(new Error('down'));
    const s = new ExecutionStore({ get: bad, set: bad, del: bad, eval: bad, pExpire: bad });
    assert.strictEqual(await s.getStop('x'), null);
    assert.strictEqual(await s.acquireLease('x', 'p', 1000), false);
    assert.strictEqual(await s.renewLease('x', 'p', 1000), null, 'a Redis error is not a lost lease');
    assert.strictEqual(await s.releaseLease('x', 'p'), undefined);
    assert.strictEqual(await s.setTransit('x', 1000), undefined);
    assert.strictEqual(await s.clearTransit('x'), undefined);
  });
});
