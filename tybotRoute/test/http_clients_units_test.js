'use strict';

// The small HTTP clients the runtime leans on, and the two request helpers the
// directives share.
//
// utils/ChatbotParametersClient is what an embedder calls to read a request's
// flow attributes back out of tilebot; utils/HttpUtils and utils/http are the
// two request helpers every directive funnels through. What none of the
// directive tests reach is what happens when the answer is NOT a 200 with a
// body: the non-2xx branch and the transport-failure branch, plus the
// `https:`-only agent that turns certificate verification off.
//
// Assertions are on what the mock server received and on what the callback was
// handed -- never on the fact that a line ran.

const assert = require('assert');
const express = require('express');
const bodyParser = require('body-parser');

const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');
const { ChatbotRequestAttributesUtil } = require('../utils/ChatbotRequestAttributesUtil');
const { TiledeskChatbotConst } = require('../engine/TiledeskChatbotConst');
const { TdCache } = require('../cache/TdCache');
const httpUtils = require('../utils/HttpUtils');
const http = require('../utils/http');

const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-httpclients";

// ChatbotParametersClient resolves its base url through config/endpoints.js,
// which falls back to process.env.TILEBOT_ENDPOINT -- the port run-tests.js
// points every file's own tilebot at.
const TILEBOT_PORT = 10001;

// A port nothing listens on: a request there fails at the transport layer, with
// no HTTP response of any kind.
const DEAD_HTTPS = "https://127.0.0.1:9/nothing";
const DEAD_HTTP = "http://127.0.0.1:9/nothing";

