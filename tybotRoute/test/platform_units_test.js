'use strict';

// The pieces of the platform that sit under everything else: the redis cache
// wrapper, the flow-attribute facade the sandboxed Code action is handed, the
// static-bot data source used when the runtime is embedded, and the corners of
// the expression compiler.
//
// The redis tests talk to the real server the suite already uses
// (REDIS_HOST/REDIS_PORT, see scripts/run-tests.js); every key they touch is
// namespaced under this file's own request id and deleted afterwards.

var assert = require('assert');

const { TdCache } = require('../cache/TdCache');
const { TiledeskRequestVariables } = require('../variables/TiledeskRequestVariables');
const { MockBotsDataSource } = require('../engine/mock/MockBotsDataSource');
const { MockIntentsMachine } = require('../engine/mock/MockIntentsMachine');
const { TiledeskMath } = require('../expressions/TiledeskMath');
const { TiledeskJSONEval } = require('../expressions/TiledeskJSONEval');
const { TiledeskExpression } = require('../expressions/TiledeskExpression');

const REQUEST_ID = "support-group-P1-platformunits";
const KEY_PREFIX = "tilebot:requests:" + REQUEST_ID;

// A bot in the shape MockBotsDataSource expects.
function staticBots() {
  return {
    bots: {
      "BOT-1": {
        name: "Test Bot",
        language: "en",
        webhook_enabled: true,
        webhook_url: "https://hooks.test/x",
        questions_intent: { "what are your hours": "hours" },
        intents: {
          hours: { intent_display_name: "hours", answer: "9 to 5" },
          welcome: { intent_display_name: "welcome", answer: "hi" }
        },
        intents_by_intent_id: { "i-1": { intent_display_name: "hours", answer: "9 to 5" } },
        intents_nlp: { "when are you open": { intent_display_name: "hours" } }
      }
    }
  };
}

// ==================================================================== tests

