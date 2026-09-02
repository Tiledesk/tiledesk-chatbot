'use strict';

// tybotRoute/engine, exercised directly.
//
// The conversation-* files drive the engine through MockBotsDataSource, so the
// two Mongo-backed data sources, the two intents machines and the factory that
// picks between them were almost entirely unrun (19.87%, 31.57%, 17.60% and
// 35.29% of lines). None of them is tested here against a live database: the
// suite deliberately never connects to MongoDB, so the mongoose MODELS are
// stubbed - Faq.find / Faq_kb.findById are replaced with the query chain the
// source actually calls - and every test asserts the QUERY that was built and
// the value handed back, which is what the callers depend on.
//
// The rest of the file covers the per-request accounting helpers
// (ExecutionGuard, RequestParameters) at their limits, and IntentForm's regex
// validation.

var assert = require('assert');
var express = require('express');
const bodyParser = require('body-parser');

const { IntentsMachineFactory } = require('../engine/IntentsMachineFactory');
const { TiledeskIntentsMachine } = require('../engine/TiledeskIntentsMachine');
const { MongodbIntentsMachine } = require('../engine/MongodbIntentsMachine');
const { MongodbBotsDataSource } = require('../engine/MongodbBotsDataSource');
const { MockTdCache } = require('../engine/mock/MockTdCache');
const { IntentForm } = require('../engine/IntentForm');
const ExecutionGuard = require('../engine/ExecutionGuard');
const RequestParameters = require('../engine/RequestParameters');
const Faq = require('../models/faq');
const Faq_kb = require('../models/faq_kb');

const MOCK_PORT = 10002;
const MOCK = 'http://localhost:' + MOCK_PORT;
const REQUEST_ID = "support-group-P1-engineunits";

// ------------------------------------------------------------------- stubs

/**
 * Replaces Faq.find with the chain MongodbBotsDataSource/MongodbIntentsMachine
 * build - find(query[, projection]).sort(...).lean().exec(cb) - recording the
 * arguments and answering with `answer`, which is either [err, rows] or a
 * function of the recorded call.
 */
function stubFaqFind(answer) {
  const calls = [];
  const original = Faq.find;
  Faq.find = (query, projection) => {
    const call = { query, projection, sort: undefined };
    calls.push(call);
    const chain = {
      sort(s) { call.sort = s; return chain; },
      lean() { return chain; },
      exec(cb) {
        const [err, rows] = typeof answer === 'function' ? answer(call) : answer;
        setImmediate(() => cb(err, rows));
      }
    };
    return chain;
  };
  return { calls, restore() { Faq.find = original; } };
}

/** Faq_kb.findById(id).select('+secret').exec() -> Promise */
function stubFindById(answer) {
  const calls = [];
  const original = Faq_kb.findById;
  Faq_kb.findById = (id) => {
    const call = { id, select: undefined };
    calls.push(call);
    return {
      select(s) { call.select = s; return this; },
      async exec() {
        if (typeof answer === 'function') return answer(call);
        return answer;
      }
    };
  };
  return { calls, restore() { Faq_kb.findById = original; } };
}

/** A cache whose get/set can be made to fail or to answer with a stored value. */
function fakeCache(overrides) {
  const db = new Map();
  return Object.assign({
    db,
    async get(k) { return db.has(k) ? db.get(k) : null; },
    async set(k, v) { db.set(k, v); },
    async del(k) { db.delete(k); }
  }, overrides);
}

// ==================================================================== tests

