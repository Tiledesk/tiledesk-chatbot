'use strict';

// B1: a conditional directive notes the exit it took (WriteTap.noteExit), so two exits that lead to the
// same block are told apart. Each family runs through the real directive: its intentDir is stubbed
// (the jump), its outside calls are stubbed or served by a local HTTP server. No Redis.

const assert = require('assert');
const express = require('express');
const WriteTap = require('../executions/WriteTap');
const { mapOutcome } = require('../executions/OutcomeMapper');
const ExecutionRecorder = require('../executions/ExecutionRecorder');
const { TiledeskExpression } = require('../TiledeskExpression');
const httpUtils = require('../utils/HttpUtils');
const integrationService = require('../services/IntegrationService');
const aiController = require('../services/AIController');
const kbService = require('../services/KbService');
const { DirWebRequestV2 } = require('../tiledeskChatbotPlugs/directives/DirWebRequestV2');
const { DirAiPrompt } = require('../tiledeskChatbotPlugs/directives/DirAiPrompt');
const { DirAskGPTV2 } = require('../tiledeskChatbotPlugs/directives/DirAskGPTV2');
const { DirCondition } = require('../tiledeskChatbotPlugs/directives/DirCondition');
const { DirJSONCondition } = require('../tiledeskChatbotPlugs/directives/DirJSONCondition');
const { DirJSONConditionV2 } = require('../tiledeskChatbotPlugs/directives/DirJSONConditionV2');
const { DirMake } = require('../tiledeskChatbotPlugs/directives/DirMake');
const { DirRemoveHuman } = require('../tiledeskChatbotPlugs/directives/DirRemoveHuman');
const { DirInviteHuman } = require('../tiledeskChatbotPlugs/directives/DirInviteHuman');
const { DirIfOpenHours } = require('../tiledeskChatbotPlugs/directives/DirIfOpenHours');
const { DirIfOnlineAgentsV2 } = require('../tiledeskChatbotPlugs/directives/DirIfOnlineAgentsV2');
const { TiledeskWhenExpression } = require('../TiledeskWhenExpression');

const RID = 'support-group-projectBranch-0123456789abcdef';
const HTTP_PORT = 10045;
const BASE = `http://localhost:${HTTP_PORT}`;

function makeContext(vars = {}) {
  const params = {};
  for (const k of Object.keys(vars)) params[k] = JSON.stringify(vars[k]);
  return {
    requestId: RID,
    projectId: 'projectBranch',
    token: 'JWT x',
    tdcache: {
      hgetall: async () => ({ ...params }),
      hget: async (key, field) => (params[field] === undefined ? null : params[field]),
      hset: async (key, field, value) => { params[field] = value; },
      hdel: async () => 1,
      get: async () => null,
      set: async () => 'OK'
    },
    chatbot: { bot: {}, addParameter: async (k, v) => { params[k] = JSON.stringify(v); }, getParameter: async () => null },
    supportRequest: {},
    reply: {}
  };
}

/** The directive with its jump stubbed: each jump is recorded and its callback runs at once. */
function withJumpStub(d) {
  d._jumps = [];
  d.intentDir = { execute: (directive, cb) => { d._jumps.push(directive.action.intentName); if (cb) cb(); } };
  return d;
}

/** Runs execute(); resolves after the callback plus a short tail (a late second callback would show). */
function exec(d, directive) {
  return new Promise((resolve) => {
    const stops = [];
    d.execute(directive, (stop) => {
      stops.push(stop);
      setTimeout(() => resolve(stops), 30);
    });
  });
}

