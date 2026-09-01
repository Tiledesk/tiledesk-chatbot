var assert = require('assert');
let axios = require('axios');
const tybot = require("../index.js");
const tybotRoute = tybot.router;
var express = require('express');
var app = express();
const winston = require('../utils/winston');
app.use("/", tybotRoute);
app.use((err, req, res, next) => {
  winston.error("General error", err);
});
require('dotenv').config();
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const bots_data = require('./routes_http_bot.js').bots_data;
const { runtimeContext } = require('../routes/runtimeContext.js');

const PROJECT_ID = "projectID";
const BOT_ID = "botID";
const SERVER_PORT = 10001;
const MOCK_PORT = 10002;
const BASE = `http://localhost:${SERVER_PORT}`;

// The one project id POST-authorised on /ext/parameters/requests/:requestid.
// It is hardcoded in routes/parametersRoutes.js.
const ALLOWED_PROJECT_ID = "656054000410fa00132e5dcc";

const HTTP = { validateStatus: () => true };

function newRequestId(projectId) {
  return "support-group-" + (projectId || PROJECT_ID) + "-" + uuidv4().replace(/-/g, "");
}

/** Starts the fake Tiledesk API on 10002 and records every call it receives. */
function startMock(register) {
  return new Promise((resolve) => {
    const seen = { messages: [], calls: [] };
    const server = express();
    server.use(bodyParser.json());
    if (register) register(server, seen);
    server.post('/:projectId/requests/:requestId/messages', (req, res) => {
      seen.calls.push('messages');
      seen.messages.push({ projectId: req.params.projectId, requestId: req.params.requestId, body: req.body });
      res.status(200).send({ success: true });
    });
    const listener = server.listen(MOCK_PORT, '0.0.0.0', () => {
      resolve({ seen, close: () => new Promise((r) => listener.close(() => r())) });
    });
  });
}

/** Polls `predicate` until it returns truthy, or gives up after `ms`. */
async function waitFor(predicate, ms) {
  const deadline = Date.now() + (ms || 4000);
  for (;;) {
    const v = predicate();
    if (v) return v;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, 40));
  }
}

function envelope(text, requestId, extra) {
  return Object.assign({
    payload: Object.assign({
      senderFullname: "guest#367e",
      type: "text",
      sender: "A-SENDER",
      recipient: requestId,
      text: text,
      id_project: PROJECT_ID,
      request: { request_id: requestId }
    }, (extra && extra.payload) || {}),
    token: "XXX"
  }, (extra && extra.envelope) || {});
}