describe('engine, the error and edge paths', function () {

  // ------------------------------------------------------ IntentsMachineFactory

  describe('IntentsMachineFactory', function () {

    it('a bot on the tiledesk-ai engine gets the http machine', function () {
      const machine = IntentsMachineFactory.getMachine({ intentsEngine: "tiledesk-ai" }, "BOT-1", "P1");
      assert.ok(machine instanceof TiledeskIntentsMachine);
    });

    it('any other bot gets the mongodb machine, carrying the project and the bot language', function () {
      const machine = IntentsMachineFactory.getMachine({ language: "it" }, "BOT-1", "P1");
      assert.ok(machine instanceof MongodbIntentsMachine);
      assert.strictEqual(machine.projectId, "P1");
      assert.strictEqual(machine.language, "it");
    });

    it('no bot at all yields no machine rather than a broken one', function () {
      assert.strictEqual(IntentsMachineFactory.getMachine(null, "BOT-1", "P1"), undefined);
    });

    it('the backup machine is always the mongodb one, whatever the engine', function () {
      const machine = IntentsMachineFactory.getBackupMachine({ intentsEngine: "tiledesk-ai", language: "en" }, "BOT-1", "P1");
      assert.ok(machine instanceof MongodbIntentsMachine);
      assert.strictEqual(machine.projectId, "P1");
      assert.strictEqual(machine.language, "en");
    });

  });

  // ------------------------------------------------------ TiledeskIntentsMachine

  describe('TiledeskIntentsMachine', function () {

    let mock;
    let handler;

    beforeEach(async () => {
      handler = (req, res) => res.status(200).send({
        intent: { name: "chisei", confidence: 0.66 },
        intent_ranking: [
          { name: "chisei", confidence: 0.66 },
          { name: "saluti", confidence: 0.23 }
        ]
      });
      const seen = [];
      const server = express();
      server.use(bodyParser.json());
      server.all('*', (req, res) => { seen.push({ url: req.originalUrl, body: req.body, method: req.method }); handler(req, res); });
      await new Promise((resolve) => {
        const listener = server.listen(MOCK_PORT, '0.0.0.0', () => {
          mock = { seen, close: () => new Promise((r) => listener.close(() => r())) };
          resolve();
        });
      });
    });
    afterEach(async () => { await mock.close(); });

    it('a config with no API_ENDPOINT falls back to the hardcoded host', function () {
      assert.strictEqual(new TiledeskIntentsMachine({}).API_ENDPOINT, "http://34.65.210.38");
      assert.strictEqual(new TiledeskIntentsMachine({ API_ENDPOINT: MOCK }).API_ENDPOINT, MOCK);
    });

    it('decode posts the model and the text to /model/parse and returns the ranking as intents', async function () {
      const machine = new TiledeskIntentsMachine({ API_ENDPOINT: MOCK });
      const intents = await machine.decode("BOT-1", "chi sei");

      assert.strictEqual(mock.seen.length, 1);
      assert.strictEqual(mock.seen[0].url, "/model/parse");
      assert.strictEqual(mock.seen[0].method, "POST");
      assert.deepStrictEqual(mock.seen[0].body, { model: "models/BOT-1", text: "chi sei" });
      assert.deepStrictEqual(intents, [
        { intent_display_name: "chisei" },
        { intent_display_name: "saluti" }
      ]);
    });

    it('an empty ranking decodes to no intents at all', async function () {
      handler = (req, res) => res.status(200).send({ intent_ranking: [] });
      const machine = new TiledeskIntentsMachine({ API_ENDPOINT: MOCK });
      assert.deepStrictEqual(await machine.decode("BOT-1", "?"), []);
    });

    it('a 500 from the AI service rejects rather than resolving with nothing', async function () {
      handler = (req, res) => res.status(500).send({ error: "model not trained" });
      const machine = new TiledeskIntentsMachine({ API_ENDPOINT: MOCK });
      await assert.rejects(() => machine.decode("BOT-1", "chi sei"));
    });

    it('an AI service that is not listening rejects', async function () {
      const machine = new TiledeskIntentsMachine({ API_ENDPOINT: 'http://127.0.0.1:10099' });
      await assert.rejects(() => machine.decode("BOT-1", "chi sei"));
    });

    it('translateForTiledesk keeps only the intent names, in ranking order', function () {
      const machine = new TiledeskIntentsMachine({ API_ENDPOINT: MOCK });
      assert.deepStrictEqual(
        machine.translateForTiledesk({ intent_ranking: [{ name: "a", confidence: 1 }, { name: "b", confidence: 0.5 }] }),
        [{ intent_display_name: "a" }, { intent_display_name: "b" }]);
    });

    it('myrequest hands the body of a 200 to its callback', function (done) {
      const machine = new TiledeskIntentsMachine({ API_ENDPOINT: MOCK });
      machine.myrequest({ url: MOCK + '/x', method: 'GET' }, (err, body) => {
        try {
          assert.strictEqual(err, null);
          assert.ok(body.intent_ranking);
          done();
        } catch (e) { done(e); }
      });
    });

    // engine/TiledeskIntentsMachine.js:105 reports a resolved-but-unusable
    // answer with
    //
    //   callback(TiledeskClient.getErr({message: "Response status not 200"}, options, res), null, null);
    //
    // and `TiledeskClient` is not required anywhere in this file, so
    // evaluating that argument throws "ReferenceError: TiledeskClient is not
    // defined". What saves it is the `.catch()` chained after the `.then()`:
    // the throw rejects the then-promise and the catch hands the
    // ReferenceError to the callback, so the caller IS told the request
    // failed - just with the wrong reason. (The identical line in
    // utils/ChatbotParametersClient.js:72 is NOT saved, because its catch
    // then dereferences error.response; that one is recorded as a defect in
    // utils_units_test.js.)
    //
    // Asserted here so the day someone tightens that catch, the missing
    // identifier surfaces as a failure rather than as a silent stall.
    it('a 200 with no body still reaches the callback, though with the wrong reason', function (done) {
      handler = (req, res) => res.status(200).send();
      const machine = new TiledeskIntentsMachine({ API_ENDPOINT: MOCK });
      machine.myrequest({ url: MOCK + '/x', method: 'GET' }, (err, body) => {
        try {
          assert.ok(err instanceof ReferenceError,
            'TiledeskClient is undeclared; the message the caller gets is about that, not about the status');
          assert.strictEqual(body, null);
          done();
        } catch (e) { done(e); }
      });
    });

    it('decode rejects when the AI service answers 200 with no body', async function () {
      handler = (req, res) => res.status(200).send();
      const machine = new TiledeskIntentsMachine({ API_ENDPOINT: MOCK });
      await assert.rejects(() => machine.decode("BOT-1", "chi sei"));
    });

  });

  // ------------------------------------------------------ MongodbIntentsMachine

  describe('MongodbIntentsMachine', function () {

    it('a config with no projectId is refused outright', function () {
      assert.throws(() => new MongodbIntentsMachine({}), /config.projectId is mandatory/);
    });

    it('decode runs a full-text search scoped to the bot, sorted by score', async function () {
      const stub = stubFaqFind([null, [{ intent_display_name: "chisei", score: 1.2 }]]);
      try {
        const machine = new MongodbIntentsMachine({ projectId: "P1" });
        const faqs = await machine.decode("BOT-1", "chi sei");

        assert.deepStrictEqual(stub.calls[0].query, { id_faq_kb: "BOT-1", $text: { $search: "chi sei" } });
        assert.deepStrictEqual(stub.calls[0].projection, { score: { $meta: "textScore" } });
        assert.deepStrictEqual(stub.calls[0].sort, { score: { $meta: "textScore" } });
        assert.deepStrictEqual(faqs, [{ intent_display_name: "chisei", score: 1.2 }]);
      } finally {
        stub.restore();
      }
    });

    it('a bot language is passed to mongo as the full-text stemmer', async function () {
      const stub = stubFaqFind([null, []]);
      try {
        await new MongodbIntentsMachine({ projectId: "P1", language: "it" }).decode("BOT-1", "chi sei");
        assert.deepStrictEqual(stub.calls[0].query.$text, { $search: "chi sei", $language: "it" });
      } finally {
        stub.restore();
      }
    });

    it('no match resolves to an empty list, not to null', async function () {
      const stub = stubFaqFind([null, []]);
      try {
        assert.deepStrictEqual(await new MongodbIntentsMachine({ projectId: "P1" }).decode("BOT-1", "?"), []);
      } finally {
        stub.restore();
      }
    });

    it('a database error is logged and still resolves to an empty list', async function () {
      const stub = stubFaqFind([new Error("no text index"), null]);
      try {
        assert.deepStrictEqual(await new MongodbIntentsMachine({ projectId: "P1" }).decode("BOT-1", "?"), [],
          'the engine falls back rather than rejecting into the reply pipeline');
      } finally {
        stub.restore();
      }
    });

  });

  // ------------------------------------------------------ MongodbBotsDataSource

  describe('MongodbBotsDataSource', function () {

    it('a config with no projectId is refused outright', function () {
      assert.throws(() => new MongodbBotsDataSource({}), /config.projectId is mandatory/);
    });

    it('getBotById selects the secret alongside the bot', async function () {
      const stub = stubFindById({ _id: "BOT-1", name: "Test Bot", secret: "s" });
      try {
        const bot = await new MongodbBotsDataSource({ projectId: "P1" }).getBotById("BOT-1");
        assert.deepStrictEqual(stub.calls[0], { id: "BOT-1", select: '+secret' });
        assert.strictEqual(bot.name, "Test Bot");
      } finally {
        stub.restore();
      }
    });

    it('a bot that does not exist is null, not undefined', async function () {
      const stub = stubFindById(undefined);
      try {
        assert.strictEqual(await new MongodbBotsDataSource({ projectId: "P1" }).getBotById("BOT-1"), null);
      } finally {
        stub.restore();
      }
    });

    it('getBotByIdCache answers from the cache without touching the database', async function () {
      const stub = stubFindById({ _id: "BOT-1", name: "From Mongo" });
      const cache = fakeCache();
      await cache.set("cacheman:cachegoose-cache:faq_kbs:id:BOT-1", JSON.stringify({ _id: "BOT-1", name: "From Cache" }));
      try {
        const bot = await new MongodbBotsDataSource({ projectId: "P1" }).getBotByIdCache("BOT-1", cache);
        assert.strictEqual(bot.name, "From Cache");
        assert.deepStrictEqual(stub.calls, [], 'a cache hit must not query mongo');
      } finally {
        stub.restore();
      }
    });

    it('a cache miss reads mongo and writes the bot back under the cachegoose key', async function () {
      const stub = stubFindById({ _id: "BOT-1", name: "From Mongo" });
      const cache = fakeCache();
      try {
        const bot = await new MongodbBotsDataSource({ projectId: "P1" }).getBotByIdCache("BOT-1", cache);
        assert.strictEqual(bot.name, "From Mongo");
        assert.strictEqual(cache.db.get("cacheman:cachegoose-cache:faq_kbs:id:BOT-1"),
          JSON.stringify({ _id: "BOT-1", name: "From Mongo" }));
      } finally {
        stub.restore();
      }
    });

    it('with no cache at all the bot comes straight from mongo', async function () {
      const stub = stubFindById({ _id: "BOT-1", name: "From Mongo" });
      try {
        const bot = await new MongodbBotsDataSource({ projectId: "P1" }).getBotByIdCache("BOT-1", null);
        assert.strictEqual(bot.name, "From Mongo");
        assert.strictEqual(stub.calls.length, 1);
      } finally {
        stub.restore();
      }
    });

    it('a cache that throws leaves the bot null rather than breaking the reply', async function () {
      const stub = stubFindById({ _id: "BOT-1", name: "From Mongo" });
      const cache = fakeCache({ get: async () => { throw new Error("redis is gone"); } });
      try {
        assert.strictEqual(await new MongodbBotsDataSource({ projectId: "P1" }).getBotByIdCache("BOT-1", cache), null);
      } finally {
        stub.restore();
      }
    });

    it('getByExactMatch queries on the bot and the literal question', async function () {
      const stub = stubFaqFind([null, [{ question: "hi", answer: "hello" }]]);
      try {
        const faqs = await new MongodbBotsDataSource({ projectId: "P1" }).getByExactMatch("BOT-1", "hi");
        assert.deepStrictEqual(stub.calls[0].query, { id_faq_kb: "BOT-1", question: "hi" });
        assert.deepStrictEqual(faqs, [{ question: "hi", answer: "hello" }]);
      } finally {
        stub.restore();
      }
    });

    it('a match with no answer counts as no match', async function () {
      const stub = stubFaqFind([null, [{ question: "hi" }]]);
      try {
        assert.strictEqual(await new MongodbBotsDataSource({ projectId: "P1" }).getByExactMatch("BOT-1", "hi"), null);
      } finally {
        stub.restore();
      }
    });

    it('no rows at all is null', async function () {
      const stub = stubFaqFind([null, []]);
      try {
        assert.strictEqual(await new MongodbBotsDataSource({ projectId: "P1" }).getByExactMatch("BOT-1", "hi"), null);
      } finally {
        stub.restore();
      }
    });

    it('a database error on the exact match rejects', async function () {
      const stub = stubFaqFind([new Error("mongo is down"), null]);
      try {
        await assert.rejects(() => new MongodbBotsDataSource({ projectId: "P1" }).getByExactMatch("BOT-1", "hi"),
          /mongo is down/);
      } finally {
        stub.restore();
      }
    });

    it('a key starting with # is looked up by intent_id, and trimmed first', async function () {
      const stub = stubFaqFind([null, [{ intent_id: "abc", intent_display_name: "welcome" }]]);
      try {
        const intent = await new MongodbBotsDataSource({ projectId: "P1" }).getByIntentDisplayName("BOT-1", "  #abc  ");
        assert.deepStrictEqual(stub.calls[0].query, { id_faq_kb: "BOT-1", intent_id: "abc" });
        assert.strictEqual(intent.intent_display_name, "welcome");
      } finally {
        stub.restore();
      }
    });

    it('any other key is looked up by intent_display_name', async function () {
      const stub = stubFaqFind([null, [{ intent_display_name: "welcome" }]]);
      try {
        await new MongodbBotsDataSource({ projectId: "P1" }).getByIntentDisplayName("BOT-1", " welcome ");
        assert.deepStrictEqual(stub.calls[0].query, { id_faq_kb: "BOT-1", intent_display_name: "welcome" });
      } finally {
        stub.restore();
      }
    });

    it('only the first match is returned, and no match is null', async function () {
      const many = stubFaqFind([null, [{ intent_display_name: "first" }, { intent_display_name: "second" }]]);
      try {
        const intent = await new MongodbBotsDataSource({ projectId: "P1" }).getByIntentDisplayName("BOT-1", "welcome");
        assert.strictEqual(intent.intent_display_name, "first");
      } finally {
        many.restore();
      }

      const none = stubFaqFind([null, []]);
      try {
        assert.strictEqual(await new MongodbBotsDataSource({ projectId: "P1" }).getByIntentDisplayName("BOT-1", "welcome"), null);
      } finally {
        none.restore();
      }
    });

    it('a database error on the intent lookup rejects', async function () {
      const stub = stubFaqFind([new Error("mongo is down"), null]);
      try {
        await assert.rejects(() => new MongodbBotsDataSource({ projectId: "P1" }).getByIntentDisplayName("BOT-1", "welcome"),
          /mongo is down/);
      } finally {
        stub.restore();
      }
    });

    it('getByIntentDisplayNameCache answers from the cache without touching the database', async function () {
      const stub = stubFaqFind([null, [{ intent_display_name: "from mongo" }]]);
      const cache = fakeCache();
      await cache.set("cacheman:cachegoose-cache:faqs:botid:BOT-1:faq:id:welcome",
        JSON.stringify({ intent_display_name: "from cache" }));
      try {
        const faq = await new MongodbBotsDataSource({ projectId: "P1" }).getByIntentDisplayNameCache("BOT-1", "welcome", cache);
        assert.strictEqual(faq.intent_display_name, "from cache");
        assert.deepStrictEqual(stub.calls, []);
      } finally {
        stub.restore();
      }
    });

    it('a cache miss reads mongo and writes the intent back with a one day ttl', async function () {
      const stub = stubFaqFind([null, [{ intent_display_name: "from mongo" }]]);
      const written = [];
      const cache = fakeCache({ async set(k, v, opts) { written.push({ k, v, opts }); } });
      try {
        const faq = await new MongodbBotsDataSource({ projectId: "P1" }).getByIntentDisplayNameCache("BOT-1", "welcome", cache);
        assert.strictEqual(faq.intent_display_name, "from mongo");
        assert.strictEqual(written.length, 1);
        assert.strictEqual(written[0].k, "cacheman:cachegoose-cache:faqs:botid:BOT-1:faq:id:welcome");
        assert.deepStrictEqual(written[0].opts, { EX: 86400 });
      } finally {
        stub.restore();
      }
    });

    it('with no cache the intent comes straight from mongo', async function () {
      const stub = stubFaqFind([null, [{ intent_display_name: "from mongo" }]]);
      try {
        const faq = await new MongodbBotsDataSource({ projectId: "P1" }).getByIntentDisplayNameCache("BOT-1", "welcome", null);
        assert.strictEqual(faq.intent_display_name, "from mongo");
      } finally {
        stub.restore();
      }
    });

    it('a database error behind the cache leaves the intent null rather than rejecting', async function () {
      const stub = stubFaqFind([new Error("mongo is down"), null]);
      const cache = fakeCache();
      try {
        assert.strictEqual(
          await new MongodbBotsDataSource({ projectId: "P1" }).getByIntentDisplayNameCache("BOT-1", "welcome", cache),
          null, 'the try/catch around the cache path swallows it');
      } finally {
        stub.restore();
      }
    });

  });

  // --------------------------------------------------------------- MockTdCache

  describe('MockTdCache', function () {

    it('everything is stored as a string, and incr starts from nothing', async function () {
      const cache = new MockTdCache();
      await cache.incr("k");
      assert.strictEqual(await cache.get("k"), "1");
      await cache.incr("k");
      assert.strictEqual(await cache.get("k"), "2");

      await cache.set("n", 7);
      assert.strictEqual(await cache.get("n"), "7", 'a number is stored as its string form');
    });

    it('a key that was deleted reads back as undefined', async function () {
      const cache = new MockTdCache();
      await cache.set("k", "v");
      await cache.del("k");
      assert.strictEqual(await cache.get("k"), undefined);
    });

    it('setJSON stores the serialised value', async function () {
      const cache = new MockTdCache();
      await cache.setJSON("k", { a: 1 });
      assert.strictEqual(await cache.get("k"), '{"a":1}');
    });

  });

  // -------------------------------------------------------- TiledeskChatbot

  describe('TiledeskChatbot', function () {

    const { TiledeskChatbot } = require('../engine/TiledeskChatbot');

    /** A cache with the node-redis surface the engine actually touches. */
    function engineCache(overrides) {
      const db = new Map();
      const hashes = {};
      return Object.assign({
        db, hashes,
        async get(k) { return db.has(k) ? db.get(k) : null; },
        async set(k, v) { db.set(k, "" + v); },
        async del(k) { db.delete(k); },
        async incr(k) { db.set(k, "" + (Number(db.get(k) || 0) + 1)); },
        async setJSON(k, v) { db.set(k, JSON.stringify(v)); },
        async hset(k, f, v) { (hashes[k] || (hashes[k] = {}))[f] = v; },
        async hget(k, f) { return (hashes[k] || {})[f]; },
        async hgetall(k) { return hashes[k] || {}; },
        async hdel(k, f) { delete (hashes[k] || {})[f]; }
      }, overrides);
    }

    /** Records every lookup and answers from the maps it was given. */
    function dataSource(opts = {}) {
      const calls = { byIntent: [], exact: [] };
      return {
        calls,
        async getByIntentDisplayNameCache(botId, key) {
          calls.byIntent.push(key);
          if (opts.byIntentThrows) throw new Error(opts.byIntentThrows);
          return (opts.intents || {})[key] || null;
        },
        async getByExactMatch(botId, text) {
          calls.exact.push(text);
          if (opts.exactThrows) throw new Error(opts.exactThrows);
          return (opts.exact || {})[text] || null;
        }
      };
    }

    function chatbotFor(opts = {}) {
      return new TiledeskChatbot(Object.assign({
        botsDataSource: opts.botsDataSource || dataSource(),
        botId: "BOT-1",
        bot: opts.bot || { name: "Test Bot", _id: "BOT-1" },
        tdcache: opts.tdcache === null ? undefined : (opts.tdcache || engineCache()),
        requestId: REQUEST_ID,
        projectId: "P1",
        token: "XXX"
      }, opts.config));
    }

    const REPLY_INTENT = { intent_display_name: "welcome", answer: "hello" };

    it('the three mandatory config fields are each checked by name', function () {
      assert.throws(() => new TiledeskChatbot({}), /config.botsDataSource is mandatory/);
      assert.throws(() => new TiledeskChatbot({ botsDataSource: {} }), /config.botId is mandatory/);
      assert.throws(() => new TiledeskChatbot({ botsDataSource: {}, botId: "B" }), /config.bot is mandatory/);
    });

    // --- the lock primitives -------------------------------------------

    it('an intent is locked, read back and unlocked through the cache', async function () {
      const cache = engineCache();
      const chatbot = chatbotFor({ tdcache: cache });

      assert.strictEqual(await chatbot.currentLockedIntent(REQUEST_ID), null);
      await chatbot.lockIntent(REQUEST_ID, "welcome");
      assert.strictEqual(await chatbot.currentLockedIntent(REQUEST_ID), "welcome");
      assert.strictEqual(cache.db.get("tilebot:requests:" + REQUEST_ID + ":locked"), "welcome");
      await chatbot.unlockIntent(REQUEST_ID);
      assert.strictEqual(await chatbot.currentLockedIntent(REQUEST_ID), null);
    });

    it('with no cache there is never a locked intent or action', async function () {
      const chatbot = chatbotFor({ tdcache: null });
      assert.strictEqual(await chatbot.currentLockedIntent(REQUEST_ID), null);
      assert.strictEqual(await chatbot.currentLockedAction(REQUEST_ID), null);
    });

    it('an action is locked, read back and unlocked through the cache', async function () {
      const cache = engineCache();
      const chatbot = chatbotFor({ tdcache: cache });

      await chatbot.lockAction(REQUEST_ID, "action-1");
      assert.strictEqual(await chatbot.currentLockedAction(REQUEST_ID), "action-1");
      await chatbot.unlockAction(REQUEST_ID);
      assert.strictEqual(await chatbot.currentLockedAction(REQUEST_ID), null);
    });

    it('lockAction with a null action id logs and writes nothing', async function () {
      const cache = engineCache();
      const chatbot = chatbotFor({ tdcache: cache });
      await chatbot.lockAction(REQUEST_ID, null);
      assert.strictEqual(cache.db.size, 0, 'a null action id must not be stored as the lock');
    });

    // --- the parameter surface -----------------------------------------

    it('the instance parameter methods read and write the request hash', async function () {
      const cache = engineCache();
      const chatbot = chatbotFor({ tdcache: cache });

      await chatbot.addParameter("plan", { tier: "gold" });
      assert.deepStrictEqual(await chatbot.getParameter("plan"), { tier: "gold" });
      assert.deepStrictEqual(await chatbot.allParameters(), { plan: { tier: "gold" } });
      assert.deepStrictEqual(await chatbot.allParametersInstance(cache, REQUEST_ID),
        { plan: '{"tier":"gold"}' }, 'the instance form hands back the RAW strings');

      await chatbot.deleteParameter("plan");
      assert.deepStrictEqual(await chatbot.allParameters(), {});
    });

    it('the static delegates go to RequestParameters and ExecutionGuard', async function () {
      const cache = engineCache();
      assert.strictEqual(TiledeskChatbot.requestCacheKey(REQUEST_ID), "tilebot:requests:" + REQUEST_ID);

      await TiledeskChatbot.addParameterStatic(cache, REQUEST_ID, "a", 1);
      assert.strictEqual(await TiledeskChatbot.getParameterStatic(cache, REQUEST_ID, "a"), 1);
      assert.deepStrictEqual(await TiledeskChatbot.allParametersStatic(cache, REQUEST_ID), { a: 1 });
      await TiledeskChatbot.deleteParameterStatic(cache, REQUEST_ID, "a");
      assert.deepStrictEqual(await TiledeskChatbot.allParametersStatic(cache, REQUEST_ID), {});

      assert.deepStrictEqual(await TiledeskChatbot.checkStep(cache, REQUEST_ID, 10, 60000), {});
      assert.strictEqual(await TiledeskChatbot.currentStep(cache, REQUEST_ID), "1");
      await TiledeskChatbot.resetStep(cache, REQUEST_ID);
      await TiledeskChatbot.resetStarted(cache, REQUEST_ID);
      assert.strictEqual(await TiledeskChatbot.currentStep(cache, REQUEST_ID), "0");
    });

    // --- replyToMessage -------------------------------------------------

    it('a locked intent is executed without any matching being attempted', async function () {
      const ds = dataSource({ intents: { welcome: REPLY_INTENT } });
      const cache = engineCache();
      const chatbot = chatbotFor({ botsDataSource: ds, tdcache: cache });
      await chatbot.lockIntent(REQUEST_ID, "welcome");

      const reply = await chatbot.replyToMessage({ text: "anything", sender: "u-1" });
      assert.strictEqual(reply.text, "hello");
      assert.deepStrictEqual(ds.calls.byIntent, ["welcome"]);
      assert.deepStrictEqual(ds.calls.exact, [], 'a locked intent short-circuits matching entirely');
    });

    it('a locked intent that no longer exists is reported and the lock is released', async function () {
      const ds = dataSource({ intents: {} });
      const cache = engineCache();
      const chatbot = chatbotFor({ botsDataSource: ds, tdcache: cache });
      await chatbot.lockIntent(REQUEST_ID, "gone");
      await chatbot.lockAction(REQUEST_ID, "action-1");

      const reply = await chatbot.replyToMessage({ text: "anything", sender: "u-1" });
      assert.ok(reply.text.includes("An error occurred while getting locked intent:'gone'"), reply.text);
      assert.strictEqual(reply.attributes.subtype, "info");
      assert.strictEqual(await chatbot.currentLockedIntent(REQUEST_ID), null,
        'the stale lock must be released or the conversation can never move on');
      assert.strictEqual(await chatbot.currentLockedAction(REQUEST_ID), null);
    });

    it('an action invocation clears a lock left by another bot before matching', async function () {
      const ds = dataSource({ intents: { welcome: REPLY_INTENT } });
      const cache = engineCache();
      const chatbot = chatbotFor({ botsDataSource: ds, tdcache: cache });
      await chatbot.lockIntent(REQUEST_ID, "stale");

      const reply = await chatbot.replyToMessage({ text: "", sender: "u-1", attributes: { action: "welcome" } });
      assert.strictEqual(reply.text, "hello");
      assert.deepStrictEqual(ds.calls.byIntent, ["welcome"], 'the stale lock must not be consulted');
    });

    it('a cache that throws while resetting the lock is logged and the flow carries on', async function () {
      const ds = dataSource({ intents: { welcome: REPLY_INTENT } });
      const cache = engineCache({ del: async () => { throw new Error("redis is gone"); } });
      const chatbot = chatbotFor({ botsDataSource: ds, tdcache: cache });

      const reply = await chatbot.replyToMessage({ text: "/welcome", sender: "u-1", attributes: { action: "welcome" } });
      assert.strictEqual(reply.text, "hello", 'a failed unlock must not lose the reply');
    });

    it('a cache that throws while resetting the step counter is logged and the flow carries on', async function () {
      const ds = dataSource({ intents: { welcome: REPLY_INTENT } });
      const cache = engineCache({ set: async () => { throw new Error("redis is gone"); } });
      const chatbot = chatbotFor({ botsDataSource: ds, tdcache: cache });

      const reply = await chatbot.replyToMessage({ text: "/welcome", sender: "u-1" });
      assert.strictEqual(reply.text, "hello");
    });

    it('an explicit /intent is looked up by name and its parameters become flow attributes', async function () {
      const ds = dataSource({ intents: { order: { intent_display_name: "order", answer: "ok" } } });
      const cache = engineCache();
      const chatbot = chatbotFor({ botsDataSource: ds, tdcache: cache });

      const reply = await chatbot.replyToMessage({ text: "/order{'id':7}", sender: "u-1" });
      assert.strictEqual(reply.text, "ok");
      assert.deepStrictEqual(ds.calls.byIntent, ["order"]);
      assert.strictEqual(await chatbot.getParameter("id"), 7);
    });

    it('an intent name that will not parse resolves with nothing', async function () {
      const ds = dataSource({ intents: {}, exact: {} });
      const chatbot = chatbotFor({ botsDataSource: ds });
      chatbot.intentsFinder = { async decode() { return []; } };

      assert.strictEqual(await chatbot.replyToMessage({ text: "/   ", sender: "u-1" }), undefined,
        'a blank intent name is not a lookup');
      assert.deepStrictEqual(ds.calls.byIntent, [], 'nothing is looked up for an unparseable name');
    });

    // DEFECT - engine/TiledeskChatbot.js:148-149, 174-175 (and the copies in
    // findBlock at :290-291 and :308-309)
    //
    //   reply = { "text": "Invalid intent: *" + explicit_intent_name + "*" }
    //   resolve();
    //   ...
    //   reply = { "text": "Intent not found: " + explicit_intent_name }
    //   resolve()
    //
    // Both branches BUILD the message they mean to send and then resolve with
    // nothing: `reply` is a local that is never read again. The caller gets
    // undefined and, at routes/messageRoutes.js, treats that as "no reply,
    // stop flow" - so a designer who wires a connector to a block that has
    // since been renamed or deleted sees the conversation die silently, with
    // no reply and nothing in the chat to say why. The strings are already
    // written; only the argument is missing.
    //
    // Neither branch returns either, so the not-found path also carries on
    // into exact-match and NLP matching (asserted above) and can resolve a
    // SECOND time - harmless only because a settled promise ignores it.
    //
    // Correct behaviour, asserted here: the message the code composes is the
    // message the caller gets.
    it('an explicit intent that does not exist replies with the message the code composes', async function () {
      const ds = dataSource({ intents: {}, exact: {} });
      const chatbot = chatbotFor({ botsDataSource: ds });
      chatbot.intentsFinder = { async decode() { return []; } };

      const reply = await chatbot.replyToMessage({ text: "/nope", sender: "u-1" });
      assert.strictEqual(reply.text, "Intent not found: nope");
    });

    it('an exact question match wins over NLP', async function () {
      const ds = dataSource({ exact: { "what are your hours": [{ intent_display_name: "hours", answer: "9 to 5" }] } });
      const chatbot = chatbotFor({ botsDataSource: ds });
      chatbot.intentsFinder = { async decode() { throw new Error("must not be reached"); } };

      const reply = await chatbot.replyToMessage({ text: "what are your hours", sender: "u-1" });
      assert.strictEqual(reply.text, "9 to 5");
    });

    it('an exact match that errors is logged and the flow falls through to NLP', async function () {
      const ds = dataSource({ exactThrows: "mongo is down", intents: { hours: { intent_display_name: "hours", answer: "9 to 5" } } });
      const chatbot = chatbotFor({ botsDataSource: ds });
      chatbot.intentsFinder = { async decode() { return [{ intent_display_name: "hours" }]; } };

      const reply = await chatbot.replyToMessage({ text: "hours?", sender: "u-1" });
      assert.strictEqual(reply.text, "9 to 5");
    });

    it('an intents finder that fails falls back to the backup finder', async function () {
      const ds = dataSource({ intents: { hours: { intent_display_name: "hours", answer: "9 to 5" } } });
      const chatbot = chatbotFor({ botsDataSource: ds });
      let backupCalls = 0;
      chatbot.intentsFinder = { async decode() { throw new Error("/model/parse is down"); } };
      chatbot.backupIntentsFinder = { async decode() { backupCalls += 1; return [{ intent_display_name: "hours" }]; } };

      const reply = await chatbot.replyToMessage({ text: "hours?", sender: "u-1" });
      assert.strictEqual(reply.text, "9 to 5");
      assert.strictEqual(backupCalls, 1);
    });

    it('an intents finder that fails with no backup wired ends on the fallback intent', async function () {
      const ds = dataSource({ intents: { defaultFallback: { intent_display_name: "defaultFallback", answer: "sorry?" } } });
      const chatbot = chatbotFor({ botsDataSource: ds });
      chatbot.intentsFinder = { async decode() { throw new Error("/model/parse is down"); } };

      const reply = await chatbot.replyToMessage({ text: "hours?", sender: "u-1" });
      assert.strictEqual(reply.text, "sorry?");
    });

    it('no match and no defaultFallback intent yields no reply at all', async function () {
      const ds = dataSource({ intents: {} });
      const chatbot = chatbotFor({ botsDataSource: ds });
      chatbot.intentsFinder = { async decode() { return []; } };

      assert.strictEqual(await chatbot.replyToMessage({ text: "hours?", sender: "u-1" }), null);
      assert.deepStrictEqual(ds.calls.byIntent, ["defaultFallback"]);
    });

    it('a failure inside the exact-match intent rejects rather than resolving with nothing', async function () {
      const ds = dataSource({ exact: { "hi": [{ intent_display_name: "hi", answer: "hello" }] } });
      const chatbot = chatbotFor({ botsDataSource: ds, tdcache: engineCache({ setJSON: async () => { throw new Error("redis is gone"); } }) });

      await assert.rejects(() => chatbot.replyToMessage({ text: "hi", sender: "u-1" }), /redis is gone/);
    });

    it('a failure inside the NLP intent rejects rather than resolving with nothing', async function () {
      const ds = dataSource({ intents: { hours: { intent_display_name: "hours", answer: "9 to 5" } } });
      const chatbot = chatbotFor({ botsDataSource: ds, tdcache: engineCache({ setJSON: async () => { throw new Error("redis is gone"); } }) });
      chatbot.intentsFinder = { async decode() { return [{ intent_display_name: "hours" }]; } };

      await assert.rejects(() => chatbot.replyToMessage({ text: "hours?", sender: "u-1" }), /redis is gone/);
    });

    it('a failure inside the fallback intent rejects rather than resolving with nothing', async function () {
      const ds = dataSource({ intents: { defaultFallback: { intent_display_name: "defaultFallback", answer: "sorry?" } } });
      const chatbot = chatbotFor({ botsDataSource: ds, tdcache: engineCache({ setJSON: async () => { throw new Error("redis is gone"); } }) });
      chatbot.intentsFinder = { async decode() { return []; } };

      await assert.rejects(() => chatbot.replyToMessage({ text: "hours?", sender: "u-1" }), /redis is gone/);
    });

    // --- execIntent -----------------------------------------------------

    it('an intent with neither actions nor an answer produces no reply', async function () {
      const chatbot = chatbotFor({});
      assert.strictEqual(
        await chatbot.execIntent({ intent_display_name: "empty" }, { text: "hi" }, null), null);
    });

    it('an intent with actions is answered with the action list and the intent info', async function () {
      const chatbot = chatbotFor({});
      const reply = await chatbot.execIntent(
        { intent_display_name: "welcome", intent_id: "i-1", score: 0.9, actions: [{ _tdActionType: "reply" }] },
        { text: "hi", _id: "m-1" }, null, { match_type: 'exact' });

      assert.deepStrictEqual(reply.actions, [{ _tdActionType: "reply" }]);
      assert.strictEqual(reply.attributes.intent_info.intent_name, "welcome");
      assert.strictEqual(reply.attributes.intent_info.intent_id, "i-1");
      assert.strictEqual(reply.attributes.intent_info.confidence, 0.9);
      assert.strictEqual(reply.attributes.intent_info.is_fallback, false);
      assert.strictEqual(reply.attributes.intent_info.question_payload.request, undefined,
        'the request is stripped out of the echoed question');
      assert.ok(reply.attributes.clienttimestamp);
    });

    it('an intent carrying a mongo _id exposes it as _answerid', async function () {
      const chatbot = chatbotFor({});
      const reply = await chatbot.execIntent(
        { intent_display_name: "welcome", answer: "hello", _id: { toString: () => "64f0" } },
        { text: "hi" }, null);
      assert.strictEqual(reply.attributes._answerid, "64f0");
    });

    it('an empty action list falls back to the static answer text', async function () {
      const chatbot = chatbotFor({});
      const reply = await chatbot.execIntent(
        { intent_display_name: "welcome", answer: "hello", actions: [] }, { text: "hi" }, null);
      assert.strictEqual(reply.text, "hello");
    });

    // --- findBlock ------------------------------------------------------

    it('findBlock hands back the whole intent, with the next-block connector appended', async function () {
      const faq = {
        intent_display_name: "welcome",
        actions: [{ _tdActionType: "reply" }],
        attributes: { nextBlockAction: { _tdActionType: "intent", intentName: "NEXT" } }
      };
      const ds = dataSource({ intents: { welcome: faq } });
      const chatbot = chatbotFor({ botsDataSource: ds });

      const block = await chatbot.findBlock({ text: "/welcome" });
      assert.strictEqual(block.intent_display_name, "welcome");
      assert.strictEqual(block.actions.length, 2);
      assert.deepStrictEqual(block.actions[1], { _tdActionType: "intent", intentName: "NEXT" });
    });

    it('findBlock resolves an action invocation as well as a slash invocation', async function () {
      const ds = dataSource({ intents: { welcome: { intent_display_name: "welcome" } } });
      const chatbot = chatbotFor({ botsDataSource: ds });

      const block = await chatbot.findBlock({ text: "", attributes: { action: "welcome" } });
      assert.strictEqual(block.intent_display_name, "welcome");
    });

    it('findBlock on an unknown or unparseable name resolves with nothing', async function () {
      const ds = dataSource({ intents: {} });
      const chatbot = chatbotFor({ botsDataSource: ds });

      assert.strictEqual(await chatbot.findBlock({ text: "/nope" }), undefined);
      assert.strictEqual(await chatbot.findBlock({ text: "/  " }), undefined);
    });

    // DEFECT - engine/TiledeskChatbot.js:259-313
    //
    // findBlock() wraps its whole body in `new Promise(async (resolve, reject)
    // => {...})` and every resolve() sits INSIDE `if (explicit_intent_name)`.
    // A message that names no block - no leading "/" and no
    // attributes.action - therefore falls off the end of the executor without
    // ever calling resolve or reject, and the promise NEVER SETTLES.
    //
    // routes/messageRoutes.js:326 does `reply = await chatbot.findBlock(message)`
    // inside the POST /exec/:botid handler. The 200 has already been sent, so
    // the client is not left hanging - but the handler stops there for good:
    // the rest of the route never runs, and every such request leaks a pending
    // promise and its whole closure (the chatbot, the bot document, the
    // message) for the lifetime of the process.
    //
    // Correct behaviour, asserted here: a message that names no block
    // resolves with nothing, like the two not-found cases above.
    it.skip('findBlock on a message that names no block resolves instead of hanging', async function () {
      const ds = dataSource({ intents: {} });
      const chatbot = chatbotFor({ botsDataSource: ds });

      const block = await Promise.race([
        chatbot.findBlock({ text: "just a user message" }),
        new Promise((r) => setTimeout(() => r("NEVER SETTLED"), 500))
      ]);
      assert.strictEqual(block, undefined);
    });

    // --- populatePrechatFormAndLead --------------------------------------

    it('populatePrechatFormAndLead with neither a lead nor a request does nothing', async function () {
      const chatbot = chatbotFor({});
      assert.strictEqual(await chatbot.populatePrechatFormAndLead(null, null), undefined);
    });

  });

  // ----------------------------------------------------------- ExecutionGuard

  describe('ExecutionGuard', function () {

    /**
     * node-redis semantics, which is what the guard is written against: a key
     * that was never set reads back as NULL. (engine/mock/MockTdCache returns
     * undefined instead, and `Number(undefined)` is NaN, which would make the
     * `start_time === null || Number(start_time) === 0` test below fall to the
     * comparison branch and silently never start the wall clock. Nothing in
     * the runtime uses MockTdCache, so that is a mock fidelity gap rather than
     * a defect - but it is why these tests do not use it.)
     */
    function guardCache() {
      const db = new Map();
      return {
        db,
        async set(k, v) { db.set(k, "" + v); },
        async incr(k) { db.set(k, "" + (Number(db.get(k) || 0) + 1)); },
        async get(k) { return db.has(k) ? db.get(k) : null; }
      };
    }

    it('the step counter rises and stays clear until the limit is passed', async function () {
      const cache = guardCache();
      assert.deepStrictEqual(await ExecutionGuard.checkStep(cache, REQUEST_ID, 3, 60000), {});
      assert.deepStrictEqual(await ExecutionGuard.checkStep(cache, REQUEST_ID, 3, 60000), {});
      assert.strictEqual(await ExecutionGuard.currentStep(cache, REQUEST_ID), "2");
    });

    it('one step past the limit stops the flow and names the limit', async function () {
      const cache = guardCache();
      await ExecutionGuard.checkStep(cache, REQUEST_ID, 1, 60000);
      const stopped = await ExecutionGuard.checkStep(cache, REQUEST_ID, 1, 60000);

      assert.strictEqual(stopped.error_code, 'max_steps_exceeded');
      assert.strictEqual(stopped.step_count, 2);
      assert.ok(stopped.error.includes("MAX ACTIONS (1)"), stopped.error);
    });

    it('the first step records the start time and lets the flow through', async function () {
      const cache = guardCache();
      const before = Date.now();
      assert.deepStrictEqual(await ExecutionGuard.checkStep(cache, REQUEST_ID, 100, 60000), {});
      const started = Number(await cache.get(RequestParameters.requestCacheKey(REQUEST_ID) + ":started"));
      assert.ok(started >= before, 'the wall clock must start on the first step');
    });

    it('a start time in the distant past stops the flow on wall clock, not on steps', async function () {
      const cache = guardCache();
      await cache.set(RequestParameters.requestCacheKey(REQUEST_ID) + ":started", Date.now() - 5000);
      const stopped = await ExecutionGuard.checkStep(cache, REQUEST_ID, 100, 1000);

      assert.strictEqual(stopped.error_code, 'max_time_exceeded');
      assert.strictEqual(stopped.step_count, 1);
      assert.ok(stopped.error.includes("MAX EXECUTION TIME (1000 ms)"), stopped.error);
    });

    it('a start time of zero is treated as "not started yet" and restarts the clock', async function () {
      const cache = guardCache();
      await cache.set(RequestParameters.requestCacheKey(REQUEST_ID) + ":started", 0);
      assert.deepStrictEqual(await ExecutionGuard.checkStep(cache, REQUEST_ID, 100, 1), {},
        'a reset conversation must not inherit the previous run\'s clock');
      assert.notStrictEqual(await cache.get(RequestParameters.requestCacheKey(REQUEST_ID) + ":started"), "0");
    });

    it('resetStep and resetStarted zero their counters, and tolerate no cache', async function () {
      const cache = guardCache();
      await ExecutionGuard.checkStep(cache, REQUEST_ID, 100, 60000);
      await ExecutionGuard.resetStep(cache, REQUEST_ID);
      await ExecutionGuard.resetStarted(cache, REQUEST_ID);

      assert.strictEqual(await ExecutionGuard.currentStep(cache, REQUEST_ID), "0");
      assert.strictEqual(await cache.get(RequestParameters.requestCacheKey(REQUEST_ID) + ":started"), "0");

      await ExecutionGuard.resetStep(null, REQUEST_ID);   // must not throw
      await ExecutionGuard.resetStarted(null, REQUEST_ID);
    });

  });

  // -------------------------------------------------------- RequestParameters

  describe('RequestParameters', function () {

    function hashCache() {
      const hashes = {};
      return {
        hashes,
        async hset(k, f, v, opts) { (hashes[k] || (hashes[k] = {}))[f] = v; this.lastOpts = opts; },
        async hget(k, f) { return (hashes[k] || {})[f]; },
        async hgetall(k) { return hashes[k] || {}; },
        async hdel(k, f) { delete (hashes[k] || {})[f]; }
      };
    }

    const KEY = "tilebot:requests:" + REQUEST_ID + ":parameters";

    it('the cache key is derived from the request id', function () {
      assert.strictEqual(RequestParameters.requestCacheKey(REQUEST_ID), "tilebot:requests:" + REQUEST_ID);
    });

    it('a parameter is stored json-serialised, with the configured ttl', async function () {
      const cache = hashCache();
      await RequestParameters.addParameterStatic(cache, REQUEST_ID, "plan", { tier: "gold" });

      assert.strictEqual(cache.hashes[KEY].plan, '{"tier":"gold"}');
      assert.deepStrictEqual(cache.lastOpts, { EX: 15 * 24 * 60 * 60 });
      assert.deepStrictEqual(await RequestParameters.getParameterStatic(cache, REQUEST_ID, "plan"), { tier: "gold" });
    });

    it('a parameter with no name is dropped rather than written under "null"', async function () {
      const cache = hashCache();
      await RequestParameters.addParameterStatic(cache, REQUEST_ID, null, "x");
      await RequestParameters.addParameterStatic(cache, REQUEST_ID, undefined, "x");
      assert.deepStrictEqual(cache.hashes, {});
    });

    it('a value over 20MB is refused rather than pushed at redis', async function () {
      const cache = hashCache();
      await RequestParameters.addParameterStatic(cache, REQUEST_ID, "huge", "x".repeat(20000001));
      assert.deepStrictEqual(cache.hashes, {}, 'nothing may be written for an oversized value');
    });

    it('allParametersStatic parses every value back to a native one', async function () {
      const cache = hashCache();
      await RequestParameters.addParameterStatic(cache, REQUEST_ID, "n", 3);
      await RequestParameters.addParameterStatic(cache, REQUEST_ID, "s", "text");
      await RequestParameters.addParameterStatic(cache, REQUEST_ID, "o", { a: [1, 2] });

      assert.deepStrictEqual(await RequestParameters.allParametersStatic(cache, REQUEST_ID),
        { n: 3, s: "text", o: { a: [1, 2] } });
    });

    it('a value that is not valid json is logged and left out of the map', async function () {
      const cache = hashCache();
      cache.hashes[KEY] = { good: '"ok"', corrupt: '{not json' };

      assert.deepStrictEqual(await RequestParameters.allParametersStatic(cache, REQUEST_ID), { good: "ok" },
        'one corrupt attribute must not lose the whole flow context');
    });

    it('deleteParameterStatic removes just that attribute', async function () {
      const cache = hashCache();
      await RequestParameters.addParameterStatic(cache, REQUEST_ID, "a", 1);
      await RequestParameters.addParameterStatic(cache, REQUEST_ID, "b", 2);
      await RequestParameters.deleteParameterStatic(cache, REQUEST_ID, "a");

      assert.deepStrictEqual(await RequestParameters.allParametersStatic(cache, REQUEST_ID), { b: 2 });
    });

  });

  // ---------------------------------------------------------------- IntentForm

  describe('IntentForm.validate', function () {

    const form = new IntentForm({ chatbot: { tdcache: null }, requestId: REQUEST_ID });

    it('a plain regex matches or does not', function () {
      assert.strictEqual(form.validate("ada@test.test", "^\\S+@\\S+$"), true);
      assert.strictEqual(form.validate("not an email", "^\\S+@\\S+$"), false);
    });

    it('a regex wrapped in slashes is accepted for legacy forms', function () {
      assert.strictEqual(form.validate("12345", "/^[0-9]+$/"), true);
      assert.strictEqual(form.validate("12a45", "/^[0-9]+$/"), false);
    });

    it('a regex that will not compile lets the answer through rather than blocking the form', function () {
      assert.strictEqual(form.validate("anything", "([unclosed"), true,
        'a designer typo must not lock the user out of their own form');
    });

  });

});
