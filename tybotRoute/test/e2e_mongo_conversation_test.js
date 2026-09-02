'use strict';

// End-to-end conversations against a bot that lives ONLY in MongoDB.
//
// Why this file exists
// --------------------
// 46 files in this suite boot the full Express app, and every one of them
// hands `startApp` a static `bots` object. Production never does that: it
// boots WITHOUT `settings.bots`, so routes/messageRoutes.js builds a
// `MongodbBotsDataSource` and asks `IntentsMachineFactory` for a
// `MongodbIntentsMachine`. Those three classes reported 100% coverage from
// unit tests alone -- no test had ever pushed a message through a bot that was
// actually stored in mongo, so the production data path was unverified from
// the HTTP edge inward.
//
// `startapp_mongo_test.js` boots that way too, but it is a BOOT test: it pins
// the wiring (mongoose connected, endpoints derived, health check answers) and
// one explicit-intent reply. This file drives conversations: natural-language
// matching through the mongo `$text` matcher, state carried across turns in
// redis, a directive parsed out of an answer that was read back from mongo,
// and the bot cache.
//
// Isolation rules this file obeys (mongoose has ONE default connection per
// process; the runner's process-per-file isolation is what keeps the other 90
// files away from mongo):
//   * its own database, `tilebot_e2e_test`, never the one startapp_mongo_test
//     uses, dropped in after();
//   * its own ports, 10011/10012 -- the rest of the suite binds 10001/10002
//     (and 10000, 10099, 12000, 12345, 15000);
//   * it closes both listeners, disconnects mongoose and quits redis in
//     after(), so the file's process exits well inside the runner's 300s cap.
//
// Everything asserted here is observable from outside the engine: what was
// POSTed to the mock Tiledesk API, what is in redis, and how many times the
// mongo model was actually read.

const assert = require('assert');
const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const tybot = require('..');
const { startApp } = require('../startApp.js');
const { runtimeContext } = require('../routes/runtimeContext.js');
const Faq = require('../models/faq');
const Faq_kb = require('../models/faq_kb');

const PROJECT_ID = "projectID";
const SERVER_PORT = 10011;
const MOCK_PORT = 10012;
const BASE = `http://127.0.0.1:${SERVER_PORT}`;
const MONGODB_URI = 'mongodb://127.0.0.1:27017/tilebot_e2e_test';

// TILEBOT_ENDPOINT must point back at THIS app: a plain-text reply is posted by
// ExtApi to `${TILEBOT_ENDPOINT}/ext/:projectId/requests/:requestId/messages`,
// which is a route of the connector itself (that is where the directive
// pipeline runs). API_ENDPOINT is the Tiledesk server, i.e. the mock.
const API_ENDPOINT = `http://127.0.0.1:${MOCK_PORT}`;
const TILEBOT_ENDPOINT = BASE;

const HTTP = { validateStatus: () => true };

function newRequestId() {
  return "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
}

function envelope(text, requestId) {
  return {
    payload: {
      senderFullname: "guest#e2e",
      type: "text",
      sender: "A-SENDER",
      recipient: requestId,
      text: text,
      id_project: PROJECT_ID,
      request: { request_id: requestId }
    },
    token: "XXX"
  };
}

/** Polls `predicate` until it returns truthy, or gives up after `ms`. */
async function waitFor(predicate, ms) {
  const deadline = Date.now() + (ms || 8000);
  for (; ;) {
    const v = await predicate();
    if (v) return v;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, 40));
  }
}

// ==================================================================== tests