describe('the platform layer, the error and edge paths', function () {

  // ------------------------------------------------------------- cache/TdCache

  describe('TdCache, against the redis the suite already uses', function () {

    let cache;
    const keys = [];
    const k = (name) => { const key = KEY_PREFIX + ":" + name; keys.push(key); return key; };

    before(async function () {
      cache = new TdCache({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || '6379',
        password: process.env.REDIS_PASSWORD
      });
      await cache.connect();
    });

    after(async function () {
      for (const key of keys) { try { await cache.del(key); } catch (e) { /* nothing to clean */ } }
      if (cache.client) await cache.client.quit();
      if (cache.subscriberClient) await cache.subscriberClient.quit();
    });

    it('the host, port and password are held as given', function () {
      const built = new TdCache({ host: "h", port: "1", password: "p" });
      assert.strictEqual(built.redis_host, "h");
      assert.strictEqual(built.redis_port, "1");
      assert.strictEqual(built.redis_password, "p");
      assert.strictEqual(built.client, null, 'no client exists before connect()');
      assert.strictEqual(built.subscriberClient, null);
    });

    it('connect() to a port nothing is listening on rejects instead of hanging', async function () {
      const broken = new TdCache({ host: '127.0.0.1', port: '10099' });
      await assert.rejects(() => broken.connect());
    });

    it('a value round-trips, and del removes it', async function () {
      const key = k("str");
      await cache.set(key, "hello");
      assert.strictEqual(await cache.get(key), "hello");
      await cache.del(key);
      assert.strictEqual(await cache.get(key), null, 'a deleted key reads back as null');
    });

    it('a value set with no options still gets the default one day ttl', async function () {
      const key = k("ttl-default");
      await cache.set(key, "v");
      const ttl = await cache.client.ttl(key);
      assert.ok(ttl > 86000 && ttl <= 86400, 'ttl was ' + ttl);
    });

    it('an explicit EX wins over the default', async function () {
      const key = k("ttl-explicit");
      await cache.set(key, "v", { EX: 120 });
      const ttl = await cache.client.ttl(key);
      assert.ok(ttl > 0 && ttl <= 120, 'ttl was ' + ttl);
    });

    it('incr counts up from a key that does not exist yet', async function () {
      const key = k("counter");
      await cache.incr(key);
      await cache.incr(key);
      assert.strictEqual(await cache.get(key), "2");
    });

    it('a hash field round-trips, hgetall reads the whole hash and hdel removes one field', async function () {
      const key = k("hash");
      await cache.hset(key, "a", "1");
      await cache.hset(key, "b", "2");

      assert.strictEqual(await cache.hget(key, "a"), "1");
      // node-redis returns a null-prototype object from HGETALL.
      assert.deepStrictEqual(Object.assign({}, await cache.hgetall(key)), { a: "1", b: "2" });
      await cache.hdel(key, "a");
      assert.deepStrictEqual(Object.assign({}, await cache.hgetall(key)), { b: "2" });
    });

    it('a hash field with an empty value is not written at all', async function () {
      const key = k("hash-empty");
      await cache.hset(key, "a", "");
      await cache.hset(key, "b", null);
      assert.deepStrictEqual(Object.assign({}, await cache.hgetall(key)), {},
        'the falsy-value guard keeps the hash from being created at all');
    });

    it('hset applies the ttl to the whole hash when one is asked for', async function () {
      const key = k("hash-ttl");
      await cache.hset(key, "a", "1", { EX: 120 });
      const ttl = await cache.client.ttl(key);
      assert.ok(ttl > 0 && ttl <= 120, 'ttl was ' + ttl);
    });

    it('setJSON stores the serialised value and getJSON parses it back', async function () {
      const key = k("json");
      await cache.setJSON(key, { a: [1, 2], b: "x" });
      assert.strictEqual(await cache.get(key), '{"a":[1,2],"b":"x"}');
      assert.deepStrictEqual(await cache.getJSON(key), { a: [1, 2], b: "x" });
    });

    it('setJSON of nothing writes nothing', async function () {
      const key = k("json-empty");
      await cache.setJSON(key, null);
      assert.strictEqual(await cache.get(key), null);
    });

    it('expire puts a ttl on a key that had none', async function () {
      const key = k("expire");
      await cache.set(key, "v", { EX: 3600 });
      await cache.expire(key, 60);
      const ttl = await cache.client.ttl(key);
      assert.ok(ttl > 0 && ttl <= 60, 'ttl was ' + ttl);
    });

    it('a published message reaches the subscriber of that topic', async function () {
      const topic = KEY_PREFIX + ":topic";
      const received = [];
      await cache.subscribe(topic, (message, t) => { received.push({ message, t }); });
      await cache.publish(topic, "hello subscribers");
      await new Promise((r) => setTimeout(r, 200));

      assert.deepStrictEqual(received, [{ message: "hello subscribers", t: topic }]);
      await cache.unsubscribe(topic);

      await cache.publish(topic, "after unsubscribe");
      await new Promise((r) => setTimeout(r, 200));
      assert.strictEqual(received.length, 1, 'nothing may arrive after unsubscribe');
    });

    it('subscribe without a function is refused rather than silently dropping messages', async function () {
      await assert.rejects(() => cache.subscribe("t", null), /Callback is mandatory for subscribe/);
      await assert.rejects(() => cache.subscribe("t", "not a function"), /Callback is mandatory for subscribe/);
    });

    it('subscribe before connect is refused', async function () {
      const notConnected = new TdCache({ host: 'h', port: '1' });
      await assert.rejects(() => notConnected.subscribe("t", () => { }), /Redis subscriber not connected/);
    });

    it('unsubscribe before connect warns instead of throwing', async function () {
      const notConnected = new TdCache({ host: 'h', port: '1' });
      assert.strictEqual(await notConnected.unsubscribe("t"), undefined);
    });

    it('unsubscribe from a topic that was never subscribed is swallowed', async function () {
      assert.strictEqual(await cache.unsubscribe(KEY_PREFIX + ":never-subscribed"), undefined);
    });

  });

  // ------------------------------------------- variables/TiledeskRequestVariables

  describe('TiledeskRequestVariables', function () {

    function hashCache() {
      const hashes = {};
      return {
        hashes, lastOpts: undefined,
        async hset(key, f, v, opts) { (hashes[key] || (hashes[key] = {}))[f] = v; this.lastOpts = opts; },
        async hget(key, f) { return (hashes[key] || {})[f]; },
        async hgetall(key) { return hashes[key] || {}; },
        async hdel(key, f) { delete (hashes[key] || {})[f]; }
      };
    }

    const KEY = "tilebot:requests:" + REQUEST_ID + ":parameters";

    it('set writes into the request parameter hash with the configured ttl', async function () {
      const cache = hashCache();
      const vars = new TiledeskRequestVariables(REQUEST_ID, cache, {});
      await vars.set("plan", "premium");

      assert.strictEqual(cache.hashes[KEY].plan, "premium");
      assert.deepStrictEqual(cache.lastOpts, { EX: 15 * 24 * 60 * 60 });
    });

    it('set and get and all call back when given a callback, and return when not', async function () {
      const cache = hashCache();
      const vars = new TiledeskRequestVariables(REQUEST_ID, cache, {});

      let setCalled = 0;
      await vars.set("plan", "premium", () => { setCalled += 1; });
      assert.strictEqual(setCalled, 1);

      let got;
      await vars.get("plan", (v) => { got = v; });
      assert.strictEqual(got, "premium");
      assert.strictEqual(await vars.get("plan"), "premium");

      let all;
      await vars.all((v) => { all = v; });
      assert.deepStrictEqual(all, { plan: "premium" });
      assert.deepStrictEqual(await vars.all(), { plan: "premium" });
    });

    it('delete removes just that attribute', async function () {
      const cache = hashCache();
      const vars = new TiledeskRequestVariables(REQUEST_ID, cache, {});
      await vars.set("a", "1");
      await vars.set("b", "2");
      await vars.delete("a");
      assert.deepStrictEqual(await vars.all(), { b: "2" });
    });

    it('setAttribute and deleteAttribute queue the ops instead of writing them', function () {
      const vars = new TiledeskRequestVariables(REQUEST_ID, hashCache(), { existing: 1 });
      vars.setAttribute("plan", "premium");
      vars.deleteAttribute("old");

      assert.deepStrictEqual(vars.ops, { set: { plan: "premium" }, del: { old: true } },
        'the sandboxed Code action collects its writes here and the caller applies them');
      assert.deepStrictEqual(vars.allAttributes(), { existing: 1 },
        'allAttributes is the snapshot handed in, not the queued ops');
    });

  });

  // ------------------------------------------------------- engine/mock sources

  describe('MockBotsDataSource', function () {

    it('a data source with no bots is refused outright', function () {
      assert.throws(() => new MockBotsDataSource(null), /bots is mandatory/);
      assert.throws(() => new MockIntentsMachine(undefined), /bots is mandatory/);
    });

    it('getBotById projects just the four fields the engine reads', async function () {
      const bot = await new MockBotsDataSource(staticBots()).getBotById("BOT-1");
      assert.deepStrictEqual(bot, {
        webhook_enabled: true, webhook_url: "https://hooks.test/x", language: "en", name: "Test Bot"
      });
    });

    it('a bot id that is not in the static data rejects', async function () {
      await assert.rejects(() => new MockBotsDataSource(staticBots()).getBotById("NOPE"));
    });

    it('getBotByIdCache ignores the cache and reads the static data', async function () {
      const bot = await new MockBotsDataSource(staticBots()).getBotByIdCache("BOT-1", null);
      assert.strictEqual(bot.name, "Test Bot");
    });

    it('getByExactMatch maps a question to its intent, and misses are null', async function () {
      const ds = new MockBotsDataSource(staticBots());
      assert.deepStrictEqual(await ds.getByExactMatch("BOT-1", "what are your hours"),
        [{ intent_display_name: "hours", answer: "9 to 5" }]);
      assert.strictEqual(await ds.getByExactMatch("BOT-1", "something else"), null);
    });

    it('a key starting with # resolves through intents_by_intent_id, trimmed', async function () {
      const ds = new MockBotsDataSource(staticBots());
      assert.strictEqual((await ds.getByIntentDisplayName("BOT-1", " #i-1 ")).answer, "9 to 5");
      assert.strictEqual((await ds.getByIntentDisplayName("BOT-1", " welcome ")).answer, "hi");
    });

    it('getByIntentDisplayNameCache hands back a CLONE, so the caller cannot corrupt the static bot', async function () {
      const data = staticBots();
      const ds = new MockBotsDataSource(data);
      const faq = await ds.getByIntentDisplayNameCache("BOT-1", "welcome", null);
      faq.answer = "mutated";

      assert.strictEqual(data.bots["BOT-1"].intents.welcome.answer, "hi",
        'the static bot definition is shared by every request and must not be written through');
      const again = await ds.getByIntentDisplayNameCache("BOT-1", "welcome", {});
      assert.strictEqual(again.answer, "hi");
    });

    it('an intent that does not exist clones to undefined rather than null', async function () {
      const ds = new MockBotsDataSource(staticBots());
      assert.strictEqual(await ds.getByIntentDisplayNameCache("BOT-1", "nope", null), undefined);
    });

    it('decode maps the nlp text to its intent, and misses to an empty list', async function () {
      const ds = new MockBotsDataSource(staticBots());
      assert.deepStrictEqual(await ds.decode("BOT-1", "when are you open"), [{ intent_display_name: "hours" }]);
      assert.deepStrictEqual(await ds.decode("BOT-1", "gibberish"), []);
    });

    it('train reports success while there is data to train on', async function () {
      assert.strictEqual(await new MockBotsDataSource(staticBots()).train("BOT-1", {}), true);
      const emptied = new MockBotsDataSource(staticBots());
      emptied.data = null;
      await assert.rejects(() => emptied.train("BOT-1", {}), /Can't train empty data/);
    });

    // DEFECT - engine/mock/MockBotsDataSource.js:67
    //
    //   catch(err) {
    //     winston.error("(MockBotsDataSource) Error getByIntentDisplayName: ", err);
    //   }
    //
    // The file requires nothing at all - no winston - so the handler that
    // exists to survive a lookup on a bot that is not in the static data
    // throws "ReferenceError: winston is not defined" instead of returning
    // undefined. This is not test-only code: routes/messageRoutes.js:284
    // instantiates MockBotsDataSource whenever the runtime is embedded with
    // `staticBots` (the startApp `bots:` option), so an intent name pointing
    // at an unknown bot crashes the lookup rather than missing it.
    //
    // Same missing-require family as utils/ChatbotIntentUtil.js:50.
    //
    // Correct behaviour, asserted here: an unresolvable lookup returns
    // undefined, exactly as a lookup on a known bot with an unknown intent
    // already does.
    it('a lookup against a bot that is not in the static data misses instead of throwing', async function () {
      const ds = new MockBotsDataSource(staticBots());
      assert.strictEqual(await ds.getByIntentDisplayName("NO-SUCH-BOT", "welcome"), undefined);
    });

  });

  describe('MockIntentsMachine', function () {

    it('decode maps the nlp text to its intent, and misses to an empty list', async function () {
      const machine = new MockIntentsMachine(staticBots());
      assert.deepStrictEqual(await machine.decode("BOT-1", "when are you open"), [{ intent_display_name: "hours" }]);
      assert.deepStrictEqual(await machine.decode("BOT-1", "gibberish"), []);
    });

    it('train reports success while there is data to train on', async function () {
      const machine = new MockIntentsMachine(staticBots());
      assert.strictEqual(await machine.train("BOT-1", {}), true);
      machine.data = null;
      await assert.rejects(() => machine.train("BOT-1", {}), /Can't train empty data/);
    });

  });

  // ------------------------------------------------------------- expressions

  describe('TiledeskMath', function () {

    it('the seven functions the expression sandbox exposes each delegate to Math', function () {
      assert.strictEqual(TiledeskMath.cos(0), 1);
      assert.strictEqual(TiledeskMath.sin(0), 0);
      assert.strictEqual(TiledeskMath.tan(0), 0);
      assert.strictEqual(TiledeskMath.abs(-4.2), 4.2);
      assert.strictEqual(TiledeskMath.ceil(4.1), 5);
      assert.strictEqual(TiledeskMath.floor(4.9), 4);
      assert.strictEqual(TiledeskMath.round(4.5), 5);
    });

  });

  describe('TiledeskJSONEval, the registered handlebars helpers', function () {

    it('first and last pick the ends of an array', function () {
      assert.strictEqual(TiledeskJSONEval.eval({ rows: [{ n: 1 }, { n: 2 }, { n: 3 }] }, "{{#with (first rows)}}{{n}}{{/with}}"), "1");
      assert.strictEqual(TiledeskJSONEval.eval({ rows: [{ n: 1 }, { n: 2 }, { n: 3 }] }, "{{#with (last rows)}}{{n}}{{/with}}"), "3");
    });

    it('ifeq branches on a loose equality', function () {
      const template = "{{#ifeq status 200}}ok{{else}}ko{{/ifeq}}";
      assert.strictEqual(TiledeskJSONEval.eval({ status: 200 }, template), "ok");
      assert.strictEqual(TiledeskJSONEval.eval({ status: "200" }, template), "ok", 'ifeq compares with ==');
      assert.strictEqual(TiledeskJSONEval.eval({ status: 500 }, template), "ko");
    });

  });

  describe('TiledeskExpression, the refusals', function () {

    it('an operation with no operands compiles to nothing', function () {
      assert.strictEqual(TiledeskExpression.JSONOperationToExpression([], null), null);
      assert.strictEqual(TiledeskExpression.JSONOperationToExpression([], undefined), null);
    });

    it('a condition with no operand2 is refused rather than compiled half way', function () {
      assert.strictEqual(TiledeskExpression.JSONConditionToExpression(
        { operator: "equalAsStrings", operand1: "plan" }), null);
      assert.strictEqual(TiledeskExpression.JSONConditionToExpression(
        { operator: "equalAsStrings", operand1: "plan", operand2: { type: "something else" } }), null);
    });

    it('a var operand2 whose name is not a valid attribute name is refused', function () {
      assert.strictEqual(TiledeskExpression.JSONConditionToExpression(
        { operator: "equalAsStrings", operand1: "plan", operand2: { type: "var", name: "1nvalid" } }), null);
    });

    it('a valid var operand2 compiles to the data path', function () {
      assert.strictEqual(TiledeskExpression.JSONConditionToExpression(
        { operator: "equalAsStrings", operand1: "plan", operand2: { type: "var", name: "other" } }),
        'String($data.plan) === String($data.other)');
    });

    it('stringValueOperand resolves a $-prefixed operand against the variables', function () {
      assert.strictEqual(TiledeskExpression.stringValueOperand("$plan", { plan: "premium" }),
        TiledeskExpression.quotedString("premium"));
      assert.strictEqual(TiledeskExpression.stringValueOperand("$missing", { plan: "premium" }),
        TiledeskExpression.quotedString("$missing"),
        'an unresolved variable is left as the literal it was written as');
      assert.strictEqual(TiledeskExpression.stringValueOperand("plain", { plan: "premium" }),
        TiledeskExpression.quotedString("plain"));
      assert.strictEqual(TiledeskExpression.stringValueOperand("plain", null),
        TiledeskExpression.quotedString("plain"));
      assert.strictEqual(TiledeskExpression.stringValueOperand("", { a: 1 }),
        TiledeskExpression.quotedString(""));
    });

  });

});
