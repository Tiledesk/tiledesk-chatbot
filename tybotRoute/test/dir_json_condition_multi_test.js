const assert = require('assert');
const { DirJSONConditionMulti } = require('../tiledeskChatbotPlugs/directives/DirJSONConditionMulti');

// --- Test doubles (no Redis, no network) --------------------------------------

function makeTdCache(vars) {
  const params = {};
  for (const k of Object.keys(vars || {})) params[k] = JSON.stringify(vars[k]);
  const hsets = [];
  return {
    hgetall: async () => ({ ...params }),
    hset: async (key, field, value) => { hsets.push({ field, value }); params[field] = value; },
    _hsets: hsets,
  };
}

function makeContext(vars, opts) {
  const withCache = !opts || opts.withCache !== false;
  return {
    requestId: 'req-test-1',
    tdcache: withCache ? makeTdCache(vars) : undefined,
    chatbot: {},
    supportRequest: {},
    reply: {},
  };
}

// Build the directive with a stubbed intentDir that records which intent ran.
function makeDirective(context) {
  const d = new DirJSONConditionMulti(context);
  const executed = [];
  d.intentDir = { execute: (directive, cb) => { executed.push(directive); cb(); } };
  d._executed = executed;
  return d;
}

// Run execute() and resolve after a tick so we can detect double-callbacks.
function run(d, directive) {
  return new Promise((resolve) => {
    let calls = 0;
    let lastStop;
    d.execute(directive, (stop) => { calls++; lastStop = stop; });
    setTimeout(() => resolve({ calls, stop: lastStop }), 30);
  });
}

const multi = (action) => ({ name: 'jsonconditionmulti', action });
const branch = (id, when, intent) => ({ type: 'expression', _tdCaseId: id, when, intent });

// The reference case: x == 1 -> block 1, x == 2 -> block 2, x == 3 -> block 3, else -> block else.
const threeCases = [
  branch('c1', 'x == 1', '#BLOCK1'),
  branch('c2', 'x == 2', '#BLOCK2'),
  branch('c3', 'x == 3', '#BLOCK3'),
];

const intentOf = (d) => d._executed[0].action.intentName;

// --- Tests --------------------------------------------------------------------