describe('a conversation with a bot that lives only in MongoDB', function () {

  let app_listener;
  let mock_listener;
  let seen;
  let botId;

  // Every Faq_kb.findById the connector performs, in order. The wrapper
  // delegates to the real model, so this only observes; journey 5 uses it to
  // prove the bot cache spares mongo the second read.
  let botReads;
  let originalFindById;

  // Unhandled rejections escaping the express handlers. Mocha traps them and
  // re-emits on `process` with its own listener removed, so a listener of our
  // own is the only way to see one -- and the unknown-bot journey needs to.
  let rejections;
  let onRejection;

  before(async function () {
    this.timeout(30000);

    process.env.ANALYTICS_INGEST_URL = `http://127.0.0.1:${MOCK_PORT}`;

    rejections = [];
    onRejection = (reason) => { rejections.push(reason); };
    process.on('unhandledRejection', onRejection);

    seen = { messages: [], events: [], requests: [] };
    const mock = express();
    mock.use(bodyParser.json());
    mock.post('/events', (req, res) => { seen.events.push(req.body); res.status(200).send({ ok: true }); });
    mock.get('/:projectId/requests/:requestId', (req, res) => {
      seen.requests.push(req.params.requestId);
      res.status(404).send({ success: false });
    });
    mock.post('/:projectId/requests/:requestId/messages', (req, res) => {
      seen.messages.push({ requestId: req.params.requestId, body: req.body });
      res.status(200).send({ success: true });
    });
    await new Promise((r) => { mock_listener = mock.listen(MOCK_PORT, '127.0.0.1', r); });

    // No `bots` setting: this is the production branch, MongodbBotsDataSource.
    await new Promise((resolve, reject) => {
      startApp({
        MONGODB_URI: MONGODB_URI,
        API_ENDPOINT: API_ENDPOINT,
        TILEBOT_ENDPOINT: TILEBOT_ENDPOINT,
        REDIS_HOST: process.env.REDIS_HOST,
        REDIS_PORT: process.env.REDIS_PORT,
        REDIS_PASSWORD: process.env.REDIS_PASSWORD
      }, (err) => {
        if (err) return reject(err);
        resolve();
      }).catch(reject);
    });

    const app = express();
    app.use("/", tybot.router);
    await new Promise((r) => { app_listener = app.listen(SERVER_PORT, '127.0.0.1', r); });

    // startApp connects with `autoIndex: false`, so the schema's indexes are
    // NOT built for us. The natural-language journey runs a `$text` query, and
    // without `faq_fulltext` mongo answers it with an error rather than a
    // miss -- build them explicitly, from the very schemas production uses.
    await Faq_kb.createIndexes();
    await Faq.createIndexes();

    const kb = await Faq_kb.create({
      name: "e2e mongo bot",
      id_project: PROJECT_ID,
      secret: "s3cr3t",
      createdBy: "tests",
      language: "en",
      type: "tilebot"
    });
    botId = kb._id.toString();

    await Faq.insertMany([
      {
        id_faq_kb: botId,
        id_project: PROJECT_ID,
        intent_display_name: "welcome",
        intent_id: "aaaaaaaa-0000-0000-0000-000000000001",
        question: "hi there",
        answer: "Welcome, this answer lives in MongoDB",
        language: "en",
        createdBy: "tests"
      },
      {
        // Journey 2's target. The question is NOT what the test sends, so the
        // exact-match query misses and the mongo $text matcher has to earn it.
        id_faq_kb: botId,
        id_project: PROJECT_ID,
        intent_display_name: "opening_hours",
        intent_id: "aaaaaaaa-0000-0000-0000-000000000002",
        question: "what are your opening hours",
        answer: "We are open from 9 to 18",
        language: "en",
        createdBy: "tests"
      },
      {
        // Journeys 3 and 4: a directive in the answer text, written to mongo
        // and parsed back out of it by the directive pipeline.
        id_faq_kb: botId,
        id_project: PROJECT_ID,
        intent_display_name: "remember_name",
        intent_id: "aaaaaaaa-0000-0000-0000-000000000003",
        question: "remember my name",
        answer: "Noted.\n\\_tdassign --expression \"'Ada Lovelace'\" --assignTo \"visitor_name\"",
        language: "en",
        createdBy: "tests"
      },
      {
        // Journey 3, turn 2: reads back what turn 1 put in redis.
        id_faq_kb: botId,
        id_project: PROJECT_ID,
        intent_display_name: "greet_by_name",
        intent_id: "aaaaaaaa-0000-0000-0000-000000000004",
        question: "greet me by name",
        answer: "Hello ${visitor_name}, welcome back",
        language: "en",
        createdBy: "tests"
      },
      {
        // Journey 4: a directive that produces a SECOND, separate message.
        id_faq_kb: botId,
        id_project: PROJECT_ID,
        intent_display_name: "two_messages",
        intent_id: "aaaaaaaa-0000-0000-0000-000000000005",
        question: "say it twice",
        answer: "First message\n\\_tdmessage Second message from a directive",
        language: "en",
        createdBy: "tests"
      }
    ]);

    originalFindById = Faq_kb.findById;
    Faq_kb.findById = function (...args) {
      botReads.push(String(args[0]));
      return originalFindById.apply(this, args);
    };
    botReads = [];
  });

  after(async function () {
    this.timeout(30000);
    if (originalFindById) Faq_kb.findById = originalFindById;
    if (onRejection) process.removeListener('unhandledRejection', onRejection);
    delete process.env.ANALYTICS_INGEST_URL;
    if (app_listener) await new Promise((r) => app_listener.close(r));
    if (mock_listener) await new Promise((r) => mock_listener.close(r));
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
    if (runtimeContext.tdcache && runtimeContext.tdcache.client) {
      await runtimeContext.tdcache.client.quit();
      if (runtimeContext.tdcache.subscriberClient) {
        await runtimeContext.tdcache.subscriberClient.quit();
      }
    }
  });

  beforeEach(() => {
    seen.messages = [];
    seen.events = [];
    seen.requests = [];
    botReads = [];
    rejections = [];
  });

  // ------------------------------------------------------------ journey 1

  describe('an explicit intent', function () {

    it('answers /welcome with the answer stored in mongo, having read the bot from mongo', async function () {
      this.timeout(25000);
      const requestId = newRequestId();

      assert.strictEqual(runtimeContext.staticBots, undefined,
        'no static bots were configured: this is the MongodbBotsDataSource branch');

      const res = await axios.post(`${BASE}/ext/${botId}`, envelope("/welcome", requestId), HTTP);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.data, { success: true });

      const sent = await waitFor(() => seen.messages.find((m) => m.requestId === requestId), 15000);
      assert.ok(sent, 'the reply must reach the Tiledesk API');
      assert.strictEqual(sent.body.text, "Welcome, this answer lives in MongoDB",
        'the text posted is the `answer` field of the faq document');
      assert.strictEqual(sent.body.attributes.intent_info.intent_name, "welcome");
      assert.strictEqual(sent.body.attributes.intent_info.intent_id,
        "aaaaaaaa-0000-0000-0000-000000000001",
        'and it carries the intent_id of the mongo document, not a synthesised one');

      // The full path really did start at mongo: the connector read the bot
      // document through the model before it could reply.
      assert.deepStrictEqual(botReads, [botId],
        'the bot was fetched from mongo exactly once for the first message of this bot');

      // The route remembers which bot owns the request.
      assert.strictEqual(
        await runtimeContext.tdcache.get("tilebot:botId_requests:" + requestId), botId);
    });

    it('posts nothing for an explicit intent that is not in mongo', async function () {
      this.timeout(25000);
      const requestId = newRequestId();

      const res = await axios.post(`${BASE}/ext/${botId}`,
        envelope("/no_such_intent_anywhere", requestId), HTTP);
      assert.strictEqual(res.status, 200);

      await new Promise((r) => setTimeout(r, 1200));
      assert.deepStrictEqual(seen.messages.filter((m) => m.requestId === requestId), [],
        'an explicit intent with no faq document produces no message at all');
    });
  });

  // ------------------------------------------------------------ journey 2

  describe('natural-language matching through MongodbIntentsMachine', function () {

    it('matches a phrase that is not an exact question and not a /command', async function () {
      this.timeout(25000);
      const requestId = newRequestId();

      // "opening hours please" is neither an explicit intent (no leading "/")
      // nor equal to any stored `question`, so getByExactMatch misses and the
      // only thing that can produce a reply is the mongo $text matcher.
      await axios.post(`${BASE}/ext/${botId}`, envelope("opening hours please", requestId), HTTP);

      const sent = await waitFor(() => seen.messages.find((m) => m.requestId === requestId), 15000);
      assert.ok(sent, 'the full-text matcher must find the intent');
      assert.strictEqual(sent.body.text, "We are open from 9 to 18");
      assert.strictEqual(sent.body.attributes.intent_info.intent_name, "opening_hours",
        'and it must pick THAT intent, not merely the first faq of the bot');
    });

    it('stays silent on a phrase that matches nothing -- the matcher discriminates', async function () {
      this.timeout(25000);
      const requestId = newRequestId();

      await axios.post(`${BASE}/ext/${botId}`, envelope("zzqqxx wubbleflux", requestId), HTTP);

      await new Promise((r) => setTimeout(r, 1500));
      assert.deepStrictEqual(seen.messages.filter((m) => m.requestId === requestId), [],
        'no intent scores, there is no defaultFallback faq, so nothing is posted -- '
        + 'which is what proves the previous test was a real full-text match');
    });

    it('reports the match as nlp on the analytics stream', async function () {
      this.timeout(25000);

      // Only a PUBLISHED bot (one carrying root_id) is tracked, and the
      // faq_kb schema has no root_id field -- in production the published copy
      // reaches the connector through this very redis key, written by the
      // Tiledesk server. So the bot metadata comes from the cache here while
      // the intent matching, which is what this test is about, is 100% the
      // mongo $text query against documents in the faqs collection.
      const publishedId = new mongoose.Types.ObjectId().toString();
      await runtimeContext.tdcache.set(
        "cacheman:cachegoose-cache:faq_kbs:id:" + publishedId,
        JSON.stringify({
          _id: publishedId,
          root_id: "ROOT-E2E-1",
          name: "published e2e bot",
          id_project: PROJECT_ID,
          language: "en",
          webhook_enabled: false
        }));
      await Faq.create({
        id_faq_kb: publishedId,
        id_project: PROJECT_ID,
        intent_display_name: "refund_policy",
        intent_id: "bbbbbbbb-0000-0000-0000-000000000001",
        question: "how do refunds work",
        answer: "Refunds take five days",
        language: "en",
        createdBy: "tests"
      });

      const requestId = newRequestId();
      await axios.post(`${BASE}/ext/${publishedId}`, envelope("tell me about refunds", requestId), HTTP);

      const sent = await waitFor(() => seen.messages.find((m) => m.requestId === requestId), 15000);
      assert.ok(sent);
      assert.strictEqual(sent.body.text, "Refunds take five days");

      const matched = await waitFor(
        () => seen.events.find((e) => e.event_type === 'agent.intent_matched'
          && e.payload.request_id === requestId), 15000);
      assert.ok(matched, 'a published run emits agent.intent_matched');
      assert.strictEqual(matched.payload.match_type, 'nlp',
        'the engine itself labels this a natural-language match, not an explicit one');
      assert.strictEqual(matched.payload.intent_name, "refund_policy");
      assert.strictEqual(matched.payload.intent_id, "bbbbbbbb-0000-0000-0000-000000000001");
    });
  });

  // --------------------------------------------------------- journeys 3+4

  describe('a multi-turn conversation', function () {

    it('carries an attribute set by a directive in turn 1 into the answer of turn 2', async function () {
      this.timeout(30000);
      const requestId = newRequestId();
      const paramsKey = "tilebot:requests:" + requestId + ":parameters";

      // --- turn 1: the mongo answer text carries \_tdassign ----------------
      await axios.post(`${BASE}/ext/${botId}`, envelope("/remember_name", requestId), HTTP);

      const first = await waitFor(() => seen.messages.find((m) => m.requestId === requestId), 15000);
      assert.ok(first, 'turn 1 must be answered');
      assert.strictEqual(first.body.text, "Noted.",
        'the directive is stripped out of the text the user sees');
      assert.strictEqual(first.body.attributes._raw_message,
        "Noted.\n\\_tdassign --expression \"'Ada Lovelace'\" --assignTo \"visitor_name\"",
        '_raw_message keeps the answer exactly as it is stored in mongo');

      // The directive ran: the attribute is in redis, under this request.
      const stored = await waitFor(
        async () => await runtimeContext.tdcache.hget(paramsKey, "visitor_name"), 15000);
      assert.strictEqual(stored, JSON.stringify("Ada Lovelace"),
        'the \\_tdassign directive parsed out of the stored answer wrote the attribute');

      // --- turn 2: same request, a different intent, reading it back -------
      seen.messages = [];
      await axios.post(`${BASE}/ext/${botId}`, envelope("/greet_by_name", requestId), HTTP);

      const second = await waitFor(() => seen.messages.find((m) => m.requestId === requestId), 15000);
      assert.ok(second, 'turn 2 must be answered');
      assert.strictEqual(second.body.text, "Hello Ada Lovelace, welcome back",
        'the second turn filled ${visitor_name} from the state the first turn left in redis');
    });

    it('keeps the state per request: another request sees no visitor_name', async function () {
      this.timeout(25000);
      const otherRequestId = newRequestId();

      await axios.post(`${BASE}/ext/${botId}`, envelope("/greet_by_name", otherRequestId), HTTP);

      const sent = await waitFor(() => seen.messages.find((m) => m.requestId === otherRequestId), 15000);
      assert.ok(sent);
      // The point of the assertion is the ISOLATION: "Ada Lovelace" must not
      // leak in from the other request. (An unresolved placeholder is left
      // verbatim by the Filler rather than blanked -- that is the shipped
      // behaviour, pinned here as it is.)
      assert.strictEqual(sent.body.text, "Hello ${visitor_name}, welcome back",
        'a different request must not see the attribute the first conversation set');
    });

    it('executes a \\_tdmessage directive read out of a mongo answer, as a second message', async function () {
      this.timeout(25000);
      const requestId = newRequestId();

      await axios.post(`${BASE}/ext/${botId}`, envelope("/two_messages", requestId), HTTP);

      const both = await waitFor(() => {
        const mine = seen.messages.filter((m) => m.requestId === requestId);
        return mine.length >= 2 ? mine : null;
      }, 15000);
      assert.ok(both, 'the answer text and the directive must produce two messages');
      assert.deepStrictEqual(both.map((m) => m.body.text),
        ["First message", "Second message from a directive"],
        'the directive parsed out of the stored answer posted its own message, after the reply');
    });
  });

  // ------------------------------------------------------------ journey 5

  describe('the bot cache', function () {

    it('serves the second message from redis, without reading mongo again', async function () {
      this.timeout(30000);

      // A bot of its own, so its cache key is untouched.
      const kb = await Faq_kb.create({
        name: "cached e2e bot",
        id_project: PROJECT_ID,
        secret: "s3cr3t",
        createdBy: "tests",
        language: "en",
        type: "tilebot"
      });
      const cachedBotId = kb._id.toString();
      await Faq.create({
        id_faq_kb: cachedBotId,
        id_project: PROJECT_ID,
        intent_display_name: "ping",
        intent_id: "cccccccc-0000-0000-0000-000000000001",
        question: "ping",
        answer: "pong from the cached bot",
        language: "en",
        createdBy: "tests"
      });

      // --- first message: mongo is read, the bot is cached -----------------
      const firstRequestId = newRequestId();
      botReads = [];
      await axios.post(`${BASE}/ext/${cachedBotId}`, envelope("/ping", firstRequestId), HTTP);
      const first = await waitFor(() => seen.messages.find((m) => m.requestId === firstRequestId), 15000);
      assert.ok(first);
      assert.strictEqual(first.body.text, "pong from the cached bot");
      assert.deepStrictEqual(botReads, [cachedBotId],
        'the first message reads the bot document from mongo');

      const cached = await runtimeContext.tdcache.get(
        "cacheman:cachegoose-cache:faq_kbs:id:" + cachedBotId);
      assert.ok(cached, 'and caches it');
      assert.strictEqual(JSON.parse(cached).name, "cached e2e bot");

      // --- now delete the bot from mongo altogether ------------------------
      // Deleted through the raw driver so the wrapped model is not involved
      // and `botReads` keeps counting only what the CONNECTOR did.
      await mongoose.connection.db.collection('faq_kbs')
        .deleteOne({ _id: kb._id });
      const goneCheck = await mongoose.connection.db.collection('faq_kbs')
        .findOne({ _id: kb._id });
      assert.strictEqual(goneCheck, null, 'the bot document is really gone from mongo');

      // --- second message: still answered, and mongo was never asked -------
      const secondRequestId = newRequestId();
      botReads = [];
      seen.messages = [];
      await axios.post(`${BASE}/ext/${cachedBotId}`, envelope("/ping", secondRequestId), HTTP);
      const second = await waitFor(() => seen.messages.find((m) => m.requestId === secondRequestId), 15000);
      assert.ok(second,
        'the bot no longer exists in mongo, so a reply at all is only possible from the cache');
      assert.strictEqual(second.body.text, "pong from the cached bot");
      assert.deepStrictEqual(botReads, [],
        'getBotByIdCache did not touch mongo for the second message');
    });
  });

  // ------------------------------------------------------------ journey 6

  describe('a message for a bot id mongo does not know', function () {

    // BUG (pre-existing, NOT fixed here).
    //
    //   tybotRoute/engine/IntentsMachineFactory.js:26-31  getBackupMachine()
    //
    //     static getBackupMachine(bot, botId, projectId) {
    //       ...
    //       machine = new MongodbIntentsMachine({projectId: projectId, language: bot.language});
    //
    // Its sibling getMachine() guards with `else if (bot) { ... } else {
    // winston.error(...) }` and returns undefined for a null bot;
    // getBackupMachine has no guard at all. routes/messageRoutes.js calls both,
    // one line apart (lines 100-101), on the SAME `bot` -- so when
    // MongodbBotsDataSource.getBotByIdCache() legitimately returns null for an
    // id that is not in the faq_kbs collection, getMachine() logs and copes and
    // getBackupMachine() throws
    //
    //     TypeError: Cannot read properties of null (reading 'language')
    //
    // inside the express async handler. Express 4 does not forward a rejected
    // handler promise, so the message is dropped with no operator-visible
    // error: the connector answers 200 (that happens before the lookup) and
    // then goes quiet. The test below pins that ACTUAL behaviour, crash
    // included, so the defect cannot change shape unnoticed; the skipped test
    // after it states what SHOULD happen.
    it('crashes the handler with a TypeError, and drops the message', async function () {
      this.timeout(25000);
      const requestId = newRequestId();
      const unknownBotId = new mongoose.Types.ObjectId().toString();

      const res = await axios.post(`${BASE}/ext/${unknownBotId}`,
        envelope("/welcome", requestId), HTTP);
      assert.strictEqual(res.status, 200,
        'the route acknowledges the webhook before it ever looks the bot up');

      const crash = await waitFor(
        () => rejections.find((r) => r instanceof TypeError), 8000);
      assert.ok(crash, 'the handler rejects rather than handling the unknown bot');
      assert.match(crash.message, /Cannot read properties of null \(reading 'language'\)/);
      assert.match(crash.stack, /IntentsMachineFactory/,
        'and it comes from IntentsMachineFactory.getBackupMachine, not from anywhere else');

      assert.deepStrictEqual(seen.messages.filter((m) => m.requestId === requestId), [],
        'nothing is posted for the unknown bot');

      const health = await axios.get(`${BASE}/`, HTTP);
      assert.strictEqual(health.status, 200, 'the connector itself stays up');
    });

    // The correct behaviour: getBackupMachine should guard `bot` exactly as
    // getMachine does, so an unknown bot id is a handled miss (log, no reply,
    // no rejection) rather than a TypeError thrown through express. Skipped
    // because the fix is a source change and this task is test-only.
    it.skip('should handle the unknown bot without throwing', async function () {
      this.timeout(25000);
      const requestId = newRequestId();
      const unknownBotId = new mongoose.Types.ObjectId().toString();

      await axios.post(`${BASE}/ext/${unknownBotId}`, envelope("/welcome", requestId), HTTP);
      await new Promise((r) => setTimeout(r, 1500));

      assert.deepStrictEqual(rejections, [],
        'an id that is simply not in the collection is a miss, not a programming error');
      assert.deepStrictEqual(seen.messages.filter((m) => m.requestId === requestId), []);
    });
  });
});
