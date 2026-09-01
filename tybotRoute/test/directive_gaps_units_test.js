'use strict';

// The directive paths the domain unit files do not reach.
//
// Three shapes:
//   - DirForm past the FIRST question: the answer being collected, the form
//     completing, the user cancelling it, and the API refusing the question;
//   - an integration that succeeded but whose success branch is NOT connected
//     to a block (no trueIntent), which is what a bot author gets by default;
//   - a web request over https, which is the only shape that attaches the
//     permissive TLS agent.
//
// Every test asserts the message that left, the flow attributes written, the
// intent the conversation jumped to, or the `stop` value handed back to the
// directive chain.

const assert = require('assert');
const express = require('express');
const bodyParser = require('body-parser');

const { DirForm } = require('../directives/conversation/DirForm');
const { DirCustomerio } = require('../directives/integrations/DirCustomerio');
const { DirHubspot } = require('../directives/integrations/DirHubspot');
const { DirSendWhatsapp } = require('../directives/integrations/DirSendWhatsapp');
const { DirWebRequest } = require('../directives/data/DirWebRequest');
const { DirJSONCondition } = require('../directives/flow/DirJSONCondition');
const { TiledeskExpression } = require('../expressions/TiledeskExpression');

const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-dirgaps";
const BOT_ID = "botID";
const PARAMS_KEY = "tilebot:requests:" + REQUEST_ID + ":parameters";
const MOCK_PORT = 10002;
const TILEBOT_PORT = 10001;
const MOCK = 'http://localhost:' + MOCK_PORT;
const API_ENDPOINT = process.env.API_ENDPOINT || MOCK;

// A port nothing listens on. `https:` is what attaches the permissive agent.
const DEAD_HTTPS = "https://127.0.0.1:9/nothing";

// ------------------------------------------------------------------ fakes

/** A cache with a REAL store: the form state has to survive between calls. */
function fakeCache(vars) {
  const store = {};
  const hashes = { [PARAMS_KEY]: {} };
  for (const [k, v] of Object.entries(vars || {})) hashes[PARAMS_KEY][k] = JSON.stringify(v);
  return {
    store, hashes,
    attrs() {
      const out = {};
      for (const [k, v] of Object.entries(hashes[PARAMS_KEY])) {
        try { out[k] = JSON.parse(v); } catch (e) { out[k] = v; }
      }
      return out;
    },
    async get(k) { return store[k] === undefined ? null : store[k]; },
    async set(k, v) { store[k] = String(v); },
    async del(k) { delete store[k]; },
    async hgetall(k) { return hashes[k] || {}; },
    async hget(k, f) { return (hashes[k] || {})[f]; },
    async hset(k, f, v) { (hashes[k] || (hashes[k] = {}))[f] = v; },
    async hdel(k, f) { delete (hashes[k] || {})[f]; },
    async expire() { }
  };
}

function fakeChatbot() {
  const params = {};
  const locks = [];
  return {
    params, locks,
    botId: BOT_ID,
    bot: { name: "Test Bot" },
    async getParameter(k) { return params[k]; },
    async addParameter(k, v) { params[k] = v; },
    async deleteParameter(k) { delete params[k]; },
    async lockAction(requestId, actionId) { locks.push(['lock', actionId]); },
    async unlockAction(requestId) { locks.push(['unlock']); }
  };
}

function recordingLogger() {
  const lines = [];
  const mk = (level) => (...args) => lines.push([level, args.map(String).join(' ')]);
  return {
    lines,
    at(level) { return lines.filter((l) => l[0] === level).map((l) => l[1]).join(' | '); },
    error: mk('error'), warn: mk('warn'), info: mk('info'),
    debug: mk('debug'), native: mk('native')
  };
}

function contextFor(overrides) {
  return Object.assign({
    projectId: PROJECT_ID,
    token: "XXX",
    API_ENDPOINT: API_ENDPOINT,
    TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT || ('http://localhost:' + TILEBOT_PORT),
    requestId: REQUEST_ID,
    supportRequest: { id_project: PROJECT_ID, request_id: REQUEST_ID, bot_id: BOT_ID }
  }, overrides);
}

/** Runs a directive, resolving with every `stop` value the callback received. */
function run(dir, directive, settleMs) {
  return new Promise((resolve, reject) => {
    const stops = [];
    let timer = null;
    const guard = setTimeout(() => reject(new Error("the directive never called back")), 12000);
    dir.execute(directive, (stop) => {
      stops.push(stop);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { clearTimeout(guard); resolve(stops); }, settleMs === undefined ? 200 : settleMs);
    });
  });
}

// ==================================================================== tests

