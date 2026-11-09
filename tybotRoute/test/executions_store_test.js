'use strict';

const assert = require('assert');
const redis = require('redis');
const { ExecutionStore } = require('../executions/ExecutionStore');

describe('ExecutionStore', function () {
  let client, store;
  const run = Math.random().toString(36).slice(2, 10);
  const reqs = [];
  const execs = new Set();
  function rid(n) { const r = `store-${run}-${n}`; reqs.push(r); return r; }
  const meta = { id_project: 'P1', agent_version: 'v1', agent_name: 'Bot', test: false, trigger: { type: 'widget' } };

  before(async function () {
    client = redis.createClient({ url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}` });
    await client.connect();
    store = new ExecutionStore(client);
  });
  after(async function () {
    for (const r of reqs) {
      for (const k of await client.keys(`exec:req:${r}:*`)) await client.del(k);
      await client.del(`exec:handoff:${r}`);
    }
    for (const id of execs) for (const k of [`exec:${id}`, `exec:${id}:seq`, `exec:${id}:state`]) await client.del(k);
    await client.quit();
  });
  async function make(r, agent) {
    const x = await store.resolve({ requestId: r, agentId: agent, meta });
    execs.add(x.executionId);
    return x;
  }

  it('resolve creates then reuses', async function () {
    const r = rid('a');
    const a = await make(r, 'A');
    assert.strictEqual(a.created, true);
    assert.strictEqual(a.previousExecutionId, null);
    assert.strictEqual(a.parentExecutionId, null);
    assert.ok(/^[0-9a-f-]{36}$/.test(a.executionId));
    const b = await make(r, 'A');
    assert.strictEqual(b.created, false);
    assert.strictEqual(b.executionId, a.executionId);
    const h = await client.hGetAll(`exec:${a.executionId}`);
    assert.strictEqual(h.status, 'running');
    assert.strictEqual(h.id_project, 'P1');
    assert.strictEqual(h.agent_id, 'A');
    assert.strictEqual(h.test, 'false');
    assert.strictEqual(h.request_id, r);
    assert.deepStrictEqual(JSON.parse(h.trigger), { type: 'widget' });
    assert.ok(await client.ttl(`exec:req:${r}:A`) > 0);
    assert.ok(await client.ttl(`exec:${a.executionId}`) > 0);
  });

  it('ExecutionStore resolve is single under concurrency', async function () {
    const r = rid('c');
    const all = await Promise.all(Array.from({ length: 10 }, () => store.resolve({ requestId: r, agentId: 'A', meta })));
    all.forEach(x => execs.add(x.executionId));
    assert.strictEqual(new Set(all.map(x => x.executionId)).size, 1);
    assert.strictEqual(all.filter(x => x.created).length, 1);
  });

  it('hinted id wins when it exists', async function () {
    const r = rid('h');
    const a = await make(r, 'A');
    const other = await make(rid('h2'), 'A');
    const x = await store.resolve({ requestId: r, agentId: 'A', hintedExecutionId: other.executionId, meta });
    assert.strictEqual(x.executionId, other.executionId);
    assert.strictEqual(x.created, false);
    const y = await store.resolve({ requestId: r, agentId: 'A', hintedExecutionId: 'missing-id', meta });
    assert.strictEqual(y.executionId, a.executionId);
  });

  it('terminal status starts a new execution with previousExecutionId', async function () {
    for (const st of ['completed', 'failed', 'destroyed']) {
      const r = rid('t' + st);
      const a = await make(r, 'A');
      await store.setStatusHint(a.executionId, st);
      const b = await make(r, 'A');
      assert.strictEqual(b.created, true);
      assert.notStrictEqual(b.executionId, a.executionId);
      assert.strictEqual(b.previousExecutionId, a.executionId);
      const c = await make(r, 'A');
      assert.strictEqual(c.created, false);
      assert.strictEqual(c.executionId, b.executionId);
    }
  });

  it('alias resolves a subagent to the parent execution', async function () {
    const r = rid('s');
    const a = await make(r, 'A');
    await store.setAlias(r, 'SUB', a.executionId);
    const x = await store.resolve({ requestId: r, agentId: 'SUB', meta });
    assert.strictEqual(x.executionId, a.executionId);
    assert.strictEqual(x.created, false);
    await store.deleteAlias(r, 'SUB');
    assert.strictEqual(await client.exists(`exec:req:${r}:SUB`), 0);
  });

  it('handoff gives parentExecutionId once', async function () {
    const r = rid('ho');
    await store.setHandoff(r, { parent_execution_id: 'PARENT', to_agent_id: 'B' });
    assert.ok(await client.ttl(`exec:handoff:${r}`) > 0);
    const wrong = await make(r, 'A');
    assert.strictEqual(wrong.parentExecutionId, null);
    assert.strictEqual(await client.exists(`exec:handoff:${r}`), 1);
    const b = await make(r, 'B');
    assert.strictEqual(b.created, true);
    assert.strictEqual(b.parentExecutionId, 'PARENT');
    assert.strictEqual(await client.exists(`exec:handoff:${r}`), 0);
    const r2 = rid('ho2');
    const again = await make(r2, 'B');
    assert.strictEqual(again.parentExecutionId, null);
  });

  it('nextSeq counts from 1', async function () {
    const a = await make(rid('q'), 'A');
    assert.strictEqual(await store.nextSeq(a.executionId), 1);
    assert.strictEqual(await store.nextSeq(a.executionId), 2);
    assert.ok(await client.ttl(`exec:${a.executionId}:seq`) > 0);
  });

  it('state and agent stack round trip', async function () {
    const a = await make(rid('st'), 'A');
    assert.strictEqual(await store.getState(a.executionId), null);
    const v = { step_seq: 3, raw: { x: 1 }, blocks_since_kf: 2, delta_bytes_since_kf: 10 };
    await store.setState(a.executionId, v);
    assert.deepStrictEqual(await store.getState(a.executionId), v);
    assert.strictEqual(await store.popFrame(a.executionId), null);
    await store.pushFrame(a.executionId, { agent_id: 'S1' });
    await store.pushFrame(a.executionId, { agent_id: 'S2' });
    assert.deepStrictEqual(await store.popFrame(a.executionId), { agent_id: 'S2' });
    assert.deepStrictEqual(await store.popFrame(a.executionId), { agent_id: 'S1' });
    assert.strictEqual(await store.popFrame(a.executionId), null);
  });

  it('resolve returns null when the client throws', async function () {
    const bad = new Proxy({}, { get: () => () => { throw new Error('boom'); } });
    const s = new ExecutionStore(bad);
    assert.strictEqual(await s.resolve({ requestId: 'r', agentId: 'A', meta }), null);
    assert.strictEqual(await s.nextSeq('x'), null);
    assert.strictEqual(await s.getState('x'), null);
    assert.strictEqual(await s.popFrame('x'), null);
    await s.setState('x', {});
    await s.setAlias('r', 'a', 'x');
    await s.deleteAlias('r', 'a');
    await s.pushFrame('x', {});
    await s.setHandoff('r', {});
    await s.setStatusHint('x', 'failed');
  });
});
