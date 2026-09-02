'use strict';

// What the route layer does with a body it did not expect.
//
// Every conversation route is an `async (req, res)` handler, and express 4
// does not await one: a handler that throws leaves a REJECTED PROMISE NOBODY
// HOLDS. That has two consequences, and both were real here --
//
//   * the caller is never answered. Nothing calls res.send, and express's
//     error middleware never sees it (it only handles what is thrown
//     synchronously or passed to next), so the socket hangs until it times
//     out;
//   * the worker dies. Node's default is --unhandled-rejections=throw.
//
// So `POST /ext/:botid` with a body of `{}` -- a probe, a misconfigured
// caller, a partially written retry -- took the whole process down. These
// tests assert the answer AND that no unhandled rejection was raised.
//
// They live in their own file rather than in routes_http_test.js because that
// file drives the happy paths; this one deliberately posts rubbish.

const assert = require('assert');
const axios = require('axios').default;
const express = require('express');
const tybot = require("../index.js");
const winston = require('../utils/winston');
const bots_data = require('./routes_http_bot.js').bots_data;
const { guardHandler } = require('../routes/asyncErrorBoundary.js');

const app = express();
app.use("/", tybot.router);

const PROJECT_ID = "projectID";
const BOT_ID = "botID";
const SERVER_PORT = 10001;
const BASE = `http://localhost:${SERVER_PORT}`;

// Never throw on a status: the status IS the assertion. The timeout keeps a
// regression (a handler that answers nothing) from stalling the whole file.
const HTTP = { validateStatus: () => true, timeout: 5000 };

/** Runs `fn` with an unhandledRejection collector installed. */
async function collectingRejections(fn) {
  const seen = [];
  const onRejection = (reason) => seen.push(reason);
  process.on('unhandledRejection', onRejection);
  try {
    const value = await fn();
    // The event is emitted a turn after the microtask queue drains.
    await new Promise((r) => setTimeout(r, 200));
    return { value, seen };
  }
  finally {
    process.removeListener('unhandledRejection', onRejection);
  }
}

