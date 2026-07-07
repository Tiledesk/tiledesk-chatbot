const assert = require('assert');
const { DirJSONConditionV2 } = require('../tiledeskChatbotPlugs/directives/DirJSONConditionV2');

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
  const d = new DirJSONConditionV2(context);
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

const cond = (action) => ({ name: 'jsoncondition', action });

// --- Tests --------------------------------------------------------------------

describe('DirJSONConditionV2', () => {

  describe('`when` path — routing', () => {
    it('routes to trueIntent when `when` is true (callback once, stop=true)', async () => {
      const ctx = makeContext({ score: 10 });
      const d = makeDirective(ctx);
      const res = await run(d, cond({ when: 'score == 10', trueIntent: '#TRUE', falseIntent: '#FALSE' }));
      assert.strictEqual(res.calls, 1);
      assert.strictEqual(res.stop, true);
      assert.strictEqual(d._executed.length, 1);
      assert.ok(d._executed[0].action.intentName.startsWith('#TRUE'));
    });

    it('routes to falseIntent when `when` is false', async () => {
      const ctx = makeContext({ score: 3 });
      const d = makeDirective(ctx);
      const res = await run(d, cond({ when: 'score == 10', trueIntent: '#TRUE', falseIntent: '#FALSE' }));
      assert.strictEqual(res.calls, 1);
      assert.strictEqual(res.stop, true);
      assert.ok(d._executed[0].action.intentName.startsWith('#FALSE'));
    });

    it('passes trueIntentAttributes through to the executed intent', async () => {
      const ctx = makeContext({ star_type: 'supernova' });
      const d = makeDirective(ctx);
      await run(d, cond({
        when: 'star_type == "supernova"',
        trueIntent: '#TRUE',
        falseIntent: '#FALSE',
        trueIntentAttributes: { my_name: 'supernova', size: '2B' },
      }));
      assert.ok(d._executed[0].action.intentName.includes('"my_name":"supernova"'));
      assert.ok(d._executed[0].action.intentName.includes('"size":"2B"'));
    });

    it('passes falseIntentAttributes through when `when` is false', async () => {
      const ctx = makeContext({ score: 3 });
      const d = makeDirective(ctx);
      await run(d, cond({
        when: 'score == 10',
        trueIntent: '#TRUE',
        falseIntent: '#FALSE',
        falseIntentAttributes: { reason: 'no_match', size: '1B' },
      }));
      assert.ok(d._executed[0].action.intentName.startsWith('#FALSE'));
      assert.ok(d._executed[0].action.intentName.includes('"reason":"no_match"'));
      assert.ok(d._executed[0].action.intentName.includes('"size":"1B"'));
    });

    it('`when` true but no trueIntent -> callback once, no intent executed', async () => {
      const ctx = makeContext({ score: 10 });
      const d = makeDirective(ctx);
      const res = await run(d, cond({ when: 'score == 10', falseIntent: '#FALSE' }));
      assert.strictEqual(res.calls, 1);
      assert.strictEqual(d._executed.length, 0);
    });

    it('`when` false but no falseIntent -> callback once, no intent executed', async () => {
      const ctx = makeContext({ score: 3 });
      const d = makeDirective(ctx);
      const res = await run(d, cond({ when: 'score == 10', trueIntent: '#TRUE' }));
      assert.strictEqual(res.calls, 1);
      assert.strictEqual(d._executed.length, 0);
    });
  });

  describe('error handling', () => {
    it('evaluation error -> writes flowError and routes to falseIntent', async () => {
      const ctx = makeContext({ score: 1 });
      const d = makeDirective(ctx);
      const res = await run(d, cond({ when: 'score === ', trueIntent: '#TRUE', falseIntent: '#FALSE' }));
      assert.strictEqual(res.calls, 1);
      assert.ok(d._executed[0].action.intentName.startsWith('#FALSE'));
      const flowError = ctx.tdcache._hsets.find((h) => h.field === 'flowError');
      assert.ok(flowError, 'flowError parameter should have been written');
    });

    it('does NOT crash on whitespace-only intents (regression vs legacy const bug)', async () => {
      const ctx = makeContext({});
      const d = makeDirective(ctx);
      const res = await run(d, cond({ when: '1 == 1', trueIntent: '   ', falseIntent: '   ' }));
      assert.strictEqual(res.calls, 1);
      assert.strictEqual(d._executed.length, 0);
    });

    it('missing tdcache -> evaluates with empty variables, no throw', async () => {
      const ctx = makeContext({}, { withCache: false });
      const d = makeDirective(ctx);
      const res = await run(d, cond({ when: 'score == 1', trueIntent: '#TRUE', falseIntent: '#FALSE' }));
      assert.strictEqual(res.calls, 1);
      assert.ok(d._executed[0].action.intentName.startsWith('#FALSE')); // score undefined -> false
    });

    it('no intents specified -> callback once, no intent executed', async () => {
      const ctx = makeContext({});
      const d = makeDirective(ctx);
      const res = await run(d, cond({ when: '1 == 1' }));
      assert.strictEqual(res.calls, 1);
      assert.strictEqual(d._executed.length, 0);
    });

    it('missing action -> callback once', async () => {
      const ctx = makeContext({});
      const d = makeDirective(ctx);
      const res = await run(d, { name: 'jsoncondition' });
      assert.strictEqual(res.calls, 1);
    });
  });

  describe('backward compatibility', () => {
    it('no `when` field -> delegates to legacy DirJSONCondition (callback once, no hang)', async () => {
      const ctx = makeContext({});
      const d = makeDirective(ctx);
      // Legacy action with no intents -> legacy returns via callback() without network.
      const res = await run(d, cond({ groups: [], trueIntent: '', falseIntent: '' }));
      assert.strictEqual(res.calls, 1);
    });

    it('whitespace-only `when` -> delegates to legacy (callback once, no hang)', async () => {
      const ctx = makeContext({});
      const d = makeDirective(ctx);
      const res = await run(d, cond({ when: '   ', groups: [], trueIntent: '', falseIntent: '' }));
      assert.strictEqual(res.calls, 1);
    });
  });

});