describe('DirJSONConditionMulti', () => {

  describe('routing in order', () => {
    it('takes the first case when it matches (callback once, stop=true)', async () => {
      const d = makeDirective(makeContext({ x: 1 }));
      const res = await run(d, multi({ cases: threeCases, elseIntent: '#ELSE' }));
      assert.strictEqual(res.calls, 1);
      assert.strictEqual(res.stop, true);
      assert.strictEqual(d._executed.length, 1);
      assert.strictEqual(intentOf(d), '#BLOCK1');
    });

    it('takes a case in the middle', async () => {
      const d = makeDirective(makeContext({ x: 2 }));
      await run(d, multi({ cases: threeCases, elseIntent: '#ELSE' }));
      assert.strictEqual(intentOf(d), '#BLOCK2');
    });

    it('takes the last case', async () => {
      const d = makeDirective(makeContext({ x: 3 }));
      await run(d, multi({ cases: threeCases, elseIntent: '#ELSE' }));
      assert.strictEqual(intentOf(d), '#BLOCK3');
    });

    it('goes to elseIntent when no case matches', async () => {
      const d = makeDirective(makeContext({ x: 99 }));
      const res = await run(d, multi({ cases: threeCases, elseIntent: '#ELSE' }));
      assert.strictEqual(res.stop, true);
      assert.strictEqual(intentOf(d), '#ELSE');
    });

    it('the first match wins: the cases below it are never evaluated', async () => {
      // Two overlapping cases: only the first one may fire.
      const d = makeDirective(makeContext({ x: 5 }));
      await run(d, multi({
        cases: [branch('c1', 'x > 1', '#FIRST'), branch('c2', 'x > 2', '#SECOND')],
        elseIntent: '#ELSE',
      }));
      assert.strictEqual(d._executed.length, 1);
      assert.strictEqual(intentOf(d), '#FIRST');
    });

    it('cases may test different variables', async () => {
      const d = makeDirective(makeContext({ y: 2 }));
      await run(d, multi({
        cases: [branch('c1', 'x == 1', '#BLOCK1'), branch('c2', 'y == 2', '#BLOCK2'), branch('c3', 'z == 3', '#BLOCK3')],
        elseIntent: '#ELSE',
      }));
      // x is never set: that is not an error, so the evaluation carries on to y.
      assert.strictEqual(intentOf(d), '#BLOCK2');
    });
  });

  describe('cases without a condition (rule 2)', () => {
    it('skips an empty case instead of taking it as true', async () => {
      const d = makeDirective(makeContext({ x: 2 }));
      await run(d, multi({
        cases: [branch('c0', '', '#EMPTY'), branch('c0b', '   ', '#BLANK'), ...threeCases],
        elseIntent: '#ELSE',
      }));
      assert.strictEqual(intentOf(d), '#BLOCK2');
    });

    it('skips a case with no `when` at all', async () => {
      const d = makeDirective(makeContext({ x: 1 }));
      await run(d, multi({
        cases: [{ type: 'expression', _tdCaseId: 'c0', intent: '#NOWHEN' }, ...threeCases],
        elseIntent: '#ELSE',
      }));
      assert.strictEqual(intentOf(d), '#BLOCK1');
    });
  });

  describe('evaluation errors (rule 3)', () => {
    it('a broken case counts as no-match and the sound cases below it still fire', async () => {
      const ctx = makeContext({ x: 2 });
      const d = makeDirective(ctx);
      await run(d, multi({
        cases: [branch('c0', 'nosuchfunction(x)', '#BROKEN'), ...threeCases],
        elseIntent: '#ELSE',
      }));
      assert.strictEqual(intentOf(d), '#BLOCK2');
      const flowError = ctx.tdcache._hsets.find(h => h.field === 'flowError');
      assert.ok(flowError, 'flowError should be written');
    });

    it('falls through to elseIntent when every case is broken', async () => {
      const d = makeDirective(makeContext({ x: 2 }));
      await run(d, multi({
        cases: [branch('c0', 'nosuchfunction(x)', '#A'), branch('c1', 'alsonot(x)', '#B')],
        elseIntent: '#ELSE',
      }));
      assert.strictEqual(intentOf(d), '#ELSE');
    });
  });

  describe('unconnected exits', () => {
    it('a matched case with no target advances to the next action (rule 4)', async () => {
      const d = makeDirective(makeContext({ x: 1 }));
      const res = await run(d, multi({ cases: [branch('c1', 'x == 1', '')], elseIntent: '#ELSE' }));
      assert.strictEqual(res.calls, 1);
      assert.ok(!res.stop, 'the chain must not stop');
      assert.strictEqual(d._executed.length, 0, 'no intent may run: the else is not a fallback for a matched case');
    });

    it('no match and no elseIntent advances to the next action (rule 5)', async () => {
      const d = makeDirective(makeContext({ x: 99 }));
      const res = await run(d, multi({ cases: threeCases }));
      assert.strictEqual(res.calls, 1);
      assert.ok(!res.stop);
      assert.strictEqual(d._executed.length, 0);
    });

    it('nothing usable at all advances to the next action (rule 6)', async () => {
      const d = makeDirective(makeContext({ x: 1 }));
      const res = await run(d, multi({ cases: [], elseIntent: '' }));
      assert.strictEqual(res.calls, 1);
      assert.ok(!res.stop);
      assert.strictEqual(d._executed.length, 0);
    });

    it('an action with no cases at all still reaches the else', async () => {
      const d = makeDirective(makeContext({ x: 1 }));
      await run(d, multi({ elseIntent: '#ELSE' }));
      assert.strictEqual(intentOf(d), '#ELSE');
    });
  });

  describe('robustness', () => {
    it('a directive with no action calls back exactly once', async () => {
      const d = makeDirective(makeContext({}));
      const res = await run(d, { name: 'jsonconditionmulti' });
      assert.strictEqual(res.calls, 1);
      assert.ok(!res.stop);
    });

    it('works without tdcache: no variable is set, so the else is taken', async () => {
      const d = makeDirective(makeContext({ x: 1 }, { withCache: false }));
      const res = await run(d, multi({ cases: threeCases, elseIntent: '#ELSE' }));
      assert.strictEqual(res.calls, 1);
      assert.strictEqual(intentOf(d), '#ELSE');
    });

    it('carries intentAttributes over to the intent it runs', async () => {
      const d = makeDirective(makeContext({ x: 1 }));
      await run(d, multi({
        cases: [{ ...branch('c1', 'x == 1', '#BLOCK1'), intentAttributes: { foo: 'bar' } }],
        elseIntent: '#ELSE',
      }));
      assert.ok(intentOf(d).startsWith('#BLOCK1'), 'the intent name keeps its block');
      assert.ok(intentOf(d).includes('foo'), 'the attributes travel with it');
    });

    it('text comparisons keep working, ignoreCase included', async () => {
      const d = makeDirective(makeContext({ city: 'NEW YORK' }));
      await run(d, multi({
        cases: [branch('c1', 'contains(lowerCase(city), lowerCase("new"))', '#FOUND')],
        elseIntent: '#ELSE',
      }));
      assert.strictEqual(intentOf(d), '#FOUND');
    });
  });


  // The historical failure mode of jsoncondition2: the directive exists and its unit tests
  // are green, but nobody wired it into the dispatch table, so the action is a silent no-op
  // in a real conversation. The table is a local const inside process(), so it is checked
  // at the source level -- crude, and it catches exactly the mistake that has been made before.
  describe('dispatch invariant', () => {
    const fs = require('fs');
    const path = require('path');
    const plugSource = fs.readFileSync(path.join(__dirname, '..', 'tiledeskChatbotPlugs', 'DirectivesChatbotPlug.js'), 'utf8');
    const { Directives } = require('../tiledeskChatbotPlugs/directives/Directives');

    it('the directive name is lowercase (the dispatcher lowercases what it looks up)', () => {
      assert.strictEqual(Directives.JSON_CONDITION_MULTI, Directives.JSON_CONDITION_MULTI.toLowerCase());
      assert.strictEqual(Directives.JSON_CONDITION_MULTI, 'jsonconditionmulti');
    });

    it('jsonconditionmulti is wired to DirJSONConditionMulti in the dispatch table', () => {
      assert.ok(plugSource.includes("require('./directives/DirJSONConditionMulti')"), 'the directive must be imported');
      assert.ok(/\[Directives\.JSON_CONDITION_MULTI\]:\s*DirJSONConditionMulti/.test(plugSource), 'the handlers map must route it');
    });

    it('the V1 and V2 conditions are still wired (no regression)', () => {
      assert.ok(/\[Directives\.JSON_CONDITION\]:\s*DirJSONCondition\b/.test(plugSource));
      assert.ok(/\[Directives\.JSON_CONDITION_2\]:\s*DirJSONConditionV2\b/.test(plugSource));
    });
  });

});
