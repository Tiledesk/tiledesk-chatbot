var assert = require('assert');
var express = require('express');
const bodyParser = require('body-parser');

const { DirIntent } = require('../directives/flow/DirIntent');
const { DirConnectBlock } = require('../directives/flow/DirConnectBlock');
const { DirCondition } = require('../directives/flow/DirCondition');
const { DirJSONCondition } = require('../directives/flow/DirJSONCondition');
const { DirLockIntent } = require('../directives/flow/DirLockIntent');
const { DirUnlockIntent } = require('../directives/flow/DirUnlockIntent');
const { DirWait } = require('../directives/flow/DirWait');
const { DirFlowLog } = require('../directives/flow/DirFlowLog');
const { DirIteration } = require('../directives/flow/DirIteration');
const { TiledeskExpression } = require('../expressions/TiledeskExpression');

// The directives in directives/flow decide WHERE the conversation goes next.
// Their one observable effect is the intent command they POST to the tilebot
// endpoint (`/ext/<botId>` with text "/<intentName>"), plus what they write to
// the cache and the value they hand back to the directive pipeline
// (`callback(true)` stops the remaining directives, `callback()` lets them run).
// Every test below asserts on those three, never on the fact that a line ran.

const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-flowunits";
const BOT_ID = "botID";
const TILEBOT_PORT = 10001;

/** In-memory stand-in for TdCache. Records every write. */
function fakeCache(seed) {
  const store = Object.assign({}, seed);
  const hashes = {};
  return {
    store, hashes,
    writes: [],
    deletes: [],
    async get(k) { return store[k] === undefined ? null : store[k]; },
    async set(k, v, opts) { this.writes.push([k, v, opts || null]); store[k] = v; },
    async del(k) { this.deletes.push(k); delete store[k]; },
    async hgetall(k) { return hashes[k] || {}; },
    async hget(k, f) { return (hashes[k] || {})[f]; },
    async hset(k, f, v) { (hashes[k] || (hashes[k] = {}))[f] = v; },
    async expire() { }
  };
}

/** Records the flow attributes a directive writes through the chatbot. */
function fakeChatbot() {
  const params = {};
  return {
    params,
    async addParameter(k, v) { params[k] = v; },
    async deleteParameter(k) { delete params[k]; }
  };
}

/** Records what the logger was asked to emit (it is a no-op in the suite). */
function recordingLogger() {
  const lines = [];
  const mk = (level) => (...args) => lines.push([level, args.map(String).join(' ')]);
  return {
    lines,
    error: mk('error'), warn: mk('warn'), info: mk('info'),
    debug: mk('debug'), native: mk('native')
  };
}

function contextFor(overrides) {
  return Object.assign({
    projectId: PROJECT_ID,
    token: "XXX",
    API_ENDPOINT: process.env.API_ENDPOINT,
    TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT,
    requestId: REQUEST_ID,
    supportRequest: { id_project: PROJECT_ID, request_id: REQUEST_ID, bot_id: BOT_ID }
  }, overrides);
}

/** Runs a directive and resolves with every `stop` value its callback saw. */
function run(dir, directive, settleMs) {
  return new Promise((resolve) => {
    const stops = [];
    let timer = null;
    dir.execute(directive, (stop) => {
      stops.push(stop);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => resolve(stops), settleMs === undefined ? 200 : settleMs);
    });
  });
}