/** Runs one directive inside a traced action (flag on), the way the recorder's runAction does. */
async function traced(make, directive) {
  const d = withJumpStub(make());
  let store;
  const stops = await WriteTap.runAction({ executionId: 'e', stepSeq: 1, actionIndex: 0, actionId: 'a', requestId: RID }, () => {
    store = WriteTap.current();
    return exec(d, directive);
  });
  const jumpedTo = d._jumps.length ? '/' + d._jumps[d._jumps.length - 1] : undefined;
  const { outcome, exit_taken } = mapOutcome({ action: directive.action, jumpedTo, exit: store.exit, type: directive.name });
  return { outcome, exit_taken, exit: store.exit, jumps: d._jumps, stops };
}

/** The same directive, flag off and no recorder context. */
async function untraced(make, directive) {
  const saved = process.env.EXECUTIONS_ENABLED;
  process.env.EXECUTIONS_ENABLED = 'false';
  try {
    assert.strictEqual(WriteTap.current(), undefined);
    const d = withJumpStub(make());
    const stops = await exec(d, directive);
    return { jumps: d._jumps, stops };
  } finally {
    process.env.EXECUTIONS_ENABLED = saved;
  }
}

/**
 * The family check: true -> success/true, false -> failure_condition/false (both exits on '#same'),
 * different targets still map by target, and flag off the directive does the same jumps and callbacks.
 */
function family(name, { make, action, arrange, type = name, falseOutcome = 'failure_condition' }) {
  describe(name, function () {
    const run = async (result, fields, mode = traced) => {
      if (arrange) arrange(result);
      return mode(make, { name: type, action: Object.assign(action(result), fields) });
    };
    const same = { trueIntent: '#same', falseIntent: '#same' };

    it('same-target exits, true result -> success / true', async function () {
      const r = await run(true, same);
      assert.deepStrictEqual(r.jumps, ['#same']);
      assert.strictEqual(r.exit, 'trueIntent');
      assert.deepStrictEqual([r.outcome, r.exit_taken], ['success', 'true']);
    });
    it(`same-target exits, false result -> ${falseOutcome} / false`, async function () {
      const r = await run(false, same);
      assert.deepStrictEqual(r.jumps, ['#same']);
      assert.strictEqual(r.exit, 'falseIntent');
      assert.deepStrictEqual([r.outcome, r.exit_taken], [falseOutcome, 'false']);
    });
    it('different targets still map to their exit', async function () {
      const t = await run(true, { trueIntent: '#t', falseIntent: '#f' });
      assert.deepStrictEqual([t.jumps, t.outcome, t.exit_taken], [['#t'], 'success', 'true']);
      const f = await run(false, { trueIntent: '#t', falseIntent: '#f' });
      assert.deepStrictEqual([f.jumps, f.outcome, f.exit_taken], [['#f'], falseOutcome, 'false']);
    });
    it('flag off, no recorder context: the same jumps and callbacks', async function () {
      for (const result of [true, false]) {
        const on = await run(result, same);
        const off = await run(result, same, untraced);
        assert.deepStrictEqual(off, { jumps: on.jumps, stops: on.stops });
      }
    });
  });
}

