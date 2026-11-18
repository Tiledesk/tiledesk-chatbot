'use strict';

const assert = require('assert');
const redis = require('redis');
const winston = require('../utils/winston');
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
    // a gone hint is a continuation of nothing: not attached to the request key's execution (M3)
    const y = await store.resolve({ requestId: r, agentId: 'A', hintedExecutionId: 'missing-id', meta });
    assert.strictEqual(y, null);
    assert.strictEqual(await client.get(`exec:req:${r}:A`), a.executionId);
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

  it('noCreate resolves only a live execution, and writes nothing otherwise', async function () {
    const r = rid('nc');
    assert.strictEqual(await store.resolve({ requestId: r, agentId: 'A', meta, noCreate: true }), null);
    assert.strictEqual(await client.exists(`exec:req:${r}:A`), 0);
    const a = await make(r, 'A');
    const x = await store.resolve({ requestId: r, agentId: 'A', meta, noCreate: true });
    assert.strictEqual(x.executionId, a.executionId);
    await store.setStatusHint(a.executionId, 'completed');
    assert.strictEqual(await store.resolve({ requestId: r, agentId: 'A', meta, noCreate: true }), null);
    assert.strictEqual(await client.get(`exec:req:${r}:A`), a.executionId, 'request key untouched');
  });

  it('nextSeq counts from 1', async function () {
    const a = await make(rid('q'), 'A');
    assert.strictEqual(await store.nextSeq(a.executionId), 1);
    assert.strictEqual(await store.nextSeq(a.executionId), 2);
    assert.ok(await client.ttl(`exec:${a.executionId}:seq`) > 0);
  });

  it('nextSeq refreshes the TTL on every INCR, in the same round trip', async function () {
    const a = await make(rid('qt'), 'A');
    const key = `exec:${a.executionId}:seq`;
    assert.strictEqual(await store.nextSeq(a.executionId), 1);
    // a key restored with a short TTL, or one about to expire: the next INCR gives it the full week again
    await client.expire(key, 30);
    assert.strictEqual(await store.nextSeq(a.executionId), 2);
    assert.ok(await client.ttl(key) > 604000, 'TTL refreshed on a later INCR');
    // a seq key without a TTL (raised by hand, say) gets one
    await client.persist(key);
    assert.strictEqual(await store.nextSeq(a.executionId), 3);
    assert.ok(await client.ttl(key) > 604000);
    // one transaction: INCR and EXPIRE are queued together (no second round trip after the INCR reply)
    const seen = [];
    const spy = new Proxy(client, {
      get(target, prop) {
        const v = target[prop];
        if (typeof v !== 'function') return v;
        return (...args) => { seen.push(String(prop)); return v.apply(target, args); };
      }
    });
    assert.strictEqual(await new ExecutionStore(spy).nextSeq(a.executionId), 4);
    assert.deepStrictEqual(seen, ['multi']);
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

  it('a stale continuation (hint names an ended execution, another one live on the key) attaches to nothing (M3)', async function () {
    const r = rid('ht');
    const a = await make(r, 'A');
    await store.setStatusHint(a.executionId, 'completed');
    const b = await make(r, 'A'); // a new user message started the next execution
    assert.strictEqual(b.created, true);
    const x = await store.resolve({ requestId: r, agentId: 'A', hintedExecutionId: a.executionId, meta });
    assert.strictEqual(x, null, 'not recorded inside the newer execution');
    assert.strictEqual(await client.get(`exec:req:${r}:A`), b.executionId, 'exec:req untouched');
    const y = await store.resolve({ requestId: r, agentId: 'A', hintedExecutionId: b.executionId, meta });
    assert.strictEqual(y.executionId, b.executionId, 'a hint naming the live current one is reused');
  });

  it('a continuation (hinted id) of an execution that ended, no live one on the request: nothing is created (B2)', async function () {
    for (const [name, prep] of [
      // ingest projected the close: status terminal, exec:req deleted
      ['closed', async (r, id) => { await store.setStatusHint(id, 'completed'); await client.del(`exec:req:${r}:A`); }],
      // terminal status, the request key not yet deleted
      ['terminal', async (r, id) => { await store.setStatusHint(id, 'failed'); }],
      // the hinted execution is gone (destroyed, expired)
      ['gone', async (r, id) => { await client.del([`exec:${id}`, `exec:req:${r}:A`]); }]
    ]) {
      const r = rid('cont-' + name);
      const a = await make(r, 'A');
      await prep(r, a.executionId);
      const before = await client.get(`exec:req:${r}:A`);
      const x = await store.resolve({ requestId: r, agentId: 'A', hintedExecutionId: a.executionId, meta });
      assert.strictEqual(x, null, name + ': no execution resolved');
      assert.strictEqual(await client.get(`exec:req:${r}:A`), before, name + ': exec:req untouched');
    }
  });

  it('a user message (no hint) after the close still starts a new execution', async function () {
    const r = rid('reopen');
    const a = await make(r, 'A');
    await store.setStatusHint(a.executionId, 'completed');
    await client.del(`exec:req:${r}:A`);
    const x = await make(r, 'A');
    assert.strictEqual(x.created, true);
    assert.notStrictEqual(x.executionId, a.executionId);
    assert.strictEqual(await client.get(`exec:req:${r}:A`), x.executionId);
  });

  it('terminal CAS is single under concurrency', async function () {
    const r = rid('cas');
    const a = await make(r, 'A');
    await store.setStatusHint(a.executionId, 'failed');
    const all = await Promise.all(Array.from({ length: 10 }, () => store.resolve({ requestId: r, agentId: 'A', meta })));
    all.forEach(x => execs.add(x.executionId));
    assert.strictEqual(new Set(all.map(x => x.executionId)).size, 1);
    const created = all.filter(x => x.created);
    assert.strictEqual(created.length, 1);
    assert.strictEqual(created[0].previousExecutionId, a.executionId);
    assert.notStrictEqual(created[0].executionId, a.executionId);
  });

  it('corrupt handoff does not break creation', async function () {
    const r = rid('bad');
    await client.set(`exec:handoff:${r}`, '{not json', { EX: 60 });
    const orig = winston.warn; winston.warn = () => {};
    let x;
    try { x = await make(r, 'A'); } finally { winston.warn = orig; }
    assert.strictEqual(x.created, true);
    assert.strictEqual(x.parentExecutionId, null);
    assert.strictEqual((await client.hGetAll(`exec:${x.executionId}`)).status, 'running');
  });

  it('failed meta write rolls back the request key and returns null', async function () {
    const r = rid('rb');
    const orig = winston.warn; winston.warn = () => {};
    const failing = Object.create(client);
    failing.multi = () => { throw new Error('multi boom'); };
    try {
      assert.strictEqual(await new ExecutionStore(failing).resolve({ requestId: r, agentId: 'A', meta }), null);
    } finally { winston.warn = orig; }
    assert.strictEqual(await client.exists(`exec:req:${r}:A`), 0);
    const ok = await make(r, 'A');
    assert.strictEqual(ok.created, true);
  });

  it('setStatusHint / pushFrame / popFrame never recreate an expired exec hash, and keep a live one\'s TTL (T4)', async function () {
    const gone = `gone-${run}`;
    execs.add(gone);
    await store.setStatusHint(gone, 'completed');
    await store.pushFrame(gone, { agent_id: 'S1' });
    assert.strictEqual(await store.popFrame(gone), null);
    assert.strictEqual(await client.exists(`exec:${gone}`), 0);
    const a = await make(rid('ttl'), 'A');
    await store.pushFrame(a.executionId, { agent_id: 'S1' });
    await store.setStatusHint(a.executionId, 'failed');
    assert.deepStrictEqual(await store.popFrame(a.executionId), { agent_id: 'S1' });
    assert.strictEqual(await client.hGet(`exec:${a.executionId}`, 'status'), 'failed');
    assert.ok(await client.ttl(`exec:${a.executionId}`) > 604000);
  });

  /** A client that records the calls it gets and how many were still pending when each was issued. */
  function recording() {
    const calls = [];
    let pending = 0;
    const c = new Proxy(client, {
      get(target, prop) {
        const v = target[prop];
        if (typeof v !== 'function') return v;
        return (...args) => {
          calls.push({ call: String(prop), args, pendingBefore: pending });
          const r = v.apply(target, args);
          if (r && typeof r.then === 'function') {
            pending++;
            r.then(() => { pending--; }, () => { pending--; });
          }
          return r;
        };
      }
    });
    return { c, calls };
  }

  it('resolve: no EXISTS on the hint; status and state are read in one round trip (T3b)', async function () {
    const r = rid('rt');
    const a = await make(r, 'A');
    const v = { step_seq: 2, raw: { x: '1' }, blocks_since_kf: 1, delta_bytes_since_kf: 3 };
    await store.setState(a.executionId, v);
    const { c, calls } = recording();
    const s = new ExecutionStore(c);
    const x = await s.resolve({ requestId: r, agentId: 'A', hintedExecutionId: a.executionId, meta, withState: true });
    assert.strictEqual(x.executionId, a.executionId);
    assert.deepStrictEqual(x.state, v);
    assert.deepStrictEqual(calls.map((k) => k.call), ['hGet', 'get']);
    assert.strictEqual(calls[1].pendingBefore, 1, 'the state GET is issued with the HGET');
    // through the request key: GET, then HGET + state GET together
    calls.length = 0;
    const y = await s.resolve({ requestId: r, agentId: 'A', meta, withState: true });
    assert.deepStrictEqual(y.state, v);
    assert.deepStrictEqual(calls.map((k) => k.call), ['get', 'hGet', 'get']);
    assert.strictEqual(calls[2].pendingBefore, 1);
    // a gone hint (null HGET) resolves to nothing, with that one HGET and no request-key read (M3)
    calls.length = 0;
    const z = await s.resolve({ requestId: r, agentId: 'A', hintedExecutionId: 'missing-id', meta });
    assert.strictEqual(z, null);
    assert.deepStrictEqual(calls.map((k) => k.call), ['hGet']);
  });

  it('resolve returns null when the client throws', async function () {
    const calls = [];
    const orig = winston.warn; winston.warn = (m) => calls.push(m);
    try {
      const bad = new Proxy({}, { get: () => async () => { throw new Error('boom'); } });
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
    } finally { winston.warn = orig; }
    assert.strictEqual(calls.length, 10);
  });
});