describe('Directive paths the domain unit files do not reach', function () {

  let tilebot;
  let mock;
  let dispatched;
  let seen;
  let handlers;

  before(async function () {
    // The fake tilebot: every intent jump lands here.
    const bot = express();
    bot.use(bodyParser.json());
    bot.post('/ext/:botid', (req, res) => {
      dispatched.push(req.body.payload.text);
      res.status(200).send({ success: true });
    });
    await new Promise((r) => { tilebot = bot.listen(TILEBOT_PORT, '0.0.0.0', r); });

    // The fake Tiledesk API and the vendor endpoints, on the port
    // scripts/run-tests.js points API_ENDPOINT and the vendor overrides at.
    const api = express();
    api.use(bodyParser.json());
    api.get('/:project_id/integration/name/:name', (req, res) => {
      res.status(200).send({ value: { apikey: "vendor-key" } });
    });
    api.post('/:projectId/requests/:requestId/messages', (req, res) => {
      seen.messages.push({ requestId: req.params.requestId, body: req.body, auth: req.headers.authorization });
      if (handlers.messages) return handlers.messages(req, res);
      res.status(200).send({ success: true });
    });
    api.post('/api/v1/forms/:formId/submit', (req, res) => {
      seen.customerio.push({ formId: req.params.formId, body: req.body, auth: req.headers.authorization });
      res.status(200).send({ ok: true });
    });
    api.post('/crm/v3/objects/contacts/batch/create', (req, res) => {
      seen.hubspot.push({ body: req.body, auth: req.headers.authorization });
      res.status(201).send({ results: [{ id: "c-1" }] });
    });
    api.post('/modules/whatsapp/api/tiledesk/broadcast', (req, res) => {
      seen.broadcast.push({ body: req.body });
      res.status(200).send({ success: true });
    });
    await new Promise((r) => { mock = api.listen(MOCK_PORT, '0.0.0.0', r); });
  });

  after(async function () {
    await new Promise((r) => tilebot.close(r));
    await new Promise((r) => mock.close(r));
  });

  beforeEach(() => {
    dispatched = [];
    seen = { messages: [], customerio: [], hubspot: [], broadcast: [] };
    handlers = {};
  });

  // ------------------------------------------------------------- DirForm

  describe('DirForm past the first question', function () {

    const FORM = {
      cancelCommands: ["cancel", "reset"],
      cancelReply: "Ok, cancelled",
      fields: [{ name: "userFullname", type: "text", label: "What is your name?" }]
    };

    /** The state IntentForm leaves behind after it asked the first question. */
    function midForm(cache, form) {
      cache.store["tilebot:requests:" + REQUEST_ID + ":currentFieldIndex"] = "0";
      cache.store["tilebot:requests:" + REQUEST_ID + ":currentForm"] = JSON.stringify(form || FORM);
    }

    function build(opts) {
      const tdcache = opts.tdcache;
      const chatbot = opts.chatbot || fakeChatbot();
      const dir = new DirForm(contextFor({ tdcache, chatbot, message: opts.message }));
      dir.logger = recordingLogger();
      return { dir, tdcache, chatbot };
    }

    it('stores the answer, ends the form, unlocks the action and takes the true branch', async () => {
      const cache = fakeCache({});
      midForm(cache);
      const { dir, chatbot } = build({ tdcache: cache, message: { text: "Ada Lovelace" } });

      const stops = await run(dir, {
        name: "form",
        action: { action_id: "A-1", trueIntent: "FORM_DONE", falseIntent: "FORM_CANCELLED", form: FORM }
      });

      assert.strictEqual(chatbot.params.userFullname, "Ada Lovelace",
        'the answer is written to the flow attribute the field names');
      assert.strictEqual(chatbot.params["_tdTypeOf:userFullname"], "text");
      assert.deepStrictEqual(dispatched, ["/FORM_DONE"],
        'a completed form jumps to the true branch');
      assert.deepStrictEqual(seen.messages, [], 'and asks no further question');
      assert.deepStrictEqual(chatbot.locks, [['lock', "A-1"], ['unlock']]);
      assert.strictEqual(
        cache.store["tilebot:requests:" + REQUEST_ID + ":currentForm"], undefined,
        'the frozen form is cleared so the next run starts fresh');
      assert.deepStrictEqual(stops, [false], 'the directive chain continues');
    });

    it('ends the form without jumping when no true branch is connected', async () => {
      const cache = fakeCache({});
      midForm(cache);
      const { dir, chatbot } = build({ tdcache: cache, message: { text: "Ada" } });

      const stops = await run(dir, { name: "form", action: { action_id: "A-1", form: FORM } });

      assert.strictEqual(chatbot.params.userFullname, "Ada");
      assert.deepStrictEqual(dispatched, []);
      assert.deepStrictEqual(stops, [false]);
    });

    it('a cancel command clears the form, unlocks the action and takes the false branch', async () => {
      const cache = fakeCache({});
      midForm(cache);
      const { dir, chatbot } = build({ tdcache: cache, message: { text: "Cancel" } });

      const stops = await run(dir, {
        name: "form",
        action: { action_id: "A-1", trueIntent: "FORM_DONE", falseIntent: "FORM_CANCELLED", form: FORM }
      });

      assert.strictEqual(chatbot.params.userFullname, undefined,
        'nothing was collected, so nothing may be written');
      assert.deepStrictEqual(dispatched, ["/FORM_CANCELLED"]);
      assert.deepStrictEqual(chatbot.locks, [['lock', "A-1"], ['unlock']]);
      assert.strictEqual(
        cache.store["tilebot:requests:" + REQUEST_ID + ":currentFieldIndex"], undefined);
      assert.deepStrictEqual(stops, [false]);
    });

    it('asks the next question when the form has more fields', async () => {
      const TWO = {
        cancelCommands: ["cancel"],
        fields: [
          { name: "userFullname", type: "text", label: "What is your name?" },
          { name: "companyName", type: "text", label: "And your company?" }
        ]
      };
      const cache = fakeCache({});
      midForm(cache, TWO);
      const { dir, chatbot } = build({ tdcache: cache, message: { text: "Ada" } });

      const stops = await run(dir, { name: "form", action: { action_id: "A-1", form: TWO } });

      assert.strictEqual(chatbot.params.userFullname, "Ada");
      assert.strictEqual(seen.messages.length, 1);
      assert.strictEqual(seen.messages[0].body.text, "And your company?");
      assert.strictEqual(seen.messages[0].body.attributes.fillParams, true);
      assert.strictEqual(seen.messages[0].body.attributes.splits, true);
      assert.strictEqual(seen.messages[0].body.attributes.markbot, true);
      assert.strictEqual(
        cache.store["tilebot:requests:" + REQUEST_ID + ":currentFieldIndex"], "1",
        'the form advanced to the second field');
      assert.deepStrictEqual(stops, [true], 'the flow stops and waits for the answer');
    });

    it('still stops the flow when the API refuses the question', async () => {
      handlers.messages = (req, res) => res.status(500).send({ error: "nope" });
      const TWO = {
        fields: [
          { name: "userFullname", type: "text", label: "What is your name?" },
          { name: "companyName", type: "text", label: "And your company?" }
        ]
      };
      const cache = fakeCache({});
      midForm(cache, TWO);
      const { dir, chatbot } = build({ tdcache: cache, message: { text: "Ada" } });

      const stops = await run(dir, { name: "form", action: { action_id: "A-1", form: TWO } });

      assert.strictEqual(seen.messages.length, 1, 'the question was attempted');
      assert.strictEqual(chatbot.params.userFullname, "Ada",
        'the answer already given is still kept');
      assert.deepStrictEqual(stops, [true],
        'a failed send must still park the flow, not replay the form');
    });
  });

  // --------------------------------- integrations whose success is unconnected

  describe('an integration that succeeded with no true branch connected', function () {

    it('DirCustomerio writes the status and lets the chain continue', async () => {
      const cache = fakeCache({ who: "ada" });
      const dir = new DirCustomerio(contextFor({ tdcache: cache, chatbot: fakeChatbot() }));
      dir.logger = recordingLogger();

      const stops = await run(dir, {
        name: "customerio",
        action: {
          formid: "signup",
          bodyParameters: { email: "${who}@test.com" },
          assignStatusTo: "c_status", assignErrorTo: "c_error"
          // no trueIntent: the default a bot author gets
        }
      });

      assert.strictEqual(seen.customerio.length, 1);
      assert.strictEqual(seen.customerio[0].formId, "signup");
      assert.deepStrictEqual(seen.customerio[0].body, { data: { email: "ada@test.com" } },
        "Customer.io's form-submit contract wraps the fields in `data`");
      assert.deepStrictEqual(cache.attrs(), { who: "ada", c_status: 204, c_error: null });
      assert.deepStrictEqual(dispatched, [], 'nothing to jump to');
      assert.deepStrictEqual(stops, [undefined], 'so the next directive runs');
    });

    it('DirHubspot writes the status and the result and lets the chain continue', async () => {
      const cache = fakeCache({ who: "ada" });
      const dir = new DirHubspot(contextFor({ tdcache: cache, chatbot: fakeChatbot() }));
      dir.logger = recordingLogger();

      const stops = await run(dir, {
        name: "hubspot",
        action: {
          bodyParameters: { email: "${who}@test.com" },
          assignStatusTo: "h_status", assignResultTo: "h_result", assignErrorTo: "h_error"
        }
      });

      assert.strictEqual(seen.hubspot.length, 1);
      const attrs = cache.attrs();
      assert.strictEqual(attrs.h_status, 201);
      assert.strictEqual(attrs.h_error, null);
      assert.deepStrictEqual(attrs.h_result, { results: [{ id: "c-1" }] });
      assert.deepStrictEqual(dispatched, []);
      assert.deepStrictEqual(stops, [undefined]);
    });
  });

  // ------------------------------------------------------- DirSendWhatsapp

  describe('DirSendWhatsapp with an unusable receiver', function () {

    it('broadcasts a null receiver rather than throwing when the params are not lists', async () => {
      // header_params/body_params are meant to be arrays. A template edited by
      // hand can leave a string there, and `.forEach` then throws inside
      // fillWholeReceiver. The directive must swallow that and carry on.
      const cache = fakeCache({});
      const dir = new DirSendWhatsapp(contextFor({ tdcache: cache, chatbot: fakeChatbot() }));
      dir.logger = recordingLogger();

      const stops = await run(dir, {
        name: "send_whatsapp",
        action: {
          payload: {
            receiver_list: [{ phone: "39123", header_params: "not-a-list" }],
            template_name: "t1"
          }
        }
      });

      assert.strictEqual(seen.broadcast.length, 1, 'the broadcast still went out');
      assert.strictEqual(seen.broadcast[0].body.receiver_list[0], null,
        'the receiver that could not be filled is sent as null');
      assert.strictEqual(seen.broadcast[0].body.transaction_id, REQUEST_ID);
      assert.strictEqual(seen.broadcast[0].body.broadcast, false);
      assert.deepStrictEqual(stops, [undefined], 'and the chain continues');
    });
  });

  // ---------------------------------------------------------- DirWebRequest

  describe('DirWebRequest over https', function () {

    it('reports an unreachable https host and lets the chain continue', async () => {
      // The `https:` prefix is the only thing that attaches the permissive TLS
      // agent. Pointing it at a closed port proves the agent is built and that
      // the transport failure still releases the directive chain instead of
      // hanging it.
      const cache = fakeCache({});
      const dir = new DirWebRequest(contextFor({ tdcache: cache, chatbot: fakeChatbot() }));
      dir.logger = recordingLogger();

      const stops = await run(dir, {
        name: "webrequest",
        action: { url: DEAD_HTTPS, method: "GET", assignTo: "result" }
      });

      assert.deepStrictEqual(cache.attrs(), {},
        'nothing may be assigned from a request that never happened');
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('fills the url from the flow attributes and assigns the answer', async () => {
      const cache = fakeCache({ formId: "signup" });
      const dir = new DirWebRequest(contextFor({ tdcache: cache, chatbot: fakeChatbot() }));
      dir.logger = recordingLogger();

      const stops = await run(dir, {
        name: "webrequest",
        action: {
          url: `${MOCK}/api/v1/forms/\${formId}/submit`,
          method: "POST",
          headersString: { 'Content-Type': 'application/json' },
          jsonBody: '{"who":"ada"}',
          assignTo: "result"
        }
      });

      assert.strictEqual(seen.customerio.length, 1);
      assert.strictEqual(seen.customerio[0].formId, "signup");
      assert.deepStrictEqual(seen.customerio[0].body, { who: "ada" });
      assert.deepStrictEqual(cache.attrs().result, { ok: true });
      assert.deepStrictEqual(stops, [undefined]);
    });
  });

  // -------------------------------------------------------- DirJSONCondition

  describe('DirJSONCondition with a blank branch name', function () {

    it('treats a whitespace-only false intent as no false branch at all', async () => {
      const cache = fakeCache({ city: "Rome" });
      const dir = new DirJSONCondition(contextFor({ tdcache: cache, chatbot: fakeChatbot() }));
      dir.logger = recordingLogger();

      const stops = await run(dir, {
        name: "jsoncondition",
        action: {
          trueIntent: "MATCHED",
          falseIntent: "   ",
          groups: [{
            type: "expression",
            conditions: [{
              type: "condition",
              operand1: "city",
              operator: TiledeskExpression.OPERATORS.equalAsStrings.name,
              operand2: { type: "const", value: "Paris" }
            }]
          }]
        }
      });

      assert.deepStrictEqual(dispatched, [],
        'a blank false intent is not a block name, so nothing may be dispatched');
      assert.deepStrictEqual(stops, [undefined], 'and the chain carries on');
    });
  });
});