describe('executions: the branch a conditional action took (B1)', function () {
  this.timeout(10000);
  let server;
  let savedEnv;
  const restores = [];
  const stub = (obj, key, fn) => {
    const orig = obj[key];
    obj[key] = fn;
    restores.push(() => { obj[key] = orig; });
  };

  before(async function () {
    savedEnv = process.env.EXECUTIONS_ENABLED;
    process.env.EXECUTIONS_ENABLED = 'true';
    const app = express();
    app.all('/ok', (req, res) => res.status(200).send({ ok: true }));
    app.all('/fail', (req, res) => res.status(500).send({ error: 'boom' }));
    await new Promise((resolve) => { server = app.listen(HTTP_PORT, resolve); });
  });
  after(async function () {
    if (savedEnv === undefined) delete process.env.EXECUTIONS_ENABLED;
    else process.env.EXECUTIONS_ENABLED = savedEnv;
    await new Promise((resolve) => server.close(resolve));
  });
  afterEach(function () {
    while (restores.length) restores.pop()();
  });

  it('noteExit: a no-op outside an action, in a scope, and with the flag off', function () {
    assert.doesNotThrow(() => WriteTap.noteExit('trueIntent'));
    const scope = WriteTap.runScope('message_in', RID, () => { WriteTap.noteExit('trueIntent'); return WriteTap.current(); });
    assert.strictEqual(scope.exit, undefined);
    process.env.EXECUTIONS_ENABLED = 'false';
    try {
      const off = WriteTap.runAction({ requestId: RID }, () => { WriteTap.noteExit('trueIntent'); return WriteTap.current(); });
      assert.strictEqual(off.exit, undefined);
    } finally {
      process.env.EXECUTIONS_ENABLED = 'true';
    }
    const on = WriteTap.runAction({ requestId: RID }, () => { WriteTap.noteExit('falseIntent'); WriteTap.noteExit('trueIntent'); return WriteTap.current(); });
    assert.strictEqual(on.exit, 'trueIntent', 'last call wins');
  });

  it('untraced continuation: its jumps keep the ended execution id and post at once; flag off: no marker (I1)', async function () {
    // in a setImmediate callback: enterWith only reaches that callback's context, never mocha's
    const inFreshContext = (fn) => new Promise((resolve) => setImmediate(() => resolve(fn())));
    const on = await inFreshContext(() => {
      ExecutionRecorder.continueUntraced({ sender: '_tdinternal', attributes: { execution_id: 'ended-1' } }, RID);
      const msg = { payload: { text: '/#next', attributes: { a: 1 } } };
      return { ret: ExecutionRecorder.beforeJump(msg), msg, kind: WriteTap.current() && WriteTap.current().kind };
    });
    assert.strictEqual(on.kind, 'untraced');
    assert.strictEqual(on.ret, undefined, 'posted right away, nothing recorded');
    assert.deepStrictEqual(on.msg.payload.attributes, { a: 1, execution_id: 'ended-1' });
    const user = await inFreshContext(() => {
      ExecutionRecorder.continueUntraced({ sender: 'u1', attributes: {} }, RID); // no hint: a user message
      return WriteTap.current();
    });
    assert.strictEqual(user, undefined);
    process.env.EXECUTIONS_ENABLED = 'false';
    try {
      const off = await inFreshContext(() => { WriteTap.enterUntraced(RID, 'ended-1'); return WriteTap.current(); });
      assert.strictEqual(off, undefined);
    } finally {
      process.env.EXECUTIONS_ENABLED = 'true';
    }
  });

  family('webrequestv2', {
    make: () => new DirWebRequestV2(makeContext()),
    action: (result) => ({ url: `${BASE}/${result ? 'ok' : 'fail'}`, method: 'GET', headersString: {}, assignStatusTo: 'status_code' })
  });

  family('ai_prompt (AI Prompt)', {
    type: 'ai_prompt',
    make: () => new DirAiPrompt(makeContext()),
    action: () => ({ question: 'q', llm: 'openai', model: 'gpt-4o', assignReplyTo: 'answer' }),
    arrange: (result) => {
      stub(integrationService, 'getKeyFromIntegrations', async () => 'key');
      stub(httpUtils, 'request', (req, cb) => setImmediate(() => (result ? cb(null, { answer: 'hi' }) : cb(new Error('llm down')))));
    }
  });

  family('askgptv2 (Ask KB)', {
    type: 'askgptv2',
    make: () => {
      const d = new DirAskGPTV2(makeContext());
      d.getNamespace = async () => ({ id: 'ns1', hybrid: false });
      d.setDefaultEngine = async () => ({ name: 'pinecone' });
      return d;
    },
    action: () => ({ question: 'q', namespace: 'ns1', llm: 'openai', model: 'gpt-4o', assignReplyTo: 'answer' }),
    arrange: (result) => {
      stub(aiController, 'resolveLLMConfig', async () => ({ name: 'gpt-4o', provider: 'openai', api_key: 'key' }));
      stub(kbService, 'addAnsweredQuestion', async () => ({}));
      stub(httpUtils, 'request', (req, cb) => setImmediate(() => cb(null, result
        ? { success: true, answer: 'a', source: 's', content_chunks: [] }
        : { success: false, answer: 'no' })));
    }
  });

  family('condition', {
    falseOutcome: 'success', // a pure condition: false is a normal outcome
    make: () => new DirCondition(makeContext({ score: 10 })),
    action: (result) => ({ scriptCondition: result ? '$score == 10' : '$score == 3', jsonCondition: null })
  });

  family('jsoncondition', {
    falseOutcome: 'success',
    make: () => new DirJSONCondition(makeContext({ score: 10 })),
    action: (result) => ({
      groups: [{
        type: 'expression',
        conditions: [{ type: 'condition', operand1: 'score', operator: TiledeskExpression.OPERATORS.equalAsNumbers.name, operand2: { type: 'const', value: result ? '10' : '3' } }]
      }]
    })
  });

  family('jsonconditionv2', {
    type: 'jsoncondition2',
    falseOutcome: 'success',
    make: () => new DirJSONConditionV2(makeContext({ score: 10 })),
    action: (result) => ({ when: result ? 'score == 10' : 'score == 3' })
  });

  family('make (integrations with #executeCondition)', {
    type: 'make',
    make: () => new DirMake(makeContext()),
    // Make's false branch: a request error or no body parameters (any HTTP reply takes the true branch)
    action: (result) => ({ url: `${BASE}/ok`, bodyParameters: result ? { a: '1' } : undefined })
  });

  let humanOk = true; // the outcome the stubbed human call gives
  family('remove_human', {
    make: () => {
      const d = new DirRemoveHuman(makeContext());
      d.remove = async () => {
        if (!humanOk) throw new Error('nope');
        return { removed: [] };
      };
      return d;
    },
    action: () => ({}),
    arrange: (result) => { humanOk = result; }
  });

  family('invite_human', {
    make: () => {
      const d = new DirInviteHuman(makeContext());
      d.invite = async () => ({ invited: humanOk ? [{ id_user: 'u1' }] : [] });
      return d;
    },
    action: () => ({ members: [] }),
    arrange: (result) => { humanOk = result; }
  });

  // M1: a condition-type directive that fails on its way (and so goes to its false exit) is a failure
  describe('condition-type error paths -> failure_condition / error (still jumping to the false exit)', function () {
    const action = { trueIntent: '#t', falseIntent: '#f' };
    const check = async (type, make, extra = {}) => {
      const r = await traced(make, { name: type, action: Object.assign({}, action, extra) });
      assert.deepStrictEqual(r.jumps, ['#f']);
      assert.deepStrictEqual([r.outcome, r.exit_taken], ['failure_condition', 'error']);
    };
    it('jsoncondition: the expression evaluates to null', async function () {
      stub(TiledeskExpression.prototype, 'evaluateStaticExpression', () => null);
      await check('jsoncondition', () => new DirJSONCondition(makeContext({ score: 10 })), {
        groups: [{ type: 'expression', conditions: [{ type: 'condition', operand1: 'score', operator: TiledeskExpression.OPERATORS.equalAsNumbers.name, operand2: { type: 'const', value: '10' } }] }]
      });
    });
    it('jsonconditionv2: the when expression throws', async function () {
      stub(TiledeskWhenExpression.prototype, 'evaluate', () => { throw new Error('bad expression'); });
      await check('jsoncondition2', () => new DirJSONConditionV2(makeContext({ score: 10 })), { when: 'score == 10' });
    });
    it('ifopenhours: the isopen call fails', async function () {
      stub(httpUtils, 'request', (req, cb) => setImmediate(() => cb(new Error('down'))));
      await check('ifopenhours', () => new DirIfOpenHours(makeContext()));
    });
    it('ifonlineagentsv2: no department_id in the attributes', async function () {
      await check('ifonlineagentsv2', () => new DirIfOnlineAgentsV2(makeContext()), { ignoreOperatingHours: true, selectedOption: 'currentDep' });
    });
    it('the plain false outcomes stay success / false', async function () {
      stub(httpUtils, 'request', (req, cb) => setImmediate(() => cb(null, { isopen: false })));
      const r = await traced(() => new DirIfOpenHours(makeContext()), { name: 'ifopenhours', action: Object.assign({}, action) });
      assert.deepStrictEqual([r.jumps, r.outcome, r.exit_taken], [['#f'], 'success', 'false']);
    });
  });
});

