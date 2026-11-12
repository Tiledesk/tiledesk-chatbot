'use strict';

const assert = require('assert');
const WriteTap = require('../executions/WriteTap');
const { getConfig, isEnabled } = require('../executions/config');
const { TiledeskChatbot } = require('../engine/TiledeskChatbot');
const { TiledeskRequestVariables } = require('../tiledeskChatbotPlugs/TiledeskRequestVariables');

const meta = (extra) => Object.assign({
  executionId: 'e1', stepSeq: 1, actionIndex: 0, actionId: 'a1', requestId: 'r1', onJump: false
}, extra);

describe('WriteTap', function () {
  let saved;
  before(function () { saved = process.env.EXECUTIONS_ENABLED; });
  beforeEach(function () { process.env.EXECUTIONS_ENABLED = 'true'; });
  after(function () {
    if (saved === undefined) delete process.env.EXECUTIONS_ENABLED;
    else process.env.EXECUTIONS_ENABLED = saved;
  });

  it('note inside runAction records the key', function () {
    let store;
    WriteTap.runAction(meta(), () => {
      WriteTap.note('r1', 'x', 'set');
      WriteTap.note('r1', 'y', 'del');
      store = WriteTap.current();
    });
    assert.strictEqual(store.kind, 'action');
    assert.strictEqual(store.actionId, 'a1');
    assert.deepStrictEqual([...store.writes], [['x', 'set'], ['y', 'del']]);
  });

  it('last op on the same key wins', function () {
    const store = WriteTap.runAction(meta(), () => {
      WriteTap.note('r1', 'x', 'set');
      WriteTap.note('r1', 'x', 'del');
      return WriteTap.current();
    });
    assert.strictEqual(store.writes.get('x'), 'del');
  });

  it('note survives awaits and timers inside the action', async function () {
    const store = await WriteTap.runAction(meta(), async () => {
      await new Promise((r) => setTimeout(r, 5));
      WriteTap.note('r1', 'a', 'set');
      await new Promise((r) => setImmediate(r));
      WriteTap.note('r1', 'b', 'set');
      return WriteTap.current();
    });
    assert.deepStrictEqual([...store.writes.keys()], ['a', 'b']);
  });

  it('nested runAction isolates writes', function () {
    let outer, inner;
    WriteTap.runAction(meta({ actionId: 'outer' }), () => {
      WriteTap.note('r1', 'o1', 'set');
      WriteTap.runAction(meta({ actionId: 'inner' }), () => {
        WriteTap.note('r1', 'i1', 'set');
        inner = WriteTap.current();
      });
      WriteTap.note('r1', 'o2', 'set');
      outer = WriteTap.current();
    });
    assert.deepStrictEqual([...inner.writes.keys()], ['i1']);
    assert.deepStrictEqual([...outer.writes.keys()], ['o1', 'o2']);
  });

  it('note outside any store is ignored', function () {
    assert.strictEqual(WriteTap.current(), undefined);
    assert.doesNotThrow(() => WriteTap.note('r1', 'x', 'set'));
  });

  it('runScope message_in records keys', function () {
    const store = WriteTap.runScope('message_in', 'r1', () => {
      WriteTap.note('r1', 'lastUserText', 'set');
      return WriteTap.current();
    });
    assert.strictEqual(store.kind, 'scope');
    assert.strictEqual(store.name, 'message_in');
    assert.strictEqual(store.writes.get('lastUserText'), 'set');
  });

  it('different requestId is ignored', function () {
    const store = WriteTap.runAction(meta(), () => {
      WriteTap.note('other', 'x', 'set');
      return WriteTap.current();
    });
    assert.strictEqual(store.writes.size, 0);
  });

  it('is a no-op when disabled', function () {
    process.env.EXECUTIONS_ENABLED = 'false';
    const store = WriteTap.runAction(meta(), () => {
      WriteTap.note('r1', 'x', 'set');
      return WriteTap.current();
    });
    assert.strictEqual(store.writes.size, 0);
  });

  it("addParameterStatic notes 'set'", async function () {
    const calls = [];
    const cache = { hset: async (...a) => { calls.push(a); } };
    const store = await WriteTap.runAction(meta(), async () => {
      await TiledeskChatbot.addParameterStatic(cache, 'r1', 'foo', 'bar');
      await TiledeskChatbot.addParameterStatic(cache, 'r1', null, 'bar');
      return WriteTap.current();
    });
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual([...store.writes], [['foo', 'set']]);
  });

  it("deleteParameterStatic notes 'del' and returns the hdel result", async function () {
    const cache = { hdel: async () => 1 };
    let res;
    const store = await WriteTap.runAction(meta(), async () => {
      res = await TiledeskChatbot.deleteParameterStatic(cache, 'r1', 'foo');
      return WriteTap.current();
    });
    assert.strictEqual(res, 1);
    assert.strictEqual(store.writes.get('foo'), 'del');
  });

  it("TiledeskRequestVariables.set notes 'set'", async function () {
    const vars = new TiledeskRequestVariables('r1', { hset: async () => {} }, {});
    const store = await WriteTap.runAction(meta(), async () => {
      await vars.set('k', 'v');
      return WriteTap.current();
    });
    assert.strictEqual(store.writes.get('k'), 'set');
  });

  it("TiledeskRequestVariables.delete notes 'del'", async function () {
    const vars = new TiledeskRequestVariables('r1', { hdel: async () => 1 }, {});
    let res;
    const store = await WriteTap.runAction(meta(), async () => {
      res = await vars.delete('k');
      return WriteTap.current();
    });
    assert.strictEqual(res, 1);
    assert.strictEqual(store.writes.get('k'), 'del');
  });
});

describe('executions config isEnabled', function () {
  let saved;
  before(function () { saved = process.env.EXECUTIONS_ENABLED; });
  after(function () {
    if (saved === undefined) delete process.env.EXECUTIONS_ENABLED;
    else process.env.EXECUTIONS_ENABLED = saved;
  });

  it('agrees with getConfig().enabled for true, false, unset', function () {
    for (const v of ['true', 'false', undefined]) {
      if (v === undefined) delete process.env.EXECUTIONS_ENABLED;
      else process.env.EXECUTIONS_ENABLED = v;
      assert.strictEqual(isEnabled(), getConfig().enabled);
    }
    process.env.EXECUTIONS_ENABLED = 'true';
    assert.strictEqual(isEnabled(), true);
    delete process.env.EXECUTIONS_ENABLED;
    assert.strictEqual(isEnabled(), false);
  });
});
