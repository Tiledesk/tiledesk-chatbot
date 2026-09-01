'use strict';

// BaseDirective, the common half of every directive.
//
// `_executeCondition` is the true/false branching that ~20 directives delegate
// to: it decides WHICH intent the conversation jumps to next, emits the flow log
// that tells the bot author which branch was taken, and calls back so the
// directive chain advances. The subclass tests exercise it through their own
// directives and only ever with the branch they care about; the four
// combinations (branch taken x branch connected) and the completion callback
// are asserted here, directly.
//
// Every assertion is on an observable: the intent directive handed to
// `intentDir`, the flow-log line emitted, the attributes written to the cache,
// or the fact that the callback ran exactly once.

const assert = require('assert');

const { BaseDirective } = require('../directives/BaseDirective');
const { TiledeskChatbot } = require('../engine/TiledeskChatbot');

const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-basedirunits";
const PARAMS_KEY = "tilebot:requests:" + REQUEST_ID + ":parameters";

/** Records what was written, so an assertion can read it back as a native value. */
function fakeCache() {
  const hashes = { [PARAMS_KEY]: {} };
  return {
    hashes,
    attrs() {
      const out = {};
      for (const [k, v] of Object.entries(hashes[PARAMS_KEY])) {
        try { out[k] = JSON.parse(v); } catch (e) { out[k] = v; }
      }
      return out;
    },
    async hgetall(k) { return hashes[k] || {}; },
    async hget(k, f) { return (hashes[k] || {})[f]; },
    async hset(k, f, v) { (hashes[k] || (hashes[k] = {}))[f] = v; },
    async get() { return null; },
    async set() { },
    async del() { },
    async expire() { }
  };
}

function recordingLogger() {
  const lines = [];
  const mk = (level) => (...args) => lines.push([level, args.map(String).join(' ')]);
  return {
    lines,
    at(level) { return lines.filter((l) => l[0] === level).map((l) => l[1]); },
    error: mk('error'), warn: mk('warn'), info: mk('info'),
    debug: mk('debug'), native: mk('native')
  };
}

/** Stands in for DirIntent: records the intent directive it was asked to run. */
function recordingIntentDir() {
  const executed = [];
  return {
    executed,
    execute(directive, callback) {
      executed.push(directive);
      if (callback) callback();
    }
  };
}

function build(overrides) {
  const dir = new BaseDirective(Object.assign({
    projectId: PROJECT_ID,
    requestId: REQUEST_ID,
    token: "XXX",
    tdcache: fakeCache(),
    supportRequest: { id_project: PROJECT_ID, request_id: REQUEST_ID }
  }, overrides));
  dir.logger = recordingLogger();
  dir.intentDir = recordingIntentDir();
  return dir;
}

// ==================================================================== tests