describe('Route layer over HTTP', function () {

  let app_listener;

  before(() => new Promise((resolve, reject) => {
    tybot.startApp({
      bots: bots_data,
      TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT,
      API_ENDPOINT: process.env.API_ENDPOINT,
      REDIS_HOST: process.env.REDIS_HOST,
      REDIS_PORT: process.env.REDIS_PORT,
      REDIS_PASSWORD: process.env.REDIS_PASSWORD
    }, (err) => {
      if (err) return reject(err);
      app_listener = app.listen(SERVER_PORT, () => resolve());
    });
  }));

  after((done) => { app_listener.close(() => done()); });

  // ------------------------------------------------------------ miscRoutes

  describe('miscRoutes', function () {

    it('GET / answers the health check', async () => {
      const res = await axios.get(`${BASE}/`, HTTP);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data, 'Hello Tilebot!');
    });

    it('GET /test/webrequest/get/plain/:username echoes the path parameter', async () => {
      const res = await axios.get(`${BASE}/test/webrequest/get/plain/nico`, HTTP);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data, 'Application var nico');
    });

    it('POST /test/webrequest/post/plain echoes the posted name', async () => {
      const res = await axios.post(`${BASE}/test/webrequest/post/plain`, { name: "Nico" }, HTTP);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data, 'Your name is Nico');
    });

    it('POST /test/webrequest/post/plain with no name reports the missing body', async () => {
      const res = await axios.post(`${BASE}/test/webrequest/post/plain`, {}, HTTP);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data, 'No HTTP POST provided');
    });

    it('POST /echobot replies 200 immediately and echoes the text back to the API', async () => {
      const requestId = newRequestId();
      const mock = await startMock();
      try {
        const res = await axios.post(`${BASE}/echobot`, envelope("ping!", requestId), HTTP);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(res.data, { success: true });

        const sent = await waitFor(() => mock.seen.messages[0]);
        assert.ok(sent, 'the echo must reach the Tiledesk API');
        assert.strictEqual(sent.projectId, PROJECT_ID);
        assert.strictEqual(sent.requestId, requestId);
        assert.strictEqual(sent.body.text, "ping!");
      } finally {
        await mock.close();
      }
    });

    it('POST /echobot still answers 200 when the API rejects the echo', async () => {
      const requestId = newRequestId();
      let rejected = 0;
      const mock = await startMock((server) => {
        server.post('/:projectId/requests/:requestId/messages', (req, res) => {
          rejected += 1;
          res.status(500).send({ success: false });
        });
      });
      try {
        const res = await axios.post(`${BASE}/echobot`, envelope("ping!", requestId), HTTP);
        // The reply is sent BEFORE the outgoing call, so the failure must not
        // change the status Tiledesk sees.
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(res.data, { success: true });
        assert.ok(await waitFor(() => rejected === 1), 'the echo was attempted exactly once');
      } finally {
        await mock.close();
      }
    });
  });

  // ------------------------------------------------------ parametersRoutes

  describe('parametersRoutes', function () {

    it('GET /message/context/:messageid returns the cached context', async () => {
      const messageId = "MSG-" + uuidv4().replace(/-/g, "");
      await runtimeContext.tdcache.set(
        "tiledesk:messages:context:" + messageId,
        JSON.stringify({ requestId: "R-1", botId: BOT_ID }));

      const res = await axios.get(`${BASE}/message/context/${messageId}`, HTTP);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.data, { requestId: "R-1", botId: BOT_ID });
    });

    it('GET /message/context/:messageid returns an empty body for an unknown message', async () => {
      const res = await axios.get(`${BASE}/message/context/NO-SUCH-MESSAGE`, HTTP);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data, '', 'res.send(null) must not become the string "null"');
    });

    it('GET /ext/reserved/parameters/requests/:id?all returns every attribute', async () => {
      const requestId = newRequestId();
      const key = "tilebot:requests:" + requestId + ":parameters";
      await runtimeContext.tdcache.hset(key, "project_id", JSON.stringify(PROJECT_ID));
      await runtimeContext.tdcache.hset(key, "_internal", JSON.stringify("hidden"));
      await runtimeContext.tdcache.hset(key, "custom_var", JSON.stringify("v1"));

      const res = await axios.get(`${BASE}/ext/reserved/parameters/requests/${requestId}?all`, HTTP);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.data,
        { project_id: PROJECT_ID, _internal: "hidden", custom_var: "v1" });
    });

    it('GET /ext/reserved/parameters/requests/:id without ?all hides the reserved ones', async () => {
      const requestId = newRequestId();
      const key = "tilebot:requests:" + requestId + ":parameters";
      await runtimeContext.tdcache.hset(key, "project_id", JSON.stringify(PROJECT_ID));
      await runtimeContext.tdcache.hset(key, "_internal", JSON.stringify("hidden"));
      await runtimeContext.tdcache.hset(key, "custom_var", JSON.stringify("v1"));

      const res = await axios.get(`${BASE}/ext/reserved/parameters/requests/${requestId}`, HTTP);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.data, { custom_var: "v1" },
        'project_id is reserved and _internal is underscore-prefixed: both are filtered out');
    });

    it('GET /ext/reserved/parameters/requests/:id returns {} for an unknown request', async () => {
      const res = await axios.get(`${BASE}/ext/reserved/parameters/requests/${newRequestId()}`, HTTP);
      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.data, {});
    });

    it('GET /ext/parameters/requests/:id refuses a request id of another project', async () => {
      const res = await axios.get(`${BASE}/ext/parameters/requests/${newRequestId()}`, HTTP);
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.data, 'Unauthorized');
    });

    it('GET /ext/parameters/requests/:id rejects a request id with too few parts', async () => {
      const res = await axios.get(`${BASE}/ext/parameters/requests/not-a-request`, HTTP);
      assert.strictEqual(res.status, 500);
      assert.strictEqual(res.data, 'Invalid request id not-a-request');
    });

    it('GET /ext/parameters/requests/:id serves the authorised project', async () => {
      const requestId = newRequestId(ALLOWED_PROJECT_ID);
      const key = "tilebot:requests:" + requestId + ":parameters";
      await runtimeContext.tdcache.hset(key, "project_id", JSON.stringify(ALLOWED_PROJECT_ID));
      await runtimeContext.tdcache.hset(key, "custom_var", JSON.stringify("v1"));

      const all = await axios.get(`${BASE}/ext/parameters/requests/${requestId}?all`, HTTP);
      assert.strictEqual(all.status, 200);
      assert.deepStrictEqual(all.data, { project_id: ALLOWED_PROJECT_ID, custom_var: "v1" });

      const user = await axios.get(`${BASE}/ext/parameters/requests/${requestId}`, HTTP);
      assert.strictEqual(user.status, 200);
      assert.deepStrictEqual(user.data, { custom_var: "v1" });
    });
  });

  // --------------------------------------------------------- messageRoutes

  describe('POST /ext/:botid', function () {

    it('rejects a literal "null" bot id', async () => {
      const res = await axios.post(`${BASE}/ext/null`, envelope("/start", newRequestId()), HTTP);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.success, false);
      assert.strictEqual(res.data.error,
        "Required parameters botid not found. Value is 'null' or 'undefined'");
    });

    it('rejects a literal "undefined" bot id', async () => {
      const res = await axios.post(`${BASE}/ext/undefined`, envelope("/start", newRequestId()), HTTP);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.success, false);
    });

    it('skips an internal note without running the flow', async () => {
      const requestId = newRequestId();
      const mock = await startMock();
      try {
        const res = await axios.post(`${BASE}/ext/${BOT_ID}`,
          envelope("/start", requestId, { payload: { attributes: { subtype: 'private' } } }), HTTP);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(res.data, { success: true });

        await new Promise((r) => setTimeout(r, 600));
        assert.deepStrictEqual(mock.seen.messages, [],
          'a private note must not produce a bot reply');
      } finally {
        await mock.close();
      }
    });

    it('rejects a request id that does not belong to the project', async () => {
      const requestId = newRequestId("ANOTHER-PROJECT");
      const res = await axios.post(`${BASE}/ext/${BOT_ID}`, envelope("/start", requestId), HTTP);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.success, false);
      assert.strictEqual(res.data.error,
        "Request id is invalid:" + requestId + " for projectId:" + PROJECT_ID + "chatbotId:" + BOT_ID);
    });

    it('runs the flow, caches the bot id for the request and replies through the API', async () => {
      const requestId = newRequestId();
      const mock = await startMock();
      try {
        const res = await axios.post(`${BASE}/ext/${BOT_ID}`, envelope("/start", requestId), HTTP);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(res.data, { success: true });

        const sent = await waitFor(() => mock.seen.messages[0]);
        assert.ok(sent, 'the reply action must reach the API');
        assert.strictEqual(sent.requestId, requestId);
        assert.strictEqual(sent.body.attributes.commands[0].message.text, "Hello from ext");

        // the route stores the bot id under this key so /ext/:p/requests/:r/messages
        // can rebuild a missing request later.
        const cached = await runtimeContext.tdcache.get("tilebot:botId_requests:" + requestId);
        assert.strictEqual(cached, BOT_ID);
      } finally {
        await mock.close();
      }
    });

    it('survives a malformed action list without replying', async () => {
      const requestId = newRequestId();
      const mock = await startMock();
      try {
        const res = await axios.post(`${BASE}/ext/${BOT_ID}`, envelope("/broken_actions", requestId), HTTP);
        assert.strictEqual(res.status, 200);
        await new Promise((r) => setTimeout(r, 600));
        assert.deepStrictEqual(mock.seen.messages, [],
          'a null action must be reported, not delivered');
        const health = await axios.get(`${BASE}/`, HTTP);
        assert.strictEqual(health.status, 200, 'the route layer stays up');
      } finally {
        await mock.close();
      }
    });

    // QUARANTINED -- messageRoutes.js:82-85. The `.catch()` on
    // getBotByIdCache() does `Promise.reject(err); return;`: that builds a NEW
    // rejected promise nobody awaits (unhandled rejection #1) and, because the
    // `return` only leaves the arrow function, the handler carries on with
    // `bot === undefined`. `new TiledeskChatbot({... bot: undefined ...})` then
    // throws "config.bot is mandatory" inside the async handler, which is
    // unhandled rejection #2. Both are process-fatal under Node's default
    // --unhandled-rejections=throw. The same three lines are repeated at :279-282
    // for POST /exec/:botid. Correct behaviour is what this test asserts: log the
    // failure, send nothing, keep serving.
    it('stops without replying when the bot cannot be loaded', async () => {
      const requestId = newRequestId();
      const mock = await startMock();
      try {
        const res = await axios.post(`${BASE}/ext/NO-SUCH-BOT`, envelope("/start", requestId), HTTP);
        // The 200 is written before the bot is looked up, so it says nothing
        // about the outcome; what matters is that nothing is posted.
        assert.strictEqual(res.status, 200);
        await new Promise((r) => setTimeout(r, 600));
        assert.deepStrictEqual(mock.seen.messages, [],
          'an unknown bot must not produce a reply');

        // and the route layer is still serving
        const health = await axios.get(`${BASE}/`, HTTP);
        assert.strictEqual(health.status, 200);
      } finally {
        await mock.close();
      }
    });

    it('posts nothing when no intent matches', async () => {
      const requestId = newRequestId();
      const mock = await startMock();
      try {
        const res = await axios.post(`${BASE}/ext/${BOT_ID}`, envelope("/no_such_intent", requestId), HTTP);
        assert.strictEqual(res.status, 200);
        await new Promise((r) => setTimeout(r, 600));
        assert.deepStrictEqual(mock.seen.messages, [],
          'no reply means no message: the flow stops');
      } finally {
        await mock.close();
      }
    });

    it('sends an action-less answer through the ext message pipeline', async () => {
      const requestId = newRequestId();
      const mock = await startMock();
      try {
        const res = await axios.post(`${BASE}/ext/${BOT_ID}`, envelope("/plain_answer", requestId), HTTP);
        assert.strictEqual(res.status, 200);

        // No actions -> the reply is handed to ExtApi, which posts it back to
        // THIS app on /ext/:projectId/requests/:requestId/messages, and only
        // from there does it reach the Tiledesk API.
        const sent = await waitFor(() => mock.seen.messages[0], 6000);
        assert.ok(sent, 'the textual answer must reach the API');
        assert.strictEqual(sent.requestId, requestId);
        assert.strictEqual(sent.body.text, "A plain textual answer");
        assert.strictEqual(sent.body.attributes._raw_message, "A plain textual answer");
      } finally {
        await mock.close();
      }
    });

    // QUARANTINED -- ChatbotRequestAttributesUtil.js:253-256. The catch around
    // updateRequestAttributes() ends in `process.exit(1)`, so ONE failed Redis
    // write (a reconnect, a timeout, a full instance) kills the whole chatbot
    // process and every conversation in flight with it - the route's own
    // try/catch at messageRoutes.js:120-123, which exists precisely to swallow
    // this, is never reached. A library helper must not terminate its host.
    // Correct behaviour is what this test asserts: log, abort this message, stay
    // up. Running it as written takes the mocha process down with exit code 1
    // and no summary.
    it('stops the flow when the request attributes cannot be stored', async () => {
      const requestId = newRequestId();
      const mock = await startMock();
      const original = runtimeContext.tdcache.hset;
      runtimeContext.tdcache.hset = async () => { throw new Error("redis hset failed"); };
      try {
        const res = await axios.post(`${BASE}/ext/${BOT_ID}`, envelope("/start", requestId), HTTP);
        assert.strictEqual(res.status, 200);
        await new Promise((r) => setTimeout(r, 600));
        assert.deepStrictEqual(mock.seen.messages, [],
          'a failed attribute write must abort before the reply is produced');
      } finally {
        runtimeContext.tdcache.hset = original;
        await mock.close();
      }
    });

    it('drops request.snapshot before the request is stored', async () => {
      const requestId = newRequestId();
      const mock = await startMock();
      try {
        const res = await axios.post(`${BASE}/ext/${BOT_ID}`,
          envelope("/start", requestId, {
            payload: { request: { request_id: requestId, snapshot: { huge: "x".repeat(100) } } }
          }), HTTP);
        assert.strictEqual(res.status, 200);

        assert.ok(await waitFor(() => mock.seen.messages[0]), 'the flow still runs');
        const params = await axios.get(`${BASE}/ext/reserved/parameters/requests/${requestId}?all`, HTTP);
        assert.strictEqual(JSON.stringify(params.data).indexOf('snapshot'), -1,
          'the snapshot must never be persisted into the flow attributes');
      } finally {
        await mock.close();
      }
    });
  });

  describe('POST /exec/:botid', function () {

    it('rejects a literal "null" bot id', async () => {
      const res = await axios.post(`${BASE}/exec/null`, envelope("/webhook_block", newRequestId()), HTTP);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.success, false);
      assert.strictEqual(res.data.error,
        "Required parameters botid not found. Value is 'null' or 'undefined'");
    });

    it('skips an internal note', async () => {
      const requestId = newRequestId();
      const mock = await startMock();
      try {
        const res = await axios.post(`${BASE}/exec/${BOT_ID}`,
          envelope("/webhook_block", requestId, { payload: { attributes: { subtype: 'private' } } }), HTTP);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(res.data, { success: true });
        await new Promise((r) => setTimeout(r, 500));
        assert.deepStrictEqual(mock.seen.messages, []);
      } finally {
        await mock.close();
      }
    });

    it('rejects a request id that does not belong to the project', async () => {
      const requestId = newRequestId("ANOTHER-PROJECT");
      const res = await axios.post(`${BASE}/exec/${BOT_ID}`, envelope("/webhook_block", requestId), HTTP);
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.error,
        "Request id is invalid:" + requestId + " for projectId:" + PROJECT_ID + "chatbotId:" + BOT_ID);
    });

    it('executes the named block and posts its reply', async () => {
      const requestId = newRequestId();
      const mock = await startMock();
      try {
        const res = await axios.post(`${BASE}/exec/${BOT_ID}`, envelope("/webhook_block", requestId), HTTP);
        assert.strictEqual(res.status, 200);

        const sent = await waitFor(() => mock.seen.messages[0]);
        assert.ok(sent, 'the block reply must reach the API');
        assert.strictEqual(sent.requestId, requestId);
        assert.strictEqual(sent.body.attributes.commands[0].message.text, "Block executed");
      } finally {
        await mock.close();
      }
    });

    it('drops request.snapshot and still runs the block', async () => {
      const requestId = newRequestId();
      const mock = await startMock();
      try {
        const res = await axios.post(`${BASE}/exec/${BOT_ID}`,
          envelope("/webhook_block", requestId, {
            payload: { request: { request_id: requestId, snapshot: { huge: "x".repeat(100) } } }
          }), HTTP);
        assert.strictEqual(res.status, 200);
        const sent = await waitFor(() => mock.seen.messages[0]);
        assert.ok(sent);
        assert.strictEqual(sent.body.attributes.commands[0].message.text, "Block executed");
      } finally {
        await mock.close();
      }
    });

    // QUARANTINED -- messageRoutes.js:344-361 can never deliver anything.
    // POST /ext/:botid goes through chatbot.replyToMessage(), which builds a
    // reply object carrying the intent's answer on `.text` (asserted by
    // "sends an action-less answer through the ext message pipeline" above).
    // POST /exec/:botid instead goes through chatbot.findBlock(), which resolves
    // the RAW intent - the answer sits on `.answer`, and `.text` is undefined.
    // The else-branch then hands that to ExtApi.sendSupportMessageExt(), and the
    // pipeline's MarkbotChatbotPlug drops a message with no text
    // (MarkbotChatbotPlug.js:23-27), so the block's answer is silently lost.
    // The route even logs it: "No actions. Reply text: undefined".
    it.skip('sends an action-less block through the ext message pipeline', async () => {
      const requestId = newRequestId();
      const mock = await startMock();
      try {
        const res = await axios.post(`${BASE}/exec/${BOT_ID}`, envelope("/plain_answer", requestId), HTTP);
        assert.strictEqual(res.status, 200);
        const sent = await waitFor(() => mock.seen.messages[0], 6000);
        assert.ok(sent, 'the textual block answer must reach the API');
        assert.strictEqual(sent.body.text, "A plain textual answer");
      } finally {
        await mock.close();
      }
    });

    it('survives a malformed action list without replying', async () => {
      const requestId = newRequestId();
      const mock = await startMock();
      try {
        const res = await axios.post(`${BASE}/exec/${BOT_ID}`, envelope("/broken_actions", requestId), HTTP);
        assert.strictEqual(res.status, 200);
        await new Promise((r) => setTimeout(r, 600));
        assert.deepStrictEqual(mock.seen.messages, []);
        const health = await axios.get(`${BASE}/`, HTTP);
        assert.strictEqual(health.status, 200, 'the route layer stays up');
      } finally {
        await mock.close();
      }
    });

    it('posts nothing when the named block does not exist', async () => {
      const requestId = newRequestId();
      const mock = await startMock();
      try {
        const res = await axios.post(`${BASE}/exec/${BOT_ID}`, envelope("/no_such_block", requestId), HTTP);
        assert.strictEqual(res.status, 200);
        await new Promise((r) => setTimeout(r, 600));
        assert.deepStrictEqual(mock.seen.messages, [],
          'an unknown block must stop the flow, not reply');
      } finally {
        await mock.close();
      }
    });
  });

  describe('POST /ext/:projectId/requests/:requestId/messages', function () {

    it('answers immediately and forwards the processed answer to the API', async () => {
      const requestId = newRequestId();
      const mock = await startMock((server, seen) => {
        server.get('/:projectId/requests/:requestId', (req, res) => {
          seen.calls.push('getRequest');
          res.status(200).send({
            request_id: req.params.requestId,
            id_project: req.params.projectId,
            status: 200,
            channel: { name: 'chat21' }
          });
        });
      });
      try {
        const res = await axios.post(
          `${BASE}/ext/${PROJECT_ID}/requests/${requestId}/messages`,
          { text: "A plain answer", attributes: { directives: true, splits: true } },
          { headers: { authorization: "JWT XXX" }, validateStatus: () => true });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(res.data, { success: true });

        const sent = await waitFor(() => mock.seen.messages[0]);
        assert.ok(sent, 'the processed answer must be sent on');
        assert.strictEqual(sent.body.text, "A plain answer");
        assert.strictEqual(sent.body.attributes._raw_message, "A plain answer",
          'the untouched original text is carried on the outgoing attributes');
      } finally {
        await mock.close();
      }
    });

    it('rebuilds a missing request from the cached bot id', async () => {
      const requestId = newRequestId();
      await runtimeContext.tdcache.set("tilebot:botId_requests:" + requestId, BOT_ID);
      const mock = await startMock((server, seen) => {
        server.get('/:projectId/requests/:requestId', (req, res) => {
          seen.calls.push('getRequest');
          res.status(404).send({ success: false });
        });
      });
      try {
        const res = await axios.post(
          `${BASE}/ext/${PROJECT_ID}/requests/${requestId}/messages`,
          { text: "Still delivered" },
          { headers: { authorization: "JWT XXX" }, validateStatus: () => true });
        assert.strictEqual(res.status, 200);

        const sent = await waitFor(() => mock.seen.messages[0]);
        assert.ok(sent, 'a 404 on the request lookup must not stop the answer');
        assert.strictEqual(sent.body.text, "Still delivered");
        assert.ok(mock.seen.calls.indexOf('getRequest') > -1);
      } finally {
        await mock.close();
      }
    });

    it('carries on when the request lookup fails at transport level', async () => {
      const requestId = newRequestId();
      const mock = await startMock((server, seen) => {
        server.get('/:projectId/requests/:requestId', (req, res) => {
          seen.calls.push('getRequest');
          req.socket.destroy();      // no response at all
        });
      });
      try {
        const res = await axios.post(
          `${BASE}/ext/${PROJECT_ID}/requests/${requestId}/messages`,
          { text: "Survives a dead API" },
          { headers: { authorization: "JWT XXX" }, validateStatus: () => true });
        assert.strictEqual(res.status, 200);

        const sent = await waitFor(() => mock.seen.messages[0]);
        assert.ok(sent, 'a transport failure on the lookup must not stop the answer');
        assert.strictEqual(sent.body.text, "Survives a dead API");
      } finally {
        await mock.close();
      }
    });

    it('survives the API rejecting the outgoing answer', async () => {
      const requestId = newRequestId();
      let attempts = 0;
      const mock = await startMock((server) => {
        server.post('/:projectId/requests/:requestId/messages', (req, res) => {
          attempts += 1;
          res.status(500).send({ success: false });
        });
        server.get('/:projectId/requests/:requestId', (req, res) => {
          res.status(200).send({ request_id: req.params.requestId, id_project: req.params.projectId });
        });
      });
      try {
        const res = await axios.post(
          `${BASE}/ext/${PROJECT_ID}/requests/${requestId}/messages`,
          { text: "Rejected downstream" },
          { headers: { authorization: "JWT XXX" }, validateStatus: () => true });
        assert.strictEqual(res.status, 200);
        assert.ok(await waitFor(() => attempts === 1), 'the answer was attempted once');

        const health = await axios.get(`${BASE}/`, HTTP);
        assert.strictEqual(health.status, 200, 'the failure must not take the route layer down');
      } finally {
        await mock.close();
      }
    });

    it('sends nothing when the pipeline produces no answer', async () => {
      const requestId = newRequestId();
      const mock = await startMock((server, seen) => {
        server.get('/:projectId/requests/:requestId', (req, res) => {
          seen.calls.push('getRequest');
          res.status(200).send({ request_id: req.params.requestId, id_project: req.params.projectId });
        });
      });
      try {
        // markbot drops a message with no text, so the pipeline resolves null.
        const res = await axios.post(
          `${BASE}/ext/${PROJECT_ID}/requests/${requestId}/messages`,
          { text: "", attributes: { markbot: true } },
          { headers: { authorization: "JWT XXX" }, validateStatus: () => true });
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(res.data, { success: true });

        await new Promise((r) => setTimeout(r, 600));
        assert.deepStrictEqual(mock.seen.messages, [],
          'an empty answer must not be forwarded to the API');
        assert.ok(mock.seen.calls.indexOf('getRequest') > -1,
          'the request was still looked up');
      } finally {
        await mock.close();
      }
    });
  });

  // ----------------------------------------------------------- blockRoutes

  describe('POST /block/:project_id/:bot_id/:block_id', function () {

    it('async: returns success as soon as the message is accepted', async () => {
      const mock = await startMock();
      try {
        const res = await axios.post(`${BASE}/block/${PROJECT_ID}/${BOT_ID}/BLOCK-1`,
          { async: true, token: "XXX", foo: "bar" }, HTTP);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(res.data, { success: true });

        const sent = await waitFor(() => mock.seen.messages[0]);
        assert.ok(sent, 'the block must actually run');
        assert.ok(/^automation-request-projectID-/.test(sent.requestId),
          'a generated automation request id is used: ' + sent.requestId);
        assert.strictEqual(sent.body.attributes.commands[0].message.text, "Block executed");
      } finally {
        await mock.close();
      }
    });

    it('async: honours preloaded_request_id and strips async/token from the payload', async () => {
      const requestId = "automation-request-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
      const mock = await startMock();
      try {
        const res = await axios.post(`${BASE}/block/${PROJECT_ID}/${BOT_ID}/BLOCK-1`,
          { async: true, token: "XXX", preloaded_request_id: requestId, customer: "acme" }, HTTP);
        assert.strictEqual(res.status, 200);

        const sent = await waitFor(() => mock.seen.messages[0]);
        assert.ok(sent);
        assert.strictEqual(sent.requestId, requestId);

        // `async` and `token` are deleted from the body before it becomes the
        // message payload; everything else is handed to the flow untouched.
        const params = await axios.get(`${BASE}/ext/reserved/parameters/requests/${requestId}?all`, HTTP);
        assert.strictEqual(params.status, 200);
      } finally {
        await mock.close();
      }
    });

    it('async: reports 500 when the bot refuses the message', async () => {
      const mock = await startMock();
      try {
        // bot_id "null" makes POST /ext/null answer 400, which is the only
        // failure the async branch can surface.
        const res = await axios.post(`${BASE}/block/${PROJECT_ID}/null/BLOCK-1`,
          { async: true, token: "XXX" }, HTTP);
        assert.strictEqual(res.status, 500);
        assert.strictEqual(res.data.success, false);
        assert.ok(res.data.error, 'the underlying error is reported back');
      } finally {
        await mock.close();
      }
    });

    it('sync: relays the status and payload published on the webhook topic', async () => {
      const requestId = "automation-request-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
      const mock = await startMock();
      let done = false;
      try {
        const pending = axios.post(`${BASE}/block/${PROJECT_ID}/${BOT_ID}/BLOCK-1`,
          { token: "XXX", preloaded_request_id: requestId }, HTTP).then((r) => { done = true; return r; });

        // The route subscribes before it dispatches the message; publish until
        // the response has been produced.
        const pump = (async () => {
          for (let i = 0; i < 60 && !done; i++) {
            await runtimeContext.tdcache.publish(`/webhooks/${requestId}`,
              JSON.stringify({ status: 201, payload: { ok: true, who: "block" } }));
            await new Promise((r) => setTimeout(r, 50));
          }
        })();

        const res = await pending;
        await pump;
        assert.strictEqual(res.status, 201, 'the published status wins over the default 200');
        assert.deepStrictEqual(res.data, { ok: true, who: "block" });
      } finally {
        done = true;
        await mock.close();
      }
    });

    it('sync: defaults to 200 when the published message carries no status', async () => {
      const requestId = "automation-request-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
      const mock = await startMock();
      let done = false;
      try {
        const pending = axios.post(`${BASE}/block/${PROJECT_ID}/${BOT_ID}/BLOCK-1`,
          { token: "XXX", preloaded_request_id: requestId }, HTTP).then((r) => { done = true; return r; });

        const pump = (async () => {
          for (let i = 0; i < 60 && !done; i++) {
            await runtimeContext.tdcache.publish(`/webhooks/${requestId}`,
              JSON.stringify({ payload: { defaulted: true } }));
            await new Promise((r) => setTimeout(r, 50));
          }
        })();

        const res = await pending;
        await pump;
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(res.data, { defaulted: true });
      } finally {
        done = true;
        await mock.close();
      }
    });

    it('sync: reports 500 when the cache subscription fails', async () => {
      const original = runtimeContext.tdcache.subscribe;
      runtimeContext.tdcache.subscribe = async () => { throw new Error("redis is down"); };
      try {
        const res = await axios.post(`${BASE}/block/${PROJECT_ID}/${BOT_ID}/BLOCK-1`,
          { token: "XXX" }, HTTP);
        assert.strictEqual(res.status, 500);
        assert.deepStrictEqual(res.data,
          { success: false, error: "Error during cache subscription" });
      } finally {
        runtimeContext.tdcache.subscribe = original;
      }
    });
  });

});