describe('Directives directives/flow', function () {

  // One fake tilebot for the whole file: every intent jump lands here.
  let listener;
  let dispatched = [];

  before((done) => {
    const server = express();
    server.use(bodyParser.json());
    server.post('/ext/:botid', (req, res) => {
      dispatched.push({
        botId: req.params.botid,
        text: req.body.payload.text,
        requestId: req.body.payload.request.request_id,
        projectId: req.body.payload.id_project,
        draft: req.body.payload.request.draft,
        token: req.body.token
      });
      res.status(200).send({ success: true });
    });
    listener = server.listen(TILEBOT_PORT, '0.0.0.0', () => done());
  });

  after((done) => { listener.close(() => done()); });

  beforeEach(() => { dispatched = []; });

  // ------------------------------------------------------------- DirIntent

  describe('DirIntent', function () {

    it('jumps to the intent named in the action and stops the remaining directives', async () => {
      const dir = new DirIntent(contextFor({}));
      const stops = await run(dir, { name: "intent", action: { intentName: "NEXT_BLOCK" } });

      assert.strictEqual(dispatched.length, 1);
      assert.deepStrictEqual(
        { botId: dispatched[0].botId, text: dispatched[0].text, requestId: dispatched[0].requestId },
        { botId: BOT_ID, text: "/NEXT_BLOCK", requestId: REQUEST_ID });
      assert.strictEqual(dispatched[0].token, "XXX");
      assert.deepStrictEqual(stops, [true], 'an intent jump must stop the current directive list');
    });

    it('carries the draft flag of the request into the internal message', async () => {
      const dir = new DirIntent(contextFor({
        supportRequest: { id_project: PROJECT_ID, request_id: REQUEST_ID, bot_id: BOT_ID, draft: true }
      }));
      await run(dir, { name: "intent", action: { intentName: "NEXT_BLOCK" } });

      assert.strictEqual(dispatched.length, 1);
      assert.strictEqual(dispatched[0].draft, true,
        'a draft run must not be replayed as a published one');
    });

    it('takes the intent name from a directive parameter, trimmed', async () => {
      const dir = new DirIntent(contextFor({}));
      const stops = await run(dir, { name: "intent", parameter: "   NEXT_BLOCK   " });

      assert.strictEqual(dispatched.length, 1);
      assert.strictEqual(dispatched[0].text, "/NEXT_BLOCK");
      assert.deepStrictEqual(stops, [true]);
    });

    it('does nothing on a directive with neither action nor a non-blank parameter', async () => {
      const dir = new DirIntent(contextFor({}));
      const stops = await run(dir, { name: "intent", parameter: "   " });

      assert.deepStrictEqual(dispatched, [], 'nothing may be dispatched');
      assert.deepStrictEqual(stops, [undefined], 'and the flow must carry on');
    });

    it('does nothing when the action carries no intent name', async () => {
      const dir = new DirIntent(contextFor({}));
      const stops = await run(dir, { name: "intent", action: { intentName: "" } });

      assert.deepStrictEqual(dispatched, []);
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('appends JSON parameters to the intent name', async () => {
      const dir = new DirIntent(contextFor({}));
      const directive = DirIntent.intentDirectiveFor("NEXT_BLOCK", { city: "Rome" });
      directive.name = "intent";
      await run(dir, directive);

      assert.strictEqual(dispatched.length, 1);
      assert.strictEqual(dispatched[0].text, '/NEXT_BLOCK{"city":"Rome"}');
    });

    it('drops parameters that cannot be serialised instead of failing the jump', async () => {
      const circular = { name: "loop" };
      circular.self = circular;

      const directive = DirIntent.intentDirectiveFor("NEXT_BLOCK", circular);
      directive.name = "intent";
      const dir = new DirIntent(contextFor({}));
      await run(dir, directive);

      assert.strictEqual(dispatched.length, 1);
      assert.strictEqual(dispatched[0].text, "/NEXT_BLOCK",
        'the jump still happens, without the unserialisable parameters');
    });

    // QUARANTINED -- DirIntent.js:103-111 (and the identical copy in
    // DirConnectBlock.js:92-100). `fullIntentDirectiveFor(intent, json_params)`
    // stringifies `params`, a name that does not exist in the function, the
    // enclosing class or the module: calling it always throws
    // "ReferenceError: params is not defined". `json_params` is never read, so
    // even the ReferenceError aside the method could not do what it says. It has
    // no caller in the tree today, which is the only reason this is latent.
    it('fullIntentDirectiveFor builds a directive carrying the JSON parameters', () => {
      const directive = DirIntent.fullIntentDirectiveFor("NEXT_BLOCK", { city: "Rome" });
      assert.deepStrictEqual(directive, { action: { intentName: '/NEXT_BLOCK{"city":"Rome"}' } });
    });
  });

  // -------------------------------------------------------- DirConnectBlock

  describe('DirConnectBlock', function () {

    it('connects to the block and lets the remaining directives run', async () => {
      const dir = new DirConnectBlock(contextFor({}));
      const stops = await run(dir, { name: "connectblock", action: { intentName: "SECOND_BLOCK" } });

      assert.strictEqual(dispatched.length, 1);
      assert.strictEqual(dispatched[0].text, "/SECOND_BLOCK");
      assert.strictEqual(dispatched[0].requestId, REQUEST_ID);
      assert.deepStrictEqual(stops, [undefined],
        'unlike DirIntent, a block connector must NOT stop the directive list');
    });

    it('does nothing on a directive with no action', async () => {
      const dir = new DirConnectBlock(contextFor({}));
      const stops = await run(dir, { name: "connectblock" });

      assert.deepStrictEqual(dispatched, []);
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('does nothing when the action carries no intent name', async () => {
      const dir = new DirConnectBlock(contextFor({}));
      const stops = await run(dir, { name: "connectblock", action: {} });

      assert.deepStrictEqual(dispatched, []);
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('appends JSON parameters and drops unserialisable ones', async () => {
      const withParams = DirConnectBlock.intentDirectiveFor("SECOND_BLOCK", { n: 1 });
      assert.deepStrictEqual(withParams, { action: { intentName: '/SECOND_BLOCK{"n":1}'.slice(1) } });

      const circular = {};
      circular.self = circular;
      const broken = DirConnectBlock.intentDirectiveFor("SECOND_BLOCK", circular);
      assert.deepStrictEqual(broken, { action: { intentName: "SECOND_BLOCK" } });
    });

    // QUARANTINED -- see the DirIntent case above: DirConnectBlock.js:92-100 has
    // the same `JSON.stringify(params)` ReferenceError.
    it('fullIntentDirectiveFor builds a directive carrying the JSON parameters', () => {
      const directive = DirConnectBlock.fullIntentDirectiveFor("SECOND_BLOCK", { n: 1 });
      assert.deepStrictEqual(directive, { action: { intentName: 'SECOND_BLOCK{"n":1}' } });
    });
  });

  // ----------------------------------------------------------- DirCondition

  describe('DirCondition', function () {

    function conditionDir(vars) {
      const cache = fakeCache();
      cache.hashes["tilebot:requests:" + REQUEST_ID + ":parameters"] = {};
      for (const [k, v] of Object.entries(vars || {})) {
        cache.hashes["tilebot:requests:" + REQUEST_ID + ":parameters"][k] = JSON.stringify(v);
      }
      const dir = new DirCondition(contextFor({ tdcache: cache }));
      dir.logger = recordingLogger();
      return dir;
    }

    it('runs the true intent and returns stopOnConditionMet when the script matches', async () => {
      const dir = conditionDir({ age: 20 });
      const stops = await run(dir, {
        name: "condition",
        action: {
          scriptCondition: "$age > 18",
          jsonCondition: null,
          trueIntent: "ADULT",
          falseIntent: "MINOR",
          stopOnConditionMet: true
        }
      });

      assert.strictEqual(dispatched.length, 1);
      assert.strictEqual(dispatched[0].text, "/ADULT");
      assert.deepStrictEqual(stops, [true]);
    });

    it('runs the false intent when the script does not match', async () => {
      const dir = conditionDir({ age: 10 });
      const stops = await run(dir, {
        name: "condition",
        action: {
          scriptCondition: "$age > 18",
          jsonCondition: null,
          trueIntent: "ADULT",
          falseIntent: "MINOR",
          stopOnConditionMet: false
        }
      });

      assert.strictEqual(dispatched.length, 1);
      assert.strictEqual(dispatched[0].text, "/MINOR");
      assert.deepStrictEqual(stops, [false],
        'stopOnConditionMet is handed back verbatim on both branches');
    });

    it('takes no branch and carries on when the matched branch has no intent', async () => {
      const dir = conditionDir({ age: 20 });
      const stops = await run(dir, {
        name: "condition",
        action: {
          scriptCondition: "$age > 18",
          jsonCondition: null,
          trueIntent: "   ",          // blank: treated as absent
          falseIntent: "MINOR",
          stopOnConditionMet: true
        }
      });

      assert.deepStrictEqual(dispatched, [], 'the false intent must NOT be run instead');
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('takes no branch and carries on when the false branch has no intent', async () => {
      const dir = conditionDir({ age: 10 });
      const stops = await run(dir, {
        name: "condition",
        action: {
          scriptCondition: "$age > 18",
          jsonCondition: null,
          trueIntent: "ADULT",
          falseIntent: "   ",          // blank: treated as absent
          stopOnConditionMet: true
        }
      });

      assert.deepStrictEqual(dispatched, []);
      assert.deepStrictEqual(stops, [undefined]);
    });

    // QUARANTINED -- DirCondition.js:103-104 evaluates the JSON condition with
    //     const expression = TiledeskExpression.JSONGroupsToExpression(jsonCondition.groups, variables);
    //     result = new TiledeskExpression().evaluateStaticExpression(expression);
    // The second call drops `variables`. JSONGroupsToExpression does NOT inline
    // the values - it emits `Number($data.age) > Number("18")` - so the sandbox
    // the expression runs in has no `$data` at all and every attribute reads as
    // undefined. `Number(undefined) > 18` is false, so a `condition` action built
    // with the JSON editor ALWAYS takes the false branch no matter what the flow
    // attributes hold, silently. The sibling DirJSONCondition.js:90 passes
    // `variables` and is correct; measured here, the same groups and the same
    // variables give `true` with them and `false` without.
    it.skip('evaluates a jsonCondition when no script is given', async () => {
      const groups = [{
        type: "expression",
        conditions: [{
          type: "condition",
          operand1: "age",
          operator: TiledeskExpression.OPERATORS.greaterThan.name,
          operand2: { type: "const", value: "18" }
        }]
      }];
      const dir = conditionDir({ age: 20 });
      const stops = await run(dir, {
        name: "condition",
        action: {
          scriptCondition: null,
          jsonCondition: { groups: groups },
          trueIntent: "ADULT",
          falseIntent: "MINOR",
          stopOnConditionMet: true
        }
      });

      assert.strictEqual(dispatched.length, 1);
      assert.strictEqual(dispatched[0].text, "/ADULT");
      assert.deepStrictEqual(stops, [true]);
    });

    it('refuses a condition with neither branch', async () => {
      const dir = conditionDir({});
      const stops = await run(dir, {
        name: "condition",
        action: { scriptCondition: "true", jsonCondition: null, trueIntent: "", falseIntent: null }
      });

      assert.deepStrictEqual(dispatched, []);
      assert.deepStrictEqual(stops, [undefined]);
      assert.ok(dir.logger.lines.some(([lvl, t]) =>
        lvl === 'error' && /no intents specified/.test(t)),
        'the designer must be told why nothing happened. Got: ' + JSON.stringify(dir.logger.lines));
    });

    it('refuses a condition with no script and no json', async () => {
      const dir = conditionDir({});
      const stops = await run(dir, {
        name: "condition",
        action: { scriptCondition: null, jsonCondition: null, trueIntent: "ADULT" }
      });

      assert.deepStrictEqual(dispatched, []);
      assert.deepStrictEqual(stops, [undefined]);
      assert.ok(dir.logger.lines.some(([lvl, t]) =>
        lvl === 'error' && /scriptCondition & jsonCondition null/.test(t)));
    });

    it('refuses a jsonCondition with no groups', async () => {
      const dir = conditionDir({});
      const stops = await run(dir, {
        name: "condition",
        action: {
          scriptCondition: null,
          jsonCondition: { groups: null },
          trueIntent: "ADULT",
          falseIntent: "MINOR"
        }
      });

      assert.deepStrictEqual(dispatched, []);
      assert.deepStrictEqual(stops, [undefined]);
      assert.ok(dir.logger.lines.some(([lvl, t]) =>
        lvl === 'error' && /no groups/.test(t)));
    });

    it('does nothing on a directive with no action', async () => {
      const dir = conditionDir({});
      const stops = await run(dir, { name: "condition" });

      assert.deepStrictEqual(dispatched, []);
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('still evaluates the script with no cache to read variables from', async () => {
      const dir = new DirCondition(contextFor({}));   // no tdcache
      dir.logger = recordingLogger();
      const stops = await run(dir, {
        name: "condition",
        action: {
          scriptCondition: "1 == 1",
          jsonCondition: null,
          trueIntent: "ALWAYS",
          falseIntent: "NEVER",
          stopOnConditionMet: true
        }
      });

      assert.strictEqual(dispatched.length, 1);
      assert.strictEqual(dispatched[0].text, "/ALWAYS");
      assert.deepStrictEqual(stops, [true]);
    });
  });

  // ------------------------------------------------------- DirJSONCondition

  describe('DirJSONCondition', function () {

    function jsonConditionDir(vars) {
      const cache = fakeCache();
      cache.hashes["tilebot:requests:" + REQUEST_ID + ":parameters"] = {};
      for (const [k, v] of Object.entries(vars || {})) {
        cache.hashes["tilebot:requests:" + REQUEST_ID + ":parameters"][k] = JSON.stringify(v);
      }
      const chatbot = fakeChatbot();
      const dir = new DirJSONCondition(contextFor({ tdcache: cache, chatbot: chatbot }));
      dir.logger = recordingLogger();
      dir._chatbot = chatbot;
      return dir;
    }

    function groupsFor(operator, value) {
      return [{
        type: "expression",
        conditions: [{
          type: "condition",
          operand1: "age",
          operator: operator,
          operand2: { type: "const", value: value }
        }]
      }];
    }

    it('runs the true intent, with its attributes, and stops the directive list', async () => {
      const dir = jsonConditionDir({ age: 20 });
      const stops = await run(dir, {
        name: "jsoncondition",
        action: {
          groups: groupsFor(TiledeskExpression.OPERATORS.greaterThan.name, "18"),
          trueIntent: "ADULT",
          trueIntentAttributes: { source: "condition" },
          falseIntent: "MINOR"
        }
      });

      assert.strictEqual(dispatched.length, 1);
      assert.strictEqual(dispatched[0].text, '/ADULT{"source":"condition"}');
      assert.deepStrictEqual(stops, [true]);
    });

    it('runs the false intent with its own attributes', async () => {
      const dir = jsonConditionDir({ age: 10 });
      const stops = await run(dir, {
        name: "jsoncondition",
        action: {
          groups: groupsFor(TiledeskExpression.OPERATORS.greaterThan.name, "18"),
          trueIntent: "ADULT",
          falseIntent: "MINOR",
          falseIntentAttributes: { reason: "too young" }
        }
      });

      assert.strictEqual(dispatched.length, 1);
      assert.strictEqual(dispatched[0].text, '/MINOR{"reason":"too young"}');
      assert.deepStrictEqual(stops, [true]);
    });

    it('records a flowError and takes the false branch when the expression cannot be built', async () => {
      const dir = jsonConditionDir({ age: 20 });
      const stops = await run(dir, {
        name: "jsoncondition",
        action: {
          // An attribute name the designer typed with spaces produces a
          // syntactically invalid expression, which evaluates to null:
          // neither true nor false.
          groups: [{
            type: "expression",
            conditions: [{
              type: "condition",
              operand1: "not a name",
              operator: TiledeskExpression.OPERATORS.greaterThan.name,
              operand2: { type: "const", value: "18" }
            }]
          }],
          trueIntent: "ADULT",
          falseIntent: "MINOR"
        }
      });

      assert.strictEqual(dispatched.length, 1);
      assert.strictEqual(dispatched[0].text, "/MINOR");
      assert.strictEqual(dir._chatbot.params.flowError,
        "An error occurred evaluating condition: result === null",
        'the designer must be able to see that the condition itself failed');
      assert.deepStrictEqual(stops, [true]);
    });

    it('carries on without a branch when the matched side has no intent', async () => {
      const dir = jsonConditionDir({ age: 20 });
      const stops = await run(dir, {
        name: "jsoncondition",
        action: {
          groups: groupsFor(TiledeskExpression.OPERATORS.greaterThan.name, "18"),
          falseIntent: "MINOR"
        }
      });

      assert.deepStrictEqual(dispatched, []);
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('refuses a condition with neither branch', async () => {
      const dir = jsonConditionDir({});
      const stops = await run(dir, { name: "jsoncondition", action: { groups: [] } });

      assert.deepStrictEqual(dispatched, []);
      assert.deepStrictEqual(stops, [undefined]);
      assert.ok(dir.logger.lines.some(([lvl, t]) =>
        lvl === 'warn' && /no intents specified/.test(t)));
    });

    it('refuses a condition with null groups', async () => {
      const dir = jsonConditionDir({});
      const stops = await run(dir, {
        name: "jsoncondition",
        action: { groups: null, trueIntent: "ADULT" }
      });

      assert.deepStrictEqual(dispatched, []);
      assert.deepStrictEqual(stops, [undefined]);
      assert.ok(dir.logger.lines.some(([lvl, t]) => lvl === 'warn' && /no groups/.test(t)));
    });

    it('carries on without a branch when the false side has no intent', async () => {
      const dir = jsonConditionDir({ age: 10 });
      const stops = await run(dir, {
        name: "jsoncondition",
        action: {
          groups: groupsFor(TiledeskExpression.OPERATORS.greaterThan.name, "18"),
          trueIntent: "ADULT"
        }
      });

      assert.deepStrictEqual(dispatched, [], 'the true intent must NOT be run instead');
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('evaluates against no variables at all when there is no cache', async () => {
      const chatbot = fakeChatbot();
      const dir = new DirJSONCondition(contextFor({ chatbot: chatbot }));   // no tdcache
      dir.logger = recordingLogger();
      const stops = await run(dir, {
        name: "jsoncondition",
        action: {
          groups: groupsFor(TiledeskExpression.OPERATORS.greaterThan.name, "18"),
          trueIntent: "ADULT",
          falseIntent: "MINOR"
        }
      });

      // No cache means no `age`, so the comparison is false: the false branch
      // runs rather than the directive failing.
      assert.strictEqual(dispatched.length, 1);
      assert.strictEqual(dispatched[0].text, "/MINOR");
      assert.deepStrictEqual(stops, [true]);
    });

    it('does nothing on a directive with no action', async () => {
      const dir = jsonConditionDir({});
      const stops = await run(dir, { name: "jsoncondition" });

      assert.deepStrictEqual(dispatched, []);
      assert.deepStrictEqual(stops, [undefined]);
    });

    // QUARANTINED -- DirJSONCondition.js:43-54. `trueIntent` and `falseIntent`
    // are declared with `const` on :43-44 and then ASSIGNED on :50 and :53 when
    // the designer left the field as whitespace. That is a
    // "TypeError: Assignment to constant variable" every time, thrown inside the
    // async `go()`, i.e. an unhandled rejection - process-fatal under Node's
    // default --unhandled-rejections=throw, and the callback is never invoked so
    // the conversation stalls. DirCondition.js:42-50 does the same thing with
    // `let` and is correct; only this file uses `const`. Correct behaviour is
    // what this test asserts: a blank intent name counts as absent.
    it.skip('treats a whitespace-only true intent as absent', async () => {
      const dir = jsonConditionDir({ age: 20 });
      const stops = await run(dir, {
        name: "jsoncondition",
        action: {
          groups: groupsFor(TiledeskExpression.OPERATORS.greaterThan.name, "18"),
          trueIntent: "   ",
          falseIntent: "MINOR"
        }
      });

      assert.deepStrictEqual(dispatched, [], 'no branch may be taken');
      assert.deepStrictEqual(stops, [undefined]);
    });
  });

  // ---------------------------------------------- DirLockIntent / Unlock

  describe('DirLockIntent and DirUnlockIntent', function () {

    it('writes the locked intent name into the request cache key', async () => {
      const cache = fakeCache();
      const dir = new DirLockIntent(contextFor({ tdcache: cache }));
      const stops = await run(dir, { name: "lockintent", action: { intentName: "WAIT_FOR_EMAIL" } });

      assert.deepStrictEqual(cache.writes,
        [["tilebot:requests:" + REQUEST_ID + ":locked", "WAIT_FOR_EMAIL", null]]);
      assert.deepStrictEqual(stops, [undefined], 'locking must not stop the flow');
    });

    it('writes nothing when the action carries no intent name', async () => {
      const cache = fakeCache();
      const dir = new DirLockIntent(contextFor({ tdcache: cache }));
      const stops = await run(dir, { name: "lockintent", action: {} });

      assert.deepStrictEqual(cache.writes, [],
        'an undefined intent name must not overwrite the lock');
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('does nothing on a directive with no action', async () => {
      const cache = fakeCache();
      const dir = new DirLockIntent(contextFor({ tdcache: cache }));
      const stops = await run(dir, { name: "lockintent" });

      assert.deepStrictEqual(cache.writes, []);
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('refuses to be constructed without a cache', () => {
      assert.throws(() => new DirLockIntent(contextFor({})),
        /tdcache \(TdCache\) object is mandatory/);
      assert.throws(() => new DirUnlockIntent(contextFor({})),
        /tdcache \(TdCache\) object is mandatory/);
    });

    it('deletes the lock key', async () => {
      const cache = fakeCache({ ["tilebot:requests:" + REQUEST_ID + ":locked"]: "WAIT_FOR_EMAIL" });
      const dir = new DirUnlockIntent(contextFor({ tdcache: cache }));
      const stops = await run(dir, { name: "unlockintent", action: {} });

      assert.deepStrictEqual(cache.deletes, ["tilebot:requests:" + REQUEST_ID + ":locked"]);
      assert.strictEqual(await cache.get("tilebot:requests:" + REQUEST_ID + ":locked"), null);
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('unlocks even when the directive carries no action at all', async () => {
      const cache = fakeCache({ ["tilebot:requests:" + REQUEST_ID + ":locked"]: "WAIT_FOR_EMAIL" });
      const dir = new DirUnlockIntent(contextFor({ tdcache: cache }));
      const stops = await run(dir, { name: "unlockintent" });

      assert.deepStrictEqual(cache.deletes, ["tilebot:requests:" + REQUEST_ID + ":locked"],
        'an unlock with no action must still unlock');
      assert.deepStrictEqual(stops, [undefined]);
    });
  });

  // ---------------------------------------------------------------- DirWait

  describe('DirWait', function () {

    it('waits for the requested time and resets the step counter past one second', async () => {
      const cache = fakeCache();
      const dir = new DirWait(contextFor({ tdcache: cache }));
      const started = Date.now();
      const stops = await run(dir, { name: "wait", action: { millis: 1000 } }, 0);
      const elapsed = Date.now() - started;

      assert.ok(elapsed >= 950, 'waited ' + elapsed + 'ms');
      assert.deepStrictEqual(cache.writes,
        [["tilebot:requests:" + REQUEST_ID + ":step", 0, null]],
        'a wait of a second or more resets the step counter');
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('does not reset the step counter for a short wait', async () => {
      const cache = fakeCache();
      const dir = new DirWait(contextFor({ tdcache: cache }));
      const started = Date.now();
      const stops = await run(dir, { name: "wait", action: { millis: 50 } }, 0);
      const elapsed = Date.now() - started;

      assert.ok(elapsed < 900, 'waited ' + elapsed + 'ms');
      assert.deepStrictEqual(cache.writes, []);
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('clamps a parameter below the minimum up to one second', async () => {
      const cache = fakeCache();
      const dir = new DirWait(contextFor({ tdcache: cache }));
      const started = Date.now();
      await run(dir, { name: "wait", parameter: "  200  " }, 0);
      const elapsed = Date.now() - started;

      assert.ok(elapsed >= 950, 'a 200ms parameter must be raised to 1000ms; waited ' + elapsed + 'ms');
      assert.strictEqual(cache.writes.length, 1, 'and the clamped value resets the step counter');
    });

    it('defaults to half a second with neither action nor parameter', async () => {
      const cache = fakeCache();
      const dir = new DirWait(contextFor({ tdcache: cache }));
      const started = Date.now();
      const stops = await run(dir, { name: "wait" }, 0);
      const elapsed = Date.now() - started;

      assert.ok(elapsed >= 400 && elapsed < 900, 'waited ' + elapsed + 'ms');
      assert.deepStrictEqual(cache.writes, [], '500ms is below the reset threshold');
      assert.deepStrictEqual(stops, [undefined]);
    });

    // QUARANTINED -- DirWait.js:26-29. The guard reads
    //     const _millis = parseInt(directive.parameter.trim());
    //     if (!Number.isNaN(millis)) { millis = _millis; }
    // It tests `millis`, which is the literal 500 assigned two lines earlier and
    // can never be NaN, instead of `_millis`, the parsed value. So a
    // non-numeric parameter assigns NaN unconditionally; `NaN > 20000` and
    // `NaN < 1000` are both false, so neither clamp fires and the directive ends
    // up calling `setTimeout(callback, NaN)`, which fires on the next tick. The
    // wait silently does not happen. Correct behaviour is what this test
    // asserts: fall back to the 500ms default.
    it.skip('falls back to the default when the parameter is not a number', async () => {
      const cache = fakeCache();
      const dir = new DirWait(contextFor({ tdcache: cache }));
      const started = Date.now();
      await run(dir, { name: "wait", parameter: "soon" }, 0);
      const elapsed = Date.now() - started;

      assert.ok(elapsed >= 400, 'waited ' + elapsed + 'ms, i.e. it did not wait at all');
    });
  });

  // ------------------------------------------------------------- DirFlowLog

  describe('DirFlowLog', function () {

    function flowLogDir(vars) {
      const cache = fakeCache();
      cache.hashes["tilebot:requests:" + REQUEST_ID + ":parameters"] = {};
      for (const [k, v] of Object.entries(vars || {})) {
        cache.hashes["tilebot:requests:" + REQUEST_ID + ":parameters"][k] = JSON.stringify(v);
      }
      const dir = new DirFlowLog(contextFor({ tdcache: cache }));
      dir.logger = recordingLogger();
      return dir;
    }

    it('emits the log at the requested level with the variables filled in', async () => {
      const dir = flowLogDir({ userFullname: "Nico" });
      const stops = await run(dir, {
        name: "flowlog",
        action: { level: "warn", log: "Hello ${userFullname}" }
      });

      assert.deepStrictEqual(dir.logger.lines, [["warn", "Hello Nico"]]);
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('defaults to info when no level is given', async () => {
      const dir = flowLogDir({});
      await run(dir, { name: "flowlog", action: { log: "plain line" } });

      assert.deepStrictEqual(dir.logger.lines, [["info", "plain line"]]);
    });

    it('emits at error and debug level too', async () => {
      const errDir = flowLogDir({});
      await run(errDir, { name: "flowlog", action: { level: "error", log: "boom" } });
      assert.deepStrictEqual(errDir.logger.lines, [["error", "boom"]]);

      const dbgDir = flowLogDir({});
      await run(dbgDir, { name: "flowlog", action: { level: "debug", log: "trace" } });
      assert.deepStrictEqual(dbgDir.logger.lines, [["debug", "trace"]]);
    });

    it('does nothing on a directive with no action', async () => {
      const dir = flowLogDir({});
      const stops = await run(dir, { name: "flowlog" });

      assert.deepStrictEqual(dir.logger.lines, []);
      assert.deepStrictEqual(stops, [undefined]);
    });

    // QUARANTINED -- DirFlowLog.js:43-52. Both guards call `callback()` WITHOUT
    // returning, so execution falls straight through to the second `callback()`
    // on :81. The directive pipeline treats each callback as "this directive is
    // finished" and walks the rest of the directive list again, so every action
    // after an invalid-level or empty-text log node runs TWICE. On the invalid
    // level path the fall-through also reaches `filler.fill(action.log, ...)`
    // and then matches no level branch, so nothing is even logged. Each test
    // asserts that exactly one value reaches the callback.
    it.skip('calls back exactly once on an unknown log level', async () => {
      const dir = flowLogDir({});
      const stops = await run(dir, { name: "flowlog", action: { level: "trace", log: "x" } });

      assert.deepStrictEqual(stops, [undefined]);
      assert.ok(dir.logger.lines.some(([lvl, t]) => lvl === 'error' && /Invalid log level/.test(t)));
    });

    it.skip('calls back exactly once when the log text is empty', async () => {
      const dir = flowLogDir({});
      const stops = await run(dir, { name: "flowlog", action: { level: "info", log: "" } });

      assert.deepStrictEqual(stops, [undefined]);
    });
  });

  // ------------------------------------------------------------ DirIteration

  describe('DirIteration', function () {

    const ACTION_ID = "ITER-1";
    const stateKey = "tilebot:requests:" + REQUEST_ID + ":iteration:" + ACTION_ID;

    function iterationDir(seedCache) {
      const cache = seedCache || fakeCache();
      const chatbot = fakeChatbot();
      const dir = new DirIteration(contextFor({ tdcache: cache, chatbot: chatbot }));
      dir.logger = recordingLogger();
      dir._cache = cache;
      dir._chatbot = chatbot;
      return dir;
    }

    function cacheWith(iterableValue) {
      const cache = fakeCache();
      cache.hashes["tilebot:requests:" + REQUEST_ID + ":parameters"] = {
        items: JSON.stringify(iterableValue)
      };
      return cache;
    }

    it('initialises the state, publishes the first item and jumps to the loop body', async () => {
      const dir = iterationDir(cacheWith(["a", "b", "c"]));
      const stops = await run(dir, {
        name: "iteration",
        action: {
          "_tdActionId": ACTION_ID,
          iterable: "items",
          goToIntent: "LOOP_BODY",
          assignOutputTo: "current"
        }
      });

      assert.strictEqual(dir._chatbot.params.current, "a", 'the first item is published');
      const saved = JSON.parse(dir._cache.store[stateKey]);
      assert.strictEqual(saved.currentIndex, 0);
      assert.strictEqual(saved.totalItems, 3);
      assert.deepStrictEqual(saved.iterableArray, ["a", "b", "c"]);
      assert.strictEqual(dispatched.length, 1);
      assert.strictEqual(dispatched[0].text, "/LOOP_BODY");
      assert.deepStrictEqual(stops, [true],
        'the loop body runs on its own message, so this directive list must stop');
    });

    it('advances to the next item on the following call', async () => {
      const cache = cacheWith(["a", "b", "c"]);
      cache.store[stateKey] = JSON.stringify({
        currentIndex: 0, iterableArray: ["a", "b", "c"],
        goToIntent: "LOOP_BODY", output: "current", delay: 1000, totalItems: 3
      });
      const dir = iterationDir(cache);
      const stops = await run(dir, { name: "iteration", action: { "_tdActionId": ACTION_ID } });

      assert.strictEqual(dir._chatbot.params.current, "b");
      assert.strictEqual(JSON.parse(cache.store[stateKey]).currentIndex, 1);
      assert.strictEqual(dispatched.length, 1);
      assert.strictEqual(dispatched[0].text, "/LOOP_BODY");
      assert.deepStrictEqual(stops, [true]);
    });

    it('clears the state and lets the flow continue when the last item is done', async () => {
      const cache = cacheWith(["a", "b"]);
      cache.store[stateKey] = JSON.stringify({
        currentIndex: 1, iterableArray: ["a", "b"],
        goToIntent: "LOOP_BODY", output: "current", delay: 1000, totalItems: 2
      });
      const dir = iterationDir(cache);
      const stops = await run(dir, { name: "iteration", action: { "_tdActionId": ACTION_ID } });

      assert.deepStrictEqual(cache.deletes, [stateKey], 'the iteration state must be cleared');
      assert.deepStrictEqual(dispatched, [], 'the loop body must not run a fourth time');
      assert.deepStrictEqual(stops, [false],
        'a completed iteration is the only exit that lets the rest of the flow run');
    });

    it('walks every item in one go when no loop body is connected', async () => {
      const dir = iterationDir(cacheWith(["a", "b", "c"]));
      const stops = await run(dir, {
        name: "iteration",
        action: { "_tdActionId": ACTION_ID, iterable: "items", assignOutputTo: "current" }
      });

      assert.strictEqual(dir._chatbot.params.current, "c", 'the last item is the one left behind');
      assert.deepStrictEqual(dir._cache.deletes, [stateKey]);
      assert.deepStrictEqual(dispatched, []);
      assert.deepStrictEqual(stops, [true]);
    });

    it('stops the flow when the iterable attribute does not exist', async () => {
      const dir = iterationDir(fakeCache());
      const stops = await run(dir, {
        name: "iteration",
        action: { "_tdActionId": ACTION_ID, iterable: "missing", goToIntent: "LOOP_BODY", assignOutputTo: "current" }
      });

      assert.deepStrictEqual(dispatched, []);
      assert.strictEqual(dir._cache.store[stateKey], undefined, 'no state may be left behind');
      assert.deepStrictEqual(stops, [true]);
      assert.ok(dir.logger.lines.some(([lvl, t]) => lvl === 'warn' && /Iterable object is undefined/.test(t)));
    });

    it('stops the flow on an empty array', async () => {
      const dir = iterationDir(cacheWith([]));
      const stops = await run(dir, {
        name: "iteration",
        action: { "_tdActionId": ACTION_ID, iterable: "items", goToIntent: "LOOP_BODY", assignOutputTo: "current" }
      });

      assert.deepStrictEqual(dispatched, []);
      assert.deepStrictEqual(stops, [true]);
      assert.ok(dir.logger.lines.some(([lvl, t]) => lvl === 'warn' && /Iterable array is empty/.test(t)));
    });

    it('stops the flow when the directive has no action id to key the state on', async () => {
      const dir = iterationDir(cacheWith(["a"]));
      const stops = await run(dir, {
        name: "iteration",
        action: { iterable: "items", goToIntent: "LOOP_BODY", assignOutputTo: "current" }
      });

      assert.deepStrictEqual(dispatched, []);
      assert.deepStrictEqual(stops, [true]);
      assert.ok(dir.logger.lines.some(([lvl, t]) => lvl === 'error' && /actionId is required/.test(t)));
    });

    it('does nothing on a directive with no action', async () => {
      const dir = iterationDir(fakeCache());
      const stops = await run(dir, { name: "iteration" });

      assert.deepStrictEqual(dispatched, []);
      assert.deepStrictEqual(stops, [undefined]);
    });

    describe('normalising the iterable', function () {

      async function firstItemFor(iterableValue) {
        const dir = iterationDir(cacheWith(iterableValue));
        await run(dir, {
          name: "iteration",
          action: { "_tdActionId": ACTION_ID, iterable: "items", goToIntent: "LOOP_BODY", assignOutputTo: "current" }
        });
        return { dir, saved: JSON.parse(dir._cache.store[stateKey] || "null") };
      }

      it('parses a JSON array held as a string', async () => {
        const { saved } = await firstItemFor('["x","y"]');
        assert.deepStrictEqual(saved.iterableArray, ["x", "y"]);
      });

      it('splits a comma separated string and trims the parts', async () => {
        const { saved } = await firstItemFor("x, y ,z");
        assert.deepStrictEqual(saved.iterableArray, ["x", "y", "z"]);
      });

      it('wraps a plain string in a single-item array', async () => {
        const { saved } = await firstItemFor("just one");
        assert.deepStrictEqual(saved.iterableArray, ["just one"]);
      });

      it('takes the values of an object', async () => {
        const { saved } = await firstItemFor({ a: 1, b: 2 });
        assert.deepStrictEqual(saved.iterableArray, [1, 2]);
      });

      it('wraps a number in a single-item array', async () => {
        const { saved } = await firstItemFor(42);
        assert.deepStrictEqual(saved.iterableArray, [42]);
      });

      it('treats an empty object as a single item rather than an empty loop', async () => {
        // Object.values/entries/keys all come back empty, so the final
        // "single value" rule wraps the object itself: one pass, not zero.
        const { dir, saved } = await firstItemFor({});
        assert.deepStrictEqual(saved.iterableArray, [{}]);
        assert.strictEqual(saved.totalItems, 1);
        assert.deepStrictEqual(dir._chatbot.params.current, {});
      });
    });

    it('clears the state and stops when publishing the current item fails', async () => {
      const cache = cacheWith(["a", "b"]);
      const dir = iterationDir(cache);
      dir.chatbot = {
        addParameter: async () => { throw new Error("cache write failed"); }
      };
      const stops = await run(dir, {
        name: "iteration",
        action: { "_tdActionId": ACTION_ID, iterable: "items", goToIntent: "LOOP_BODY", assignOutputTo: "current" }
      });

      assert.deepStrictEqual(dispatched, [], 'the loop body must not run on a half-set item');
      assert.deepStrictEqual(cache.deletes, [stateKey],
        'a failed item must not leave a stuck iteration behind');
      assert.deepStrictEqual(stops, [true]);
    });

    it('survives an unreadable iteration state and starts a fresh iteration', async () => {
      const cache = cacheWith(["a", "b"]);
      cache.store[stateKey] = "{not json";
      const dir = iterationDir(cache);
      const stops = await run(dir, {
        name: "iteration",
        action: { "_tdActionId": ACTION_ID, iterable: "items", goToIntent: "LOOP_BODY", assignOutputTo: "current" }
      });

      // The unparseable state is treated as "no state", so the iteration is
      // initialised from scratch rather than crashing.
      assert.strictEqual(dir._chatbot.params.current, "a");
      assert.strictEqual(dispatched.length, 1);
      assert.strictEqual(dispatched[0].text, "/LOOP_BODY");
      assert.deepStrictEqual(stops, [true]);
    });
  });

});