// Stage findings (2026-11-12): the case a multi condition / AI condition took is recorded by its label, the
// button of a menu by its text, and two engine hangs / double callbacks found on the same run.
describe('executions: named branches and engine fixes (stage findings)', function () {
  this.timeout(10000);
  const { DirJSONConditionMulti } = require('../tiledeskChatbotPlugs/directives/DirJSONConditionMulti');
  const { DirAiCondition } = require('../tiledeskChatbotPlugs/directives/DirAiCondition');
  const { DirDepartment } = require('../tiledeskChatbotPlugs/directives/DirDepartment');
  let savedEnv;
  const restores = [];
  const stub = (obj, key, fn) => {
    const orig = obj[key];
    obj[key] = fn;
    restores.push(() => { obj[key] = orig; });
  };
  before(function () { savedEnv = process.env.EXECUTIONS_ENABLED; process.env.EXECUTIONS_ENABLED = 'true'; });
  after(function () {
    if (savedEnv === undefined) delete process.env.EXECUTIONS_ENABLED;
    else process.env.EXECUTIONS_ENABLED = savedEnv;
  });
  afterEach(function () { while (restores.length) restores.pop()(); });

  describe('multi condition', function () {
    const multi = () => new DirJSONConditionMulti(makeContext({ word: 'hello' }));
    const action = (word) => ({
      cases: [
        { label: 'bye', when: `word == "${word === 'bye' ? 'hello' : 'nope'}"`, intent: '#same' },
        { label: 'hello', when: 'word == "hello"', intent: '#same' }
      ],
      elseIntent: '#same'
    });
    it('the matched case is the exit, by its label, even when every case leads to the same block', async function () {
      const r = await traced(multi, { name: 'jsonconditionmulti', action: action('hello') });
      assert.deepStrictEqual([r.jumps, r.outcome, r.exit_taken], [['#same'], 'success', 'hello']);
      const first = await traced(multi, { name: 'jsonconditionmulti', action: action('bye') });
      assert.strictEqual(first.exit_taken, 'bye');
    });
    it('no case matched -> success / else', async function () {
      const r = await traced(multi, { name: 'jsonconditionmulti', action: { cases: [{ label: 'x', when: 'word == "no"', intent: '#a' }], elseIntent: '#same' } });
      assert.deepStrictEqual([r.jumps, r.outcome, r.exit_taken], [['#same'], 'success', 'else']);
    });
    it('flag off: the same jumps and callbacks', async function () {
      const on = await traced(multi, { name: 'jsonconditionmulti', action: action('hello') });
      const off = await untraced(multi, { name: 'jsonconditionmulti', action: action('hello') });
      assert.deepStrictEqual(off, { jumps: on.jumps, stops: on.stops });
    });
  });

  describe('AI condition', function () {
    const make = () => new DirAiCondition(makeContext());
    const action = {
      llm: 'openrouter', model: 'm', instructions: '',
      intents: [{ label: 'positive', prompt: 'p', conditionIntentId: '#same' }, { label: 'negative', prompt: 'n', conditionIntentId: '#same' }],
      fallbackIntent: '#same', errorIntent: '#err'
    };
    const answer = (a) => {
      stub(aiController, 'resolveLLMConfig', async () => ({ name: 'm', provider: 'openrouter', api_key: 'key' }));
      stub(httpUtils, 'request', (req, cb) => setImmediate(() => cb(null, /\/ask$/.test(req.url) ? { answer: a, success: true } : { isAvailable: true })));
    };
    it('a matched condition is the exit, by its label', async function () {
      answer('negative');
      const r = await traced(make, { name: 'ai_condition', action });
      assert.deepStrictEqual([r.jumps, r.outcome, r.exit_taken], [['#same'], 'success', 'negative']);
    });
    it('fallback stays success / fallback', async function () {
      answer('fallback');
      const r = await traced(make, { name: 'ai_condition', action });
      assert.deepStrictEqual([r.outcome, r.exit_taken], ['success', 'fallback']);
    });
  });

  describe('if open hours: one callback per run (the block\'s next action used to run after the jump)', function () {
    const make = () => new DirIfOpenHours(makeContext());
    for (const [isopen, target] of [[true, '#t'], [false, '#f']]) {
      it(`isopen ${isopen}: one jump, one callback`, async function () {
        stub(httpUtils, 'request', (req, cb) => setImmediate(() => cb(null, { isopen })));
        const r = await traced(make, { name: 'ifopenhours', action: { trueIntent: '#t', falseIntent: '#f', stopOnConditionMet: true } });
        assert.deepStrictEqual(r.jumps, [target]);
        assert.deepStrictEqual(r.stops, [true]);
      });
    }
    it('the isopen call fails and no false exit is set: it calls back (it used to hang)', async function () {
      stub(httpUtils, 'request', (req, cb) => setImmediate(() => cb(new Error('down'))));
      const r = await traced(make, { name: 'ifopenhours', action: { trueIntent: '#t' } });
      assert.deepStrictEqual([r.jumps, r.stops.length], [[], 1]);
    });
  });

  describe('change department', function () {
    const deps = [{ _id: 'd1', name: 'Sales', hasBot: false }, { _id: 'd2', name: 'Bots', hasBot: true, id_bot: 'b1' }];
    const make = (vars, calls) => {
      const d = new DirDepartment(makeContext(vars));
      d.tdClient = {
        getAllDepartments: (cb) => setImmediate(() => cb(null, deps)),
        updateRequestDepartment: (rid, depId, x, cb) => { calls.push(depId); setImmediate(() => cb(null, {})); },
        sendSupportMessage: (rid, msg, cb) => { calls.push('msg:' + msg.text); setImmediate(() => cb(null)); }
      };
      return d;
    };
    const run = (d, action) => new Promise((resolve) => {
      const t = setTimeout(() => resolve('hung'), 1000);
      d.execute({ action }, () => { clearTimeout(t); resolve('called back'); });
    });
    it('fills {{attributes}} in the department name', async function () {
      const calls = [];
      assert.strictEqual(await run(make({ department_name: 'sales' }, calls), { depName: '{{department_name}}' }), 'called back');
      assert.deepStrictEqual(calls, ['d1']);
    });
    it('no department by that name: it calls back (it used to hang)', async function () {
      const calls = [];
      assert.strictEqual(await run(make({}, calls), { depName: 'Nowhere' }), 'called back');
      assert.deepStrictEqual(calls, []);
    });
    it('triggerBot on a department with no bot: it calls back (it used to hang)', async function () {
      const calls = [];
      assert.strictEqual(await run(make({}, calls), { depName: 'Sales', triggerBot: true }), 'called back');
      assert.deepStrictEqual(calls, ['d1']);
    });
    it('triggerBot on a department with a bot: the hidden /start, then the callback', async function () {
      const calls = [];
      assert.strictEqual(await run(make({}, calls), { depName: 'Bots', triggerBot: true }), 'called back');
      assert.deepStrictEqual(calls, ['d2', 'msg:/start']);
    });
  });
});
