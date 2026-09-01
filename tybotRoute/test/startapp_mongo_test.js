'use strict';

// The MongoDB boot path.
//
// Every other file in this suite starts the connector with `settings.bots`
// (static bots) and never talks to MongoDB. That leaves the branch the PRODUCT
// actually ships -- `startApp` without `settings.bots`, which connects mongoose
// and makes routes/messageRoutes.js build a MongodbBotsDataSource and an
// IntentsMachineFactory machine -- completely unexercised. This file is the one
// place that runs it, against the mongo of docker-compose.test.yml.
//
// It is deliberately self-contained: its own database name, its own bot and
// intents, dropped in after(). It must stay the ONLY file that boots in mongo
// mode -- mongoose has one default connection per process and the suite spawns
// one process per file, which is what keeps this from leaking anywhere else.

const assert = require('assert');
const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const tybot = require('..');
const { startApp, connectRedis } = require('../startApp.js');
const { runtimeContext } = require('../routes/runtimeContext.js');
const Faq = require('../models/faq');
const Faq_kb = require('../models/faq_kb');

const PROJECT_ID = "projectID";
const SERVER_PORT = 10001;
const MOCK_PORT = 10002;
const BASE = `http://localhost:${SERVER_PORT}`;
const MONGODB_URI = 'mongodb://127.0.0.1:27017/tilebot_startapp_test';

// Values the boot is asked to read out of the environment. Both are read by
// startApp at call time, so setting them here is enough.
const MAX_STEPS = 321;
const MAX_EXECUTION_TIME = 654321;

const HTTP = { validateStatus: () => true };

function newRequestId() {
  return "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
}

function envelope(text, requestId) {
  return {
    payload: {
      senderFullname: "guest#367e",
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
  const deadline = Date.now() + (ms || 6000);
  for (;;) {
    const v = predicate();
    if (v) return v;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, 40));
  }
}

// ==================================================================== tests

