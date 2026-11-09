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