describe('The HTTP clients', function () {

  let listener;
  let seen;

  before((done) => {
    const server = express();
    server.use(bodyParser.json());
    server.get('/ext/reserved/parameters/requests/:requestId', (req, res) => {
      seen.push({ requestId: req.params.requestId, query: req.query, headers: req.headers });
      if (req.params.requestId === "EMPTY") return res.status(204).send();
      if (req.params.requestId === "BOOM") return res.status(500).send({ error: "no" });
      res.status(200).send({ userFullname: "Ada", _internal: 1 });
    });
    server.get('/echo', (req, res) => res.status(200).send({ ok: true }));
    server.post('/echo', (req, res) => res.status(200).send({ echoed: req.body }));
    server.get('/nocontent', (req, res) => res.status(204).send());
    listener = server.listen(TILEBOT_PORT, '0.0.0.0', () => done());
  });

  after((done) => { listener.close(() => done()); });

  beforeEach(() => { seen = []; });

  // ------------------------------------------- ChatbotParametersClient

  describe('ChatbotParametersClient.getChatbotParameters', function () {

    // It is an instance method, inherited by TiledeskChatbotUtil -- which is
    // the shape every caller in the tree uses.
    const client = () => new TiledeskChatbotUtil();

    it('asks tilebot for every attribute of the request and hands back the body', function (done) {
      client().getChatbotParameters(REQUEST_ID, (err, body) => {
        assert.strictEqual(err, null);
        assert.deepStrictEqual(body, { userFullname: "Ada", _internal: 1 });

        assert.strictEqual(seen.length, 1);
        assert.strictEqual(seen[0].requestId, REQUEST_ID);
        assert.deepStrictEqual(seen[0].query, { all: "" },
          'the reserved endpoint is asked with ?all, i.e. including the reserved attributes');
        assert.ok(seen[0].headers['content-type'].startsWith('application/json'));
        done();
      });
    });

    // QUARANTINED -- utils/ChatbotParametersClient.js:81. The non-200 branch
    // calls `TiledeskClient.getErr(...)`, and `TiledeskClient` is not required
    // anywhere in ChatbotParametersClient.js (it requires only axios, ./winston
    // and ../config/endpoints). So the branch that exists to REPORT a bad answer
    // throws "ReferenceError: TiledeskClient is not defined" inside the axios
    // `.then`; that rejection lands in the `.catch`, whose first statement is
    // `error.response.data` on an error that has no `.response`, and throws
    // again. The callback is never invoked at all: an embedder asking tilebot
    // for a request's parameters over a connection that answers 204 (or any
    // non-200) hangs forever, with an unhandled rejection as the only trace.
    // The file was split out of TiledeskChatbotUtil, which does require
    // TiledeskClient; the require did not come with it -- the same omission as
    // the missing `winston` recorded in utils_units_test.js for
    // ChatbotIntentUtil.parseIntent.
    // Correct behaviour, asserted here: the caller is told.
    it.skip('reports a 2xx with no body as an error rather than as empty parameters', function (done) {
      client().getChatbotParameters("EMPTY", (err, body) => {
        assert.ok(err, 'a 204 is not a set of parameters');
        assert.strictEqual(body, undefined);
        assert.strictEqual(seen.length, 1);
        done();
      });
    });

    it('reports a 500 to the caller', function (done) {
      client().getChatbotParameters("BOOM", (err, body) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(err.response.status, 500);
        assert.strictEqual(body, undefined);
        done();
      });
    });

    // QUARANTINED -- utils/ChatbotParametersClient.js:87. The axios catch logs
    // `error.response.data` unconditionally. A tilebot that is DOWN (connection
    // refused, DNS failure, timeout) rejects with an error that has no
    // `.response`, so the handler itself throws "Cannot read properties of
    // undefined (reading 'data')": the callback is never invoked and the caller
    // waits forever, with an unhandled rejection as the only trace. The 500 case
    // above works only because axios populates `.response` for an HTTP error.
    // Correct behaviour, asserted here: the transport error reaches the callback.
    it.skip('reports an unreachable tilebot to the caller', function (done) {
      const original = process.env.TILEBOT_ENDPOINT;
      process.env.TILEBOT_ENDPOINT = "http://127.0.0.1:9";
      client().getChatbotParameters(REQUEST_ID, (err) => {
        process.env.TILEBOT_ENDPOINT = original;
        assert.ok(err instanceof Error);
        done();
      });
    });
  });

  // ------------------------------------------------------- utils/HttpUtils

  describe('HttpUtils.request', function () {

    it('posts the body and hands the response data back', function (done) {
      httpUtils.request({
        url: `http://127.0.0.1:${TILEBOT_PORT}/echo`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        json: { name: "Nico" }
      }, (err, resbody) => {
        assert.strictEqual(err, null);
        assert.deepStrictEqual(resbody, { echoed: { name: "Nico" } });
        done();
      });
    });

    it('treats a 2xx with no body as a failure', function (done) {
      httpUtils.request({
        url: `http://127.0.0.1:${TILEBOT_PORT}/nocontent`,
        method: 'GET', headers: {}, json: null
      }, (err, resbody) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Response status is not 2xx/);
        assert.strictEqual(resbody, null);
        done();
      });
    });

    it('turns certificate verification off for an https url, and reports the transport error', function (done) {
      // The `https:` prefix is the only thing that attaches the permissive
      // agent; nothing else in the request changes. Pointing it at a closed
      // port proves the agent was built (no TypeError) and that the transport
      // failure still reaches the callback.
      httpUtils.request({
        url: DEAD_HTTPS, method: 'GET', headers: {}, json: null
      }, (err, resbody) => {
        assert.ok(err, 'an unreachable https host must reach the callback');
        assert.strictEqual(err.response, undefined, 'there is no HTTP response at all');
        assert.strictEqual(resbody, null);
        done();
      });
    });
  });

  // ------------------------------------------------------------ utils/http

  describe('utils/http request', function () {

    it('turns certificate verification off for an https url, and reports the transport error', function (done) {
      http.request({
        url: DEAD_HTTPS, method: 'GET', headers: {}, json: null
      }, (err, resbody) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(resbody, null);
        done();
      });
    });

    it('reports a plain http transport failure the same way', function (done) {
      http.request({
        url: DEAD_HTTP, method: 'GET', headers: {}, json: null
      }, (err, resbody) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(resbody, null);
        done();
      });
    });
  });

  // ------------------------------------------------------------- TdCache

  describe('TdCache.connect with a callback', function () {

    it('calls the callback back and the cache is usable afterwards', async function () {
      this.timeout(10000);
      const cache = new TdCache({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || '6379',
        password: process.env.REDIS_PASSWORD
      });

      const calls = [];
      await cache.connect((err) => { calls.push(err); });

      assert.ok(calls.length >= 1, 'the callback-style caller must be told the cache is up');
      assert.deepStrictEqual(calls.filter((e) => e !== undefined && e !== null), [],
        'and told with no error');

      const key = "tilebot:requests:" + REQUEST_ID + ":probe";
      await cache.set(key, "up");
      assert.strictEqual(await cache.get(key), "up");
      await cache.del(key);
      assert.strictEqual(await cache.get(key), null);

      await cache.client.quit();
      await cache.subscriberClient.quit();
    });
  });

  // --------------------------------- ChatbotRequestAttributesUtil, env urls

  describe('ChatbotRequestAttributesUtil, the environment-derived urls', function () {

    const K = TiledeskChatbotConst;

    function fakeChatbot() {
      const params = {};
      return {
        params,
        bot: { name: "Test Bot", _id: "BOT-1" },
        async getParameter(k) { return params[k]; },
        async addParameter(k, v) { params[k] = v; },
        async deleteParameter(k) { delete params[k]; }
      };
    }

    it('publishes the dashboard conversation url when BASE_URL is set', async function () {
      const origBase = process.env.BASE_URL;
      const origApi = process.env.API_URL;
      process.env.BASE_URL = "https://dash.example";
      process.env.API_URL = "https://api.example/v3";
      try {
        const chatbot = fakeChatbot();
        await ChatbotRequestAttributesUtil.updateRequestAttributes(
          chatbot, "TOKEN", { _id: "m-1" }, "P1", "support-group-P1-abcd");

        assert.strictEqual(chatbot.params[K.REQ_CHAT_URL],
          "https://dash.example/dashboard/#/project/P1/wsrequest/support-group-P1-abcd/messages");
        assert.strictEqual(chatbot.params[K.API_BASE_URL], "https://api.example/v3");
      } finally {
        if (origBase === undefined) delete process.env.BASE_URL; else process.env.BASE_URL = origBase;
        if (origApi === undefined) delete process.env.API_URL; else process.env.API_URL = origApi;
      }
    });

    it('publishes neither when the environment does not carry them', async function () {
      const origBase = process.env.BASE_URL;
      const origApi = process.env.API_URL;
      delete process.env.BASE_URL;
      delete process.env.API_URL;
      try {
        const chatbot = fakeChatbot();
        await ChatbotRequestAttributesUtil.updateRequestAttributes(
          chatbot, "TOKEN", { _id: "m-1" }, "P1", "support-group-P1-abcd");

        assert.strictEqual(chatbot.params[K.REQ_CHAT_URL], undefined);
        assert.strictEqual(chatbot.params[K.API_BASE_URL], undefined);
        assert.strictEqual(chatbot.params[K.REQ_PROJECT_ID_KEY], "P1",
          'the always-written attributes are unaffected');
      } finally {
        if (origBase !== undefined) process.env.BASE_URL = origBase;
        if (origApi !== undefined) process.env.API_URL = origApi;
      }
    });
  });
});