describe('startApp', function () {

  // ------------------------------------------------------- settings guards

  describe('the settings guards', function () {

    it('refuses to start with neither static bots nor a MONGODB_URI', async () => {
      await assert.rejects(
        () => startApp({ API_ENDPOINT: process.env.API_ENDPOINT }, () => { }),
        /settings.MONGODB_URI is mandatory/);
    });

    it('surfaces a missing API_ENDPOINT on the completion callback AND rejects', async () => {
      let seen = 'not called';
      await assert.rejects(
        () => startApp({ MONGODB_URI: MONGODB_URI }, (err) => { seen = err; }),
        /settings.API_ENDPOINT is mandatory/);

      assert.ok(seen instanceof Error,
        'a callback-style caller must be told, not left hanging on a promise nobody watches');
      assert.match(seen.message, /settings.API_ENDPOINT is mandatory/);
    });
  });

  // ---------------------------------------------------------- connectRedis

  describe('connectRedis', function () {

    it('drops the cache and exits 1 when redis cannot be reached', async () => {
      const original = runtimeContext.tdcache;
      const originalExit = process.exit;
      const exits = [];
      let connectCalls = 0;

      runtimeContext.tdcache = {
        async connect() { connectCalls += 1; throw new Error("redis is down"); }
      };
      process.exit = (code) => { exits.push(code); };
      try {
        await connectRedis();
      } finally {
        process.exit = originalExit;
      }

      assert.strictEqual(connectCalls, 1);
      assert.deepStrictEqual(exits, [1],
        'a connector that cannot cache must die, not serve half a flow');
      assert.strictEqual(runtimeContext.tdcache, null,
        'the unusable cache must be dropped');

      runtimeContext.tdcache = original;
    });

    it('does nothing at all when no cache was configured', async () => {
      const original = runtimeContext.tdcache;
      runtimeContext.tdcache = null;
      await connectRedis();
      assert.strictEqual(runtimeContext.tdcache, null);
      runtimeContext.tdcache = original;
    });
  });

  // ------------------------------------------------- the failed connection

  describe('a MongoDB that cannot be reached', function () {

    it('never reaches the completion callback', async () => {
      let called = false;
      await startApp({
        MONGODB_URI: 'mongodb://127.0.0.1:1/nope?serverSelectionTimeoutMS=400',
        API_ENDPOINT: process.env.API_ENDPOINT,
        TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT
      }, () => { called = true; });

      // The connection attempt is fire-and-forget: startApp resolves before it
      // settles. Give it longer than the 400ms server-selection budget.
      await new Promise((r) => setTimeout(r, 1500));

      assert.strictEqual(called, false,
        'the connector must not report itself started with no data source');
      assert.strictEqual(mongoose.connection.readyState, 0, 'and must stay disconnected');
      assert.strictEqual(runtimeContext.staticBots, undefined,
        'no static bots were configured, so the mongo branch is the one that ran');
    });
  });

  // ------------------------------------------------------- the real thing

  describe('booting against MongoDB', function () {

    let app_listener;
    let mock_listener;
    let seen;
    let botId;

    before(async function () {
      this.timeout(20000);

      process.env.CHATBOT_MAX_STEPS = String(MAX_STEPS);
      process.env.CHATBOT_MAX_EXECUTION_TIME = String(MAX_EXECUTION_TIME);
      // The analytics client posts here; the mock records the envelopes.
      process.env.ANALYTICS_INGEST_URL = `http://127.0.0.1:${MOCK_PORT}`;

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
      await new Promise((r) => { mock_listener = mock.listen(MOCK_PORT, '0.0.0.0', r); });

      await new Promise((resolve, reject) => {
        startApp({
          MONGODB_URI: MONGODB_URI,
          API_ENDPOINT: process.env.API_ENDPOINT,
          TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT,
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
      await new Promise((r) => { app_listener = app.listen(SERVER_PORT, r); });

      // The bot and its one intent, written through the very models the
      // MongodbBotsDataSource reads back.
      const kb = await Faq_kb.create({
        name: "startapp mongo bot",
        id_project: PROJECT_ID,
        secret: "s3cr3t",
        createdBy: "tests",
        language: "en",
        type: "tilebot"
      });
      botId = kb._id.toString();

      await Faq.create({
        id_faq_kb: botId,
        id_project: PROJECT_ID,
        intent_display_name: "start",
        intent_id: "11111111-1111-1111-1111-111111111111",
        question: "\\start",
        answer: "Hello from Mongo",
        language: "en",
        createdBy: "tests"
      });
    });

    after(async function () {
      this.timeout(20000);
      delete process.env.CHATBOT_MAX_STEPS;
      delete process.env.CHATBOT_MAX_EXECUTION_TIME;
      delete process.env.ANALYTICS_INGEST_URL;
      if (app_listener) await new Promise((r) => app_listener.close(r));
      if (mock_listener) await new Promise((r) => mock_listener.close(r));
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
      }
      if (runtimeContext.tdcache && runtimeContext.tdcache.client) {
        await runtimeContext.tdcache.client.quit();
        if (runtimeContext.tdcache.subscriberClient) await runtimeContext.tdcache.subscriberClient.quit();
      }
    });

    beforeEach(() => { seen.messages = []; seen.events = []; seen.requests = []; });

    it('connects mongoose and calls the completion callback', function () {
      assert.strictEqual(mongoose.connection.readyState, 1, 'mongoose must be connected');
      // The before() hook resolves only from the completion callback, so
      // reaching this test at all IS the callback having fired.
      assert.strictEqual(runtimeContext.staticBots, undefined,
        'the mongo branch runs only when no static bots were given');
    });

    it('derives the endpoints on the runtime context from the settings', function () {
      assert.strictEqual(runtimeContext.API_ENDPOINT, process.env.API_ENDPOINT);
      assert.strictEqual(runtimeContext.TILEBOT_ENDPOINT, process.env.TILEBOT_ENDPOINT);
    });

    it('takes the execution budget from the environment', function () {
      assert.strictEqual(runtimeContext.MAX_STEPS, MAX_STEPS);
      assert.strictEqual(runtimeContext.MAX_EXECUTION_TIME, MAX_EXECUTION_TIME);
    });

    it('connects the redis cache', async function () {
      assert.ok(runtimeContext.tdcache, 'REDIS_HOST/REDIS_PORT were given, so a cache must exist');
      const key = "tilebot:requests:startapp-mongo-probe";
      await runtimeContext.tdcache.set(key, "up");
      assert.strictEqual(await runtimeContext.tdcache.get(key), "up");
      await runtimeContext.tdcache.del(key);
    });

    it('mounts the router: the health check answers', async () => {
      const res = await axios.get(`${BASE}/`, HTTP);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data, 'Hello Tilebot!');
    });

    it('answers /ext/:botid from a bot and an intent held in MongoDB', async function () {
      this.timeout(20000);
      const requestId = newRequestId();

      const res = await axios.post(`${BASE}/ext/${botId}`, envelope("/start", requestId), HTTP);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.data, { success: true });

      const sent = await waitFor(() => seen.messages.find((m) => m.requestId === requestId), 10000);
      assert.ok(sent, 'the reply must reach the API');
      assert.strictEqual(sent.body.text, "Hello from Mongo",
        'the answer stored in the faq collection is the one delivered');
      assert.strictEqual(sent.body.attributes.intent_info.intent_name, "start");
      assert.strictEqual(sent.body.attributes._raw_message, "Hello from Mongo");

      const cached = await runtimeContext.tdcache.get("tilebot:botId_requests:" + requestId);
      assert.strictEqual(cached, botId,
        'the route caches which bot owns the request');

      // The bot mongoose handed back is cached for the next message.
      const botCached = await runtimeContext.tdcache.get(
        "cacheman:cachegoose-cache:faq_kbs:id:" + botId);
      assert.ok(botCached, 'the bot document is cached after the mongo lookup');
      assert.strictEqual(JSON.parse(botCached).name, "startapp mongo bot");
    });

    it('emits no analytics for a draft bot -- the mongo bot has no root_id', async function () {
      this.timeout(20000);
      const requestId = newRequestId();
      await axios.post(`${BASE}/ext/${botId}`, envelope("/start", requestId), HTTP);
      await waitFor(() => seen.messages.find((m) => m.requestId === requestId), 10000);
      await new Promise((r) => setTimeout(r, 300));

      assert.deepStrictEqual(
        seen.events.filter((e) => e.payload && e.payload.request_id === requestId),
        [], 'a bot with no root_id is a draft copy and must not be tracked');
    });

    it('tracks intent_matched and intent_completed for a published bot', async function () {
      this.timeout(20000);
      const publishedId = botId + "-published";
      // A published bot carries root_id. The faq_kb SCHEMA has no such field, so
      // the document mongoose would hand back could never hold one; the real
      // deployment reads the bot from this very redis key, written by the
      // Tiledesk server. Seeding it is how a published bot reaches the route.
      await runtimeContext.tdcache.set(
        "cacheman:cachegoose-cache:faq_kbs:id:" + publishedId,
        JSON.stringify({
          _id: publishedId,
          root_id: "ROOT-BOT-1",
          name: "published mongo bot",
          id_project: PROJECT_ID,
          language: "en",
          webhook_enabled: false
        }));
      // ... and its intent lives in mongo like any other.
      await Faq.create({
        id_faq_kb: publishedId,
        id_project: PROJECT_ID,
        intent_display_name: "start",
        intent_id: "22222222-2222-2222-2222-222222222222",
        question: "\\start",
        answer: "Hello from the published bot",
        language: "en",
        createdBy: "tests"
      });

      const requestId = newRequestId();
      await axios.post(`${BASE}/ext/${publishedId}`, envelope("/start", requestId), HTTP);

      const sent = await waitFor(() => seen.messages.find((m) => m.requestId === requestId), 10000);
      assert.ok(sent);
      assert.strictEqual(sent.body.text, "Hello from the published bot");

      const matched = await waitFor(
        () => seen.events.find((e) => e.event_type === 'agent.intent_matched'
          && e.payload.request_id === requestId), 10000);
      assert.ok(matched, 'a published run must emit agent.intent_matched');
      assert.strictEqual(matched.id_project, PROJECT_ID);
      assert.strictEqual(matched.payload.agent_id, "ROOT-BOT-1");
      assert.strictEqual(matched.payload.intent_name, "start");
      assert.strictEqual(matched.payload.intent_id, "22222222-2222-2222-2222-222222222222");
      assert.strictEqual(matched.payload.match_type, 'explicit');

      const completed = await waitFor(
        () => seen.events.find((e) => e.event_type === 'agent.intent_completed'
          && e.payload.request_id === requestId), 10000);
      assert.ok(completed, 'and agent.intent_completed once the reply was sent');
      assert.strictEqual(completed.payload.agent_id, "ROOT-BOT-1");
      assert.strictEqual(completed.payload.intent_id, "22222222-2222-2222-2222-222222222222");
      assert.strictEqual(completed.payload.success, true);
      assert.strictEqual(typeof completed.payload.duration_ms, 'number');
    });

    it('answers /exec/:botid from MongoDB too', async function () {
      this.timeout(20000);
      const requestId = newRequestId();

      const res = await axios.post(`${BASE}/exec/${botId}`,
        envelope("/#11111111-1111-1111-1111-111111111111", requestId), HTTP);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.data, { success: true });

      const sent = await waitFor(() => seen.messages.find((m) => m.requestId === requestId), 10000);
      assert.ok(sent, 'the block answer must reach the API');
      assert.strictEqual(sent.body.text, "Hello from Mongo");
    });

    it('reports an unknown bot id without replying', async function () {
      this.timeout(20000);
      const requestId = newRequestId();
      const unknown = "60a0000000000000000000ff";

      const res = await axios.post(`${BASE}/ext/${unknown}`, envelope("/start", requestId), HTTP);
      assert.strictEqual(res.status, 200, 'the route acknowledges before running the flow');

      await new Promise((r) => setTimeout(r, 800));
      assert.deepStrictEqual(seen.messages, [],
        'a bot mongo does not know about produces no reply');
      const health = await axios.get(`${BASE}/`, HTTP);
      assert.strictEqual(health.status, 200, 'and the route layer stays up');
    });
  });
});