describe('Route layer, bodies it did not expect', function () {

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

  // ------------------------------------------------------ the message routes

  for (const path of [`/ext/${BOT_ID}`, `/exec/${BOT_ID}`]) {

    describe(`POST ${path}`, function () {

      it('answers 400 for a body with no payload, and raises no unhandled rejection', async () => {
        const { value: res, seen } = await collectingRejections(
          () => axios.post(BASE + path, {}, HTTP));

        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.data.success, false);
        assert.ok(/payload/.test(res.data.error), res.data.error);
        assert.deepStrictEqual(seen.map((e) => e && e.message), []);
      });

      it('answers 400 for a payload with no request, and raises no unhandled rejection', async () => {
        const { value: res, seen } = await collectingRejections(
          () => axios.post(BASE + path, { payload: { text: "hi" } }, HTTP));

        assert.strictEqual(res.status, 400);
        assert.ok(/payload.request/.test(res.data.error), res.data.error);
        assert.deepStrictEqual(seen.map((e) => e && e.message), []);
      });

      it('answers 400 when payload.request carries no request_id', async () => {
        // request_id is undefined here: validateRequestId used to be reached
        // with it, and its `requestId.startsWith` threw.
        const { value: res, seen } = await collectingRejections(
          () => axios.post(BASE + path, { payload: { request: {}, id_project: PROJECT_ID } }, HTTP));

        assert.strictEqual(res.status, 400);
        assert.deepStrictEqual(seen.map((e) => e && e.message), []);
      });

      it('a payload that is not an object is refused too', async () => {
        const { value: res, seen } = await collectingRejections(
          () => axios.post(BASE + path, { payload: "just a string" }, HTTP));

        assert.strictEqual(res.status, 400);
        assert.deepStrictEqual(seen.map((e) => e && e.message), []);
      });
    });
  }

  // ------------------------------------------- the ext message pipeline route

  describe('POST /ext/:projectId/requests/:requestId/messages', function () {

    it('with no Authorization header answers and raises no unhandled rejection', async () => {
      // The 200 goes out before anything is parsed, so the failure could never
      // reach the caller: new TiledeskClient({ token: undefined }) threw
      // "options.token can NOT be null." straight out of the async handler.
      const { value: res, seen } = await collectingRejections(
        () => axios.post(`${BASE}/ext/${PROJECT_ID}/requests/support-group-${PROJECT_ID}-nohdr/messages`,
          { text: "hello" }, HTTP));

      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(seen.map((e) => e && e.message), []);
    });
  });

  // ------------------------------------------------------- the boundary itself

  describe('the async error boundary', function () {

    it('turns a rejected handler into a logged 500 instead of a dead process', async () => {
      const boundaryApp = express();
      boundaryApp.get('/boom', guardHandler(async () => { throw new Error("handler exploded"); }));
      boundaryApp.get('/sync-boom', guardHandler(() => { throw new Error("thrown synchronously"); }));
      boundaryApp.get('/fine', guardHandler(async (req, res) => res.status(200).send({ ok: true })));

      const listener = await new Promise((r) => {
        const l = boundaryApp.listen(10004, '0.0.0.0', () => r(l));
      });
      try {
        const { value, seen } = await collectingRejections(async () => ({
          boom: await axios.get('http://localhost:10004/boom', HTTP),
          syncBoom: await axios.get('http://localhost:10004/sync-boom', HTTP),
          fine: await axios.get('http://localhost:10004/fine', HTTP)
        }));

        assert.strictEqual(value.boom.status, 500);
        assert.deepStrictEqual(value.boom.data, { success: false, error: "Internal error" });
        assert.strictEqual(value.syncBoom.status, 500);
        assert.strictEqual(value.fine.status, 200,
          'a handler that works is untouched');
        assert.deepStrictEqual(seen.map((e) => e && e.message), []);
      } finally {
        await new Promise((r) => listener.close(() => r()));
      }
    });

    it('a handler that already answered keeps its answer; the error is only logged', async () => {
      const boundaryApp = express();
      boundaryApp.get('/answered-then-boom', guardHandler(async (req, res) => {
        res.status(202).send({ accepted: true });
        throw new Error("after the answer");
      }));

      const listener = await new Promise((r) => {
        const l = boundaryApp.listen(10004, '0.0.0.0', () => r(l));
      });
      try {
        const { value: res, seen } = await collectingRejections(
          () => axios.get('http://localhost:10004/answered-then-boom', HTTP));

        assert.strictEqual(res.status, 202);
        assert.deepStrictEqual(res.data, { accepted: true });
        assert.deepStrictEqual(seen.map((e) => e && e.message), []);
      } finally {
        await new Promise((r) => listener.close(() => r()));
      }
    });

    it('passes non-function arguments through and keeps the declared arity', function () {
      assert.strictEqual(guardHandler("/a/path"), "/a/path");
      assert.strictEqual(guardHandler(undefined), undefined);
      assert.strictEqual(guardHandler((req, res) => { }).length, 3);
      assert.strictEqual(guardHandler((err, req, res, next) => { }).length, 4,
        'express reads arity to tell an error handler from a normal one');
    });

    // Driven directly rather than over HTTP: these are the shapes express
    // cannot produce on demand -- a `res` that is not there at all, and one
    // whose send() itself fails.
    it('answers nothing when there is no response object to answer with', function () {
      const guarded = guardHandler((req, res, next) => { throw new Error("no res here"); });
      assert.doesNotThrow(() => guarded({ method: 'GET', url: '/x' }, undefined, () => { }));
    });

    it('survives a response whose send() throws', function () {
      const res = {
        headersSent: false,
        status() { return this; },
        send() { throw new Error("socket already gone"); }
      };
      const guarded = guardHandler((q, r, next) => { throw new Error("original"); });
      assert.doesNotThrow(() => guarded({ method: 'POST', originalUrl: '/y' }, res, () => { }));
    });

    it('leaves the answer alone when the handler already sent the headers', function () {
      const sent = [];
      const res = {
        headersSent: true,
        status(code) { sent.push(code); return this; },
        send(body) { sent.push(body); return this; }
      };
      const guarded = guardHandler((q, r, next) => { throw new Error("late"); });
      guarded({ method: 'POST', originalUrl: '/z' }, res, () => { });
      assert.deepStrictEqual(sent, [], 'nothing may be written after headersSent');
    });

    it('an error handler that throws synchronously is caught as well', function () {
      const sent = [];
      const res = {
        headersSent: false,
        status(code) { sent.push(code); return this; },
        send(body) { sent.push(body); return this; }
      };
      const guarded = guardHandler((err, q, r, next) => { throw new Error("boom in the error handler"); });
      assert.strictEqual(guarded.length, 4);
      guarded(new Error("original"), { method: 'GET', url: '/w' }, res, () => { });
      assert.deepStrictEqual(sent, [500, { success: false, error: "Internal error" }]);
    });

    it('a handler that returns a plain value returns it unchanged', function () {
      const guarded = guardHandler(() => "not a promise");
      assert.strictEqual(guarded({ method: 'GET', url: '/v' }, {}, () => { }), "not a promise");
    });

    it('an error handler that rejects is caught too', async () => {
      const boundaryApp = express();
      boundaryApp.get('/raise', (req, res, next) => next(new Error("original")));
      boundaryApp.use(guardHandler(async (err, req, res, next) => { throw new Error("and the handler too"); }));

      const listener = await new Promise((r) => {
        const l = boundaryApp.listen(10004, '0.0.0.0', () => r(l));
      });
      try {
        const { value: res, seen } = await collectingRejections(
          () => axios.get('http://localhost:10004/raise', HTTP));
        assert.strictEqual(res.status, 500);
        assert.deepStrictEqual(seen.map((e) => e && e.message), []);
      } finally {
        await new Promise((r) => listener.close(() => r()));
      }
    });
  });

});