describe('BaseDirective', function () {

  it('refuses to be constructed without a context', function () {
    assert.throws(() => new BaseDirective(), /context object is mandatory/);
    assert.throws(() => new BaseDirective(null), /context object is mandatory/);
  });

  it('hoists the context fields the subclasses read', function () {
    const cache = fakeCache();
    const dir = new BaseDirective({
      projectId: PROJECT_ID, requestId: REQUEST_ID, token: "XXX",
      API_ENDPOINT: "http://api.example", tdcache: cache
    });
    assert.strictEqual(dir.projectId, PROJECT_ID);
    assert.strictEqual(dir.requestId, REQUEST_ID);
    assert.strictEqual(dir.token, "XXX");
    assert.strictEqual(dir.API_ENDPOINT, "http://api.example");
    assert.strictEqual(dir.tdcache, cache);
  });

  it('names itself after the subclass for the winston prefix', function () {
    class DirThing extends BaseDirective { }
    const dir = new DirThing({ requestId: REQUEST_ID });
    assert.strictEqual(dir._tag, "(DirThing)");
  });

  describe('_executeCondition', function () {

    it('runs the true intent, with its attributes, and calls back once', async () => {
      const dir = build({});
      let calls = 0;
      await dir._executeCondition(true, "YES_BLOCK", { city: "Rome" }, "NO_BLOCK", null, () => { calls += 1; });

      assert.strictEqual(dir.intentDir.executed.length, 1);
      assert.strictEqual(dir.intentDir.executed[0].action.intentName, 'YES_BLOCK{"city":"Rome"}',
        'the attributes travel appended to the intent name, as the intent command carries them');
      assert.strictEqual(calls, 1, 'the completion callback runs exactly once');
    });

    it('runs the false intent, with its own attributes, and calls back once', async () => {
      const dir = build({});
      let calls = 0;
      await dir._executeCondition(false, "YES_BLOCK", null, "NO_BLOCK", { reason: "nope" }, () => { calls += 1; });

      assert.strictEqual(dir.intentDir.executed.length, 1);
      assert.strictEqual(dir.intentDir.executed[0].action.intentName, 'NO_BLOCK{"reason":"nope"}');
      assert.strictEqual(calls, 1);
    });

    it('anything other than strictly true takes the false branch', async () => {
      const dir = build({});
      await dir._executeCondition("true", "YES_BLOCK", null, "NO_BLOCK", null, () => { });
      assert.strictEqual(dir.intentDir.executed[0].action.intentName, "NO_BLOCK",
        'a truthy non-boolean must not be read as a match');
    });

    it('jumps nowhere but still calls back when the true branch has no intent', async () => {
      const dir = build({});
      let calls = 0;
      await dir._executeCondition(true, null, null, "NO_BLOCK", null, () => { calls += 1; });

      assert.deepStrictEqual(dir.intentDir.executed, [],
        'an unconnected true branch must not fall through to the false one');
      assert.strictEqual(calls, 1, 'and the directive chain must still advance');
    });

    it('jumps nowhere but still calls back when the false branch has no intent', async () => {
      const dir = build({});
      let calls = 0;
      await dir._executeCondition(false, "YES_BLOCK", null, null, null, () => { calls += 1; });

      assert.deepStrictEqual(dir.intentDir.executed, []);
      assert.strictEqual(calls, 1);
    });

    it('is safe with no completion callback at all', async () => {
      const connected = build({});
      await connected._executeCondition(true, "YES_BLOCK", null, null, null);
      assert.strictEqual(connected.intentDir.executed[0].action.intentName, "YES_BLOCK");

      const unconnected = build({});
      await unconnected._executeCondition(false, null, null, null, null);
      assert.deepStrictEqual(unconnected.intentDir.executed, []);
    });

    it('emits the flow log of the branch it took, and nothing for an undeclared one', async () => {
      const dir = build({});
      dir._conditionLabels = {
        trueExecute: "[X] true branch",
        falseMissing: "[X] no false branch"
        // trueMissing and falseExecute deliberately absent
      };

      await dir._executeCondition(true, "YES_BLOCK", null, null, null, () => { });
      assert.deepStrictEqual(dir.logger.at('native'), ["[X] true branch"]);

      await dir._executeCondition(false, null, null, null, null, () => { });
      assert.deepStrictEqual(dir.logger.at('native'), ["[X] true branch", "[X] no false branch"]);

      // The two labels that were never declared emit nothing at all.
      await dir._executeCondition(true, null, null, null, null, () => { });
      await dir._executeCondition(false, "YES", null, "NO", null, () => { });
      assert.deepStrictEqual(dir.logger.at('native'), ["[X] true branch", "[X] no false branch"]);
    });

    it('emits nothing when no labels were declared', async () => {
      const dir = build({});
      await dir._executeCondition(true, "YES_BLOCK", null, null, null, () => { });
      assert.deepStrictEqual(dir.logger.at('native'), []);
    });
  });

  describe('_assignAttributes', function () {

    it('writes each named flow attribute, in order', async () => {
      const dir = build({});
      await dir._assignAttributes(
        { assignResultTo: "result", assignStatusTo: "status" },
        [['assignResultTo', { ok: true }], ['assignStatusTo', 200]]);

      assert.deepStrictEqual(dir.tdcache.attrs(), { result: { ok: true }, status: 200 });
    });

    it('skips an assignment the action did not name a target for', async () => {
      const dir = build({});
      await dir._assignAttributes(
        { assignStatusTo: "status" },
        [['assignResultTo', "dropped"], ['assignStatusTo', 500]]);

      assert.deepStrictEqual(dir.tdcache.attrs(), { status: 500 });
    });

    it('honours onlyIfTruthy', async () => {
      const dir = build({});
      await dir._assignAttributes(
        { assignErrorTo: "error", assignStatusTo: "status" },
        [['assignErrorTo', null, { onlyIfTruthy: true }], ['assignStatusTo', 200, { onlyIfTruthy: true }]]);

      assert.deepStrictEqual(dir.tdcache.attrs(), { status: 200 },
        'a null error must not overwrite the attribute with null');
    });

    it('writes nothing at all when there is no cache', async () => {
      const dir = build({ tdcache: undefined });
      await dir._assignAttributes({ assignResultTo: "result" }, [['assignResultTo', "x"]]);
      // Nothing to assert against but the absence of a throw: with no cache
      // there is nowhere for the value to go, and the directive must not fail.
      assert.strictEqual(dir.tdcache, undefined);
    });

    it('the values it writes read back through the engine as native types', async () => {
      const dir = build({});
      await dir._assignAttributes(
        { assignResultTo: "result" },
        [['assignResultTo', { items: [1, 2, 3] }]]);

      const back = await TiledeskChatbot.allParametersStatic(dir.tdcache, REQUEST_ID);
      assert.deepStrictEqual(back.result, { items: [1, 2, 3] });
    });
  });
});
