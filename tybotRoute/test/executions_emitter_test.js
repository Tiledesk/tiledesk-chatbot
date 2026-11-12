'use strict';

const assert = require('assert');
const { TraceEmitter, buildEnvelope, getEmitter, setEmitterForTests } = require('../executions/TraceEmitter');

function okTransport() {
  const sent = [];
  return { sent, publish: async (rk, buf) => { sent.push({ rk, body: JSON.parse(buf.toString()) }); }, close: async () => {} };
}

describe('executions: TraceEmitter', function () {
  const emitters = [];
  function make(opts) { const e = new TraceEmitter(opts); emitters.push(e); return e; }
  afterEach(function () { while (emitters.length) emitters.pop().stop(); setEmitterForTests(null); });

  it('emit publishes with routing key exec.<project>.<type> in emit order', async function () {
    const t = okTransport();
    const e = make({ transport: t, bufferMax: 100, pod: 'p' });
    e.emit({ id_project: 'P1', type: 'action.start', seq: 1 });
    e.emit({ id_project: 'P1', type: 'action.end', seq: 2 });
    e.emit({ id_project: 'P2', type: 'execution.start', seq: 1 });
    await e.flush();
    assert.deepStrictEqual(t.sent.map((s) => s.rk), ['exec.P1.action.start', 'exec.P1.action.end', 'exec.P2.execution.start']);
    assert.deepStrictEqual(t.sent.map((s) => s.body.seq), [1, 2, 1]);
    assert.strictEqual(e.stats().published, 3);
    assert.strictEqual(e.stats().buffered, 0);
  });

  it('emit never throws and returns synchronously', function () {
    const t = { publish: () => { throw new Error('sync boom'); }, close: async () => {} };
    const e = make({ transport: t, bufferMax: 10, pod: 'p' });
    assert.strictEqual(e.emit({ id_project: 'P', type: 't' }), undefined);
    assert.doesNotThrow(() => e.emit(undefined));
    assert.doesNotThrow(() => e.emit({ circular: (() => { const o = {}; o.o = o; return o; })() }));
  });

  it('TraceEmitter survives a failing transport', async function () {
    let failing = true;
    const sent = [];
    const t = {
      publish: async (rk, buf) => { if (failing) throw new Error('down'); sent.push(JSON.parse(buf.toString()).n); },
      close: async () => {},
    };
    const e = make({ transport: t, bufferMax: 10, pod: 'p' });
    assert.doesNotThrow(() => {
      for (let n = 0; n < 15; n++) e.emit({ id_project: 'P', type: 't', n });
    });
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(e.stats().dropped, 5);
    assert.strictEqual(e.stats().buffered, 10);
    failing = false;
    await e.flush();
    assert.deepStrictEqual(sent, [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    assert.strictEqual(e.stats().buffered, 0);
  });

  it('publishes with a window: up to 100 in flight at once, in emit order (T1)', async function () {
    const calls = [];
    const t = { publish: (rk, buf) => new Promise((resolve) => calls.push({ n: JSON.parse(buf.toString()).n, resolve })), close: async () => {} };
    const e = make({ transport: t, bufferMax: 1000, pod: 'p' });
    for (let n = 0; n < 250; n++) e.emit({ id_project: 'P', type: 't', n });
    assert.strictEqual(calls.length, 100);
    assert.deepStrictEqual(calls.map((c) => c.n), [...Array(100).keys()]);
    assert.strictEqual(e.stats().buffered, 150);
    const done = e.flush();
    // confirms come back; each frees a slot for the next entry, order kept
    while (calls.some((c) => !c.done)) {
      for (const c of calls) if (!c.done) { c.done = true; c.resolve(); }
      await new Promise((r) => setImmediate(r));
    }
    await done;
    assert.deepStrictEqual(calls.map((c) => c.n), [...Array(250).keys()]);
    assert.strictEqual(e.stats().published, 250);
    assert.strictEqual(e.stats().buffered, 0);
  });

  it('on failures the unconfirmed entries go back to the head, in order (T1)', async function () {
    const sent = [];
    const failOnce = new Set([3, 5]);
    const t = {
      publish: async (rk, buf) => {
        const n = JSON.parse(buf.toString()).n;
        await new Promise((r) => setImmediate(r));
        if (failOnce.delete(n)) throw new Error('nack ' + n);
        sent.push(n);
      },
      close: async () => {},
    };
    const e = make({ transport: t, bufferMax: 100, pod: 'p' });
    for (let n = 0; n < 10; n++) e.emit({ id_project: 'P', type: 't', n });
    await e.flush();
    assert.deepStrictEqual(sent, [0, 1, 2, 4, 6, 7, 8, 9]);
    assert.strictEqual(e.stats().buffered, 2);
    e.emit({ id_project: 'P', type: 't', n: 10 });
    await e.flush();
    assert.deepStrictEqual(sent.slice(8), [3, 5, 10]);
    assert.strictEqual(e.stats().published, 11);
    assert.strictEqual(e.stats().dropped, 0);
  });

  it('a byte cap drops the oldest entries and counts them as dropped (T2)', async function () {
    const t = { publish: async () => { throw new Error('down'); }, close: async () => {} };
    const one = Buffer.byteLength(JSON.stringify({ id_project: 'P', type: 't', n: 0, pad: 'x'.repeat(80) }));
    const e = make({ transport: t, bufferMax: 1000, bufferMaxBytes: one * 3 + 10, pod: 'p' });
    for (let n = 0; n < 8; n++) e.emit({ id_project: 'P', type: 't', n, pad: 'x'.repeat(80) });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(e.stats().buffered, 3);
    assert.strictEqual(e.stats().dropped, 5);
    assert.ok(e.stats().bufferedBytes <= one * 3 + 10);
  });

  it('EXECUTIONS_BUFFER_MAX_BYTES defaults to 64 MB and reaches the emitter (T2)', function () {
    const { getConfig } = require('../executions/config');
    const saved = process.env.EXECUTIONS_BUFFER_MAX_BYTES;
    try {
      delete process.env.EXECUTIONS_BUFFER_MAX_BYTES;
      assert.strictEqual(getConfig().bufferMaxBytes, 67108864);
      assert.strictEqual(new TraceEmitter({ transport: okTransport() }).bufferMaxBytes, 67108864);
      process.env.EXECUTIONS_BUFFER_MAX_BYTES = '1024';
      assert.strictEqual(getConfig().bufferMaxBytes, 1024);
      setEmitterForTests(null);
      const saveUrl = process.env.EXECUTIONS_AMQP_URL;
      delete process.env.EXECUTIONS_AMQP_URL;
      try { assert.strictEqual(getEmitter().bufferMaxBytes, 1024); } finally { if (saveUrl !== undefined) process.env.EXECUTIONS_AMQP_URL = saveUrl; }
    } finally {
      if (saved === undefined) delete process.env.EXECUTIONS_BUFFER_MAX_BYTES; else process.env.EXECUTIONS_BUFFER_MAX_BYTES = saved;
    }
  });

  it('buildEnvelope carries event_version 1 and all envelope fields', function () {
    const ctx = { execution_id: 'x1', id_project: 'P', agent_id: 'a', agent_version: 'v', request_id: 'r' };
    const env = buildEnvelope({ ctx, seq: 3, type: 'action.start', data: { k: 1 } });
    assert.deepStrictEqual(Object.keys(env).sort(), ['agent_id', 'agent_version', 'at', 'data', 'event_version', 'execution_id', 'id_project', 'pod', 'request_id', 'seq', 'type']);
    assert.strictEqual(env.event_version, 1);
    assert.strictEqual(env.seq, 3);
    assert.strictEqual(env.type, 'action.start');
    assert.strictEqual(env.execution_id, 'x1');
    assert.strictEqual(env.pod, require('os').hostname());
    assert.strictEqual(new Date(env.at).toISOString(), env.at);
    assert.deepStrictEqual(env.data, { k: 1 });
  });

  it('getEmitter without amqpUrl returns a no-op emitter and does not throw', async function () {
    const saved = process.env.EXECUTIONS_AMQP_URL;
    delete process.env.EXECUTIONS_AMQP_URL;
    try {
      setEmitterForTests(null);
      const e = getEmitter();
      assert.strictEqual(getEmitter(), e);
      e.emit({ id_project: 'P', type: 't' });
      await e.flush();
      assert.strictEqual(e.stats().buffered, 0);
    } finally {
      if (saved !== undefined) process.env.EXECUTIONS_AMQP_URL = saved;
    }
  });

  it('setEmitterForTests overrides the singleton', function () {
    const fake = { emit() {} };
    setEmitterForTests(fake);
    assert.strictEqual(getEmitter(), fake);
  });
});
