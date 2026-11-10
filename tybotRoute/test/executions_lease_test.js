'use strict';

// first: sets the endpoint defaults before the engine modules load
const { listen, close, suiteEndpoints } = require('./helpers/executionsTestServer');

const assert = require('assert');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const bodyParser = require('body-parser');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const tybot = require('../');
const winston = require('../utils/winston');
const httpUtils = require('../utils/HttpUtils');
const tilebotService = require('../services/TilebotService');
const ExecutionRecorder = require('../executions/ExecutionRecorder');
const WriteTap = require('../executions/WriteTap');
const { ExecutionStore } = require('../executions/ExecutionStore');
const { setEmitterForTests } = require('../executions/TraceEmitter');
const lifecycle = require('./executions_lifecycle_bot.js').bots_data;

const PROJECT_ID = 'projectID';
const BOT_ID = 'botID';
const CHATBOT_TOKEN = 'XXX';
// Own ports: block jumps come back to APP_PORT, bot replies land on API_PORT.
const APP_PORT = 10031;
const API_PORT = 10032;
const FAIL_PORT = 10003; // the fixture's web request target, always 500

const ENV_KEYS = ['EXECUTIONS_ENABLED', 'EXECUTIONS_STATE_ENABLED', 'EXECUTIONS_STATE_HASH_KEY', 'EXECUTIONS_SEAL_PUBLIC_KEY', 'EXECUTIONS_SEAL_KID',
  'EXECUTIONS_AMQP_URL', 'AMQP_MANAGER_URL', 'CHATBOT_MAX_STEPS', 'EXECUTIONS_LEASE_MS', 'EXECUTIONS_HEARTBEAT_MS', 'EXECUTIONS_TRANSIT_MS'];

const app = express();
app.use('/', tybot.router);
app.use((err, req, res, next) => { winston.error('General error', err); });

function newRequestId() {
  return 'support-group-' + PROJECT_ID + '-' + uuidv4().replace(/-/g, '');
}

// the lifecycle bot plus: slow (a 1.5 s wait block) and hop (jumps to slow)
function buildBots() {
  const data = JSON.parse(JSON.stringify(lifecycle));
  const bot = data.bots[BOT_ID];
  const add = (name, actions) => {
    const intent = { webhook_enabled: false, enabled: true, language: 'en', intent_display_name: name, intent_id: name, question: '', actions };
    bot.intents[name] = intent;
    bot.intents_by_intent_id[name] = intent;
  };
  add('slow', [{ _tdActionType: 'wait', _tdActionId: 'act_wait', _tdActionTitle: 'wait', millis: 1500 }]);
  add('slower', [{ _tdActionType: 'wait', _tdActionId: 'act_wait_long', _tdActionTitle: 'long wait', millis: 3000 }]);
  add('hop', [{ _tdActionType: 'intent', _tdActionId: 'act_goto_slow', _tdActionTitle: 'go to slow', intentName: '#slow' }]);
  return data;
}

function startTybot(endpoints = { TILEBOT_ENDPOINT: `http://localhost:${APP_PORT}`, API_ENDPOINT: `http://localhost:${API_PORT}` }, bots = buildBots()) {
  return new Promise((resolve) => {
    tybot.startApp({
      bots,
      TILEBOT_ENDPOINT: endpoints.TILEBOT_ENDPOINT,
      API_ENDPOINT: endpoints.API_ENDPOINT,
      REDIS_HOST: process.env.REDIS_HOST,
      REDIS_PORT: process.env.REDIS_PORT,
      REDIS_PASSWORD: process.env.REDIS_PASSWORD
    }, () => resolve());
  });
}

async function waitFor(pred, what, timeoutMs = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timed out waiting for ' + what);
}

describe('Executions: lease, heartbeat and transit', function () {
  this.timeout(30000);

  let savedEnv;
  let appListener, apiListener, failListener;
  let client;
  const log = [];
  const requestIds = [];
  let betweenBlocks = null;
  const originalRequest = httpUtils.request;
  const fakeEmitter = {
    emit(envelope) { log.push(envelope); },
    async flush() {},
    stats() { return { published: 0, dropped: 0, buffered: 0 }; },
    stop() {}
  };

  /** betweenBlocks runs after the jumping block's exit, before the jump is posted. */
  function hookedRequest(options, callback, ...rest) {
    if (betweenBlocks && options && typeof options.url === 'string' && options.url.startsWith(`http://localhost:${APP_PORT}/ext/`)) {
      const hook = betweenBlocks;
      return Promise.resolve(hook(options.json)).then(() => originalRequest.call(httpUtils, options, callback, ...rest));
    }
    return originalRequest.call(httpUtils, options, callback, ...rest);
  }

  const events = (rid) => log.filter((e) => e.request_id === rid);
  const ofType = (rid, type) => events(rid).filter((e) => e.type === type);
  const execIdOf = (rid) => (events(rid)[0] || {}).execution_id;
  const owner = (id) => client.get(`exec:${id}:owner`);
  const transit = (id) => client.get(`exec:${id}:transit`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function send(text, requestId) {
    if (!requestIds.includes(requestId)) requestIds.push(requestId);
    tilebotService.sendMessageToBot({
      payload: {
        _id: uuidv4(),
        senderFullname: 'guest#367e',
        type: 'text',
        sender: 'A-SENDER',
        recipient: requestId,
        text,
        id_project: PROJECT_ID,
        request: { request_id: requestId }
      },
      token: CHATBOT_TOKEN
    }, BOT_ID, () => {});
  }

  async function settle(rid, idles = 1) {
    await waitFor(() => ofType(rid, 'execution.idle').length >= idles, 'the chain to end');
    await sleep(200);
    await ExecutionRecorder._drainForTests();
  }

  before(async function () {
    savedEnv = {};
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.EXECUTIONS_ENABLED = 'true';
    process.env.EXECUTIONS_STATE_HASH_KEY = 'lease-test-hash-key';
    process.env.EXECUTIONS_SEAL_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    process.env.EXECUTIONS_SEAL_KID = 'kid-lease';
    delete process.env.EXECUTIONS_AMQP_URL;
    delete process.env.AMQP_MANAGER_URL;
    delete process.env.CHATBOT_MAX_STEPS;
    delete process.env.EXECUTIONS_STATE_ENABLED;
    setEmitterForTests(fakeEmitter);

    client = redis.createClient({ url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}` });
    await client.connect();

    httpUtils.request = hookedRequest;

    const api = express();
    api.use(bodyParser.json());
    api.post('/:projectId/requests/:requestId/messages', (req, res) => res.send({ success: true }));
    api.patch('/:projectId/requests/:requestId/attributes', (req, res) => res.send({ success: true }));
    apiListener = await listen(api, API_PORT);

    const fail = express();
    fail.get('/fail', (req, res) => res.status(500).send({ error: 'boom' }));
    failListener = await listen(fail, FAIL_PORT);

    await startTybot();
    appListener = await listen(app, APP_PORT);
  });

  after(async function () {
    httpUtils.request = originalRequest;
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    await startTybot(suiteEndpoints(), lifecycle);
    setEmitterForTests(null);
    ExecutionRecorder._resetForTests();
    const del = [];
    for (const id of new Set(log.map((e) => e.execution_id))) {
      del.push(`exec:${id}`, `exec:${id}:seq`, `exec:${id}:state`, `exec:${id}:owner`, `exec:${id}:transit`);
    }
    for (const rid of new Set(requestIds)) {
      del.push(`exec:req:${rid}:${BOT_ID}`, `tilebot:${rid}`, `tilebot:botId_requests:${rid}`);
      for await (const k of client.scanIterator({ MATCH: `tilebot:requests:${rid}*`, COUNT: 1000 })) {
        if (Array.isArray(k)) del.push(...k); else del.push(k);
      }
    }
    if (del.length) await client.del(del);
    await client.quit();
    await close(appListener);
    await close(apiListener);
    await close(failListener);
  });

  afterEach(function () {
    betweenBlocks = null;
    process.env.EXECUTIONS_ENABLED = 'true';
    delete process.env.EXECUTIONS_LEASE_MS;
    delete process.env.EXECUTIONS_HEARTBEAT_MS;
  });

  it('a chain holds exec:{id}:owner = pod while it runs and releases it at the end', async function () {
    const rid = newRequestId();
    send('/slow', rid);
    await waitFor(() => execIdOf(rid), 'the execution');
    const id = execIdOf(rid);
    await waitFor(async () => (await owner(id)) !== null, 'the lease');
    assert.strictEqual(await owner(id), os.hostname());
    const ttl = await client.pTTL(`exec:${id}:owner`);
    assert.ok(ttl > 0 && ttl <= 15000, 'PX lease, ttl ' + ttl);
    await sleep(300);
    assert.strictEqual(await owner(id), os.hostname(), 'still held mid-wait');
    await settle(rid);
    assert.strictEqual(await owner(id), null, 'released at the end of the chain');
  });

  it('heartbeat keeps the lease alive past leaseMs during a wait block', async function () {
    process.env.EXECUTIONS_LEASE_MS = '300';
    process.env.EXECUTIONS_HEARTBEAT_MS = '100';
    const rid = newRequestId();
    send('/slow', rid);
    await waitFor(() => execIdOf(rid), 'the execution');
    const id = execIdOf(rid);
    await waitFor(async () => (await owner(id)) !== null, 'the lease');
    const t0 = Date.now();
    await sleep(1000); // > 3 x leaseMs, still inside the 1.5 s wait
    assert.ok(Date.now() - t0 >= 900);
    assert.strictEqual(ofType(rid, 'execution.idle').length, 0, 'the wait is still running');
    assert.strictEqual(await owner(id), os.hostname(), 'renewed past leaseMs');
    await settle(rid);
    assert.strictEqual(await owner(id), null);
  });

  it('a jump sets transit and releases the lease; the next /ext clears transit and takes the lease', async function () {
    const rid = newRequestId();
    const seen = {};
    betweenBlocks = async (message) => {
      if (message.payload.text !== '/#slow') return;
      const id = execIdOf(rid);
      seen.owner = await owner(id);
      seen.transit = await transit(id);
      seen.transitTtl = await client.pTTL(`exec:${id}:transit`);
    };
    send('/hop', rid);
    await waitFor(() => execIdOf(rid), 'the execution');
    const id = execIdOf(rid);
    await waitFor(() => seen.transitTtl !== undefined, 'the jump post');
    assert.strictEqual(seen.owner, null, 'lease released before the post');
    assert.ok(/^\d+$/.test(seen.transit), 'transit holds a timestamp');
    assert.ok(seen.transitTtl > 0 && seen.transitTtl <= 120000);
    // the next block (jump message carries execution_id): transit cleared, lease taken
    await waitFor(async () => (await owner(id)) === os.hostname(), 'the next block to take the lease');
    assert.strictEqual(await transit(id), null, 'transit cleared by the next /ext');
    await settle(rid);
    assert.strictEqual(await owner(id), null);
    assert.strictEqual(await transit(id), null);
  });

  it('a second concurrent message on the same request does not take the lease and still runs', async function () {
    const rid = newRequestId();
    send('/slow', rid);
    await waitFor(() => execIdOf(rid), 'the execution');
    const id = execIdOf(rid);
    await waitFor(async () => (await owner(id)) !== null, 'the lease');
    send('/count', rid);
    await waitFor(() => ofType(rid, 'execution.idle').length >= 1 && ofType(rid, 'step.started').some((s) => s.data.block_id === 'count'), 'the second message to run');
    assert.strictEqual(ofType(rid, 'step.started').filter((s) => s.data.block_id === 'count').length, 1, 'it ran');
    assert.strictEqual(await owner(id), os.hostname(), 'the first chain still holds the lease; the second did not release it');
    await settle(rid, 2);
    assert.strictEqual(await owner(id), null);
  });

  it('a second concurrent chain keeps the lease alive after the first one releases', async function () {
    process.env.EXECUTIONS_LEASE_MS = '300';
    process.env.EXECUTIONS_HEARTBEAT_MS = '100';
    const rid = newRequestId();
    send('/slow', rid); // 1.5 s
    await waitFor(() => execIdOf(rid), 'the execution');
    const id = execIdOf(rid);
    await waitFor(async () => (await owner(id)) !== null, 'the lease');
    send('/slower', rid); // 3 s, loses the SET NX
    await waitFor(() => ofType(rid, 'step.started').some((s) => s.data.block_id === 'slower'), 'the second chain');
    await waitFor(() => ofType(rid, 'execution.idle').length >= 1, 'the first chain to end', 5000);
    await sleep(700); // > 2 x leaseMs after the first chain's release
    assert.strictEqual(ofType(rid, 'execution.idle').length, 1, 'the second chain is still waiting');
    assert.strictEqual(await owner(id), os.hostname(), 'the second chain holds the lease');
    await settle(rid, 2);
    assert.strictEqual(await owner(id), null, 'released by the last chain');
  });

    it('flag off: no owner/transit keys', async function () {
    process.env.EXECUTIONS_ENABLED = 'false';
    const count = async () => {
      let n = 0;
      for await (const k of client.scanIterator({ MATCH: 'exec:*', COUNT: 1000 })) {
        for (const key of (Array.isArray(k) ? k : [k])) if (/:(owner|transit)$/.test(key)) n++;
      }
      return n;
    };
    const before = await count();
    const rid = newRequestId();
    send('/slow', rid);
    await sleep(500);
    assert.strictEqual(await count(), before, 'no lease taken while the chain waits');
    await sleep(1400);
    assert.strictEqual(events(rid).length, 0, 'nothing traced');
    assert.strictEqual(await count(), before);
  });
  describe('no path leaves the lease or the heartbeat behind', function () {
    async function directCtx() {
      const rid = newRequestId();
      requestIds.push(rid);
      const ctx = await ExecutionRecorder.onMessageIn({
        message: { text: '/x', request: { request_id: rid } }, bot: {}, botId: BOT_ID, requestId: rid,
        projectId: PROJECT_ID, token: CHATBOT_TOKEN, store: new ExecutionStore(client)
      });
      assert.ok(ctx && ctx.leased && ctx._heartbeat, 'lease taken, heartbeat running');
      assert.strictEqual(await owner(ctx.execution_id), os.hostname());
      return ctx;
    }

    it('a failed chain releases the lease and stops the heartbeat', async function () {
      const ctx = await directCtx();
      await ExecutionRecorder.failed(ctx, { error_code: 'x', message: 'boom' });
      assert.strictEqual(await owner(ctx.execution_id), null);
      assert.strictEqual(ctx._heartbeat, null);
      assert.strictEqual(ctx.leased, false);
    });

    it('a message with no matching intent / no reply releases the lease', async function () {
      process.env.EXECUTIONS_LEASE_MS = '300';
      process.env.EXECUTIONS_HEARTBEAT_MS = '100';
      const rid = newRequestId();
      send('/no_such_intent_at_all', rid);
      await waitFor(() => execIdOf(rid), 'the execution');
      const id = execIdOf(rid);
      await sleep(1200); // a leaked heartbeat would keep renewing the 300 ms lease
      assert.strictEqual(await owner(id), null);
    });

    it('a message that creates an execution and runs no block ends it as idle (waiting), not leaseless', async function () {
      const rid = newRequestId();
      send('/no_such_intent_at_all', rid);
      await waitFor(() => ofType(rid, 'execution.idle').length === 1, 'execution.idle');
      await sleep(200);
      await ExecutionRecorder._drainForTests();
      const id = execIdOf(rid);
      assert.strictEqual(ofType(rid, 'execution.started').length, 1, 'the message created the execution');
      assert.strictEqual(ofType(rid, 'step.started').length, 0, 'no block ran');
      assert.strictEqual(ofType(rid, 'execution.idle').length, 1);
      assert.strictEqual(ofType(rid, 'execution.failed').length, 0);
      assert.strictEqual(await owner(id), null, 'lease released');
      // an existing waiting execution that matches nothing: no further idle
      send('/no_such_intent_again', rid);
      await sleep(600);
      await ExecutionRecorder._drainForTests();
      assert.strictEqual(ofType(rid, 'execution.idle').length, 1, 'only the created execution is idled');
      assert.strictEqual(await owner(id), null);
    });

    it('an automation that creates an execution and runs no block ends completed', async function () {
      const rid = 'automation-request-' + PROJECT_ID + '-' + uuidv4().replace(/-/g, '');
      send('/no_such_intent_at_all', rid);
      await waitFor(() => ofType(rid, 'execution.ended').length === 1, 'execution.ended');
      await sleep(200);
      await ExecutionRecorder._drainForTests();
      const id = execIdOf(rid);
      assert.strictEqual(ofType(rid, 'execution.ended')[0].data.end_reason, 'completed');
      assert.strictEqual(ofType(rid, 'execution.idle').length, 0);
      assert.strictEqual(await client.hGet(`exec:${id}`, 'status'), 'completed', 'completed hint');
      assert.strictEqual(await owner(id), null);
    });

    it('a Redis error on a renew does not stop the heartbeat', async function () {
      process.env.EXECUTIONS_LEASE_MS = '300';
      process.env.EXECUTIONS_HEARTBEAT_MS = '100';
      const ctx = await directCtx();
      const realEval = client.eval;
      let failed = 0;
      client.eval = function (...args) {
        if (failed === 0) { failed++; return Promise.reject(new Error('blip')); }
        return realEval.apply(this, args);
      };
      try {
        await sleep(900); // the first renew fails; a stopped heartbeat would let the 300 ms lease expire
        assert.strictEqual(failed, 1, 'one renew failed');
        assert.strictEqual(await owner(ctx.execution_id), os.hostname(), 'still renewed');
        assert.ok(ctx._heartbeat, 'heartbeat still running');
      } finally {
        client.eval = realEval;
        await ExecutionRecorder.releaseLease(ctx);
      }
      assert.strictEqual(await owner(ctx.execution_id), null);
    });

    it('a throw while recording the block exit of a jump still releases the lease', async function () {
      const ctx = await directCtx();
      ctx.step = { seq: 1, actions: [], block_id: 'b' };
      const original = ExecutionRecorder.afterAction;
      ExecutionRecorder.afterAction = () => { throw new Error('boom'); };
      try {
        await ExecutionRecorder.runAction(ctx, { index: 0, directive: {} }, () => WriteTap.current().onJump('/#next'));
      } finally {
        ExecutionRecorder.afterAction = original;
      }
      assert.strictEqual(await owner(ctx.execution_id), null);
      assert.strictEqual(ctx._heartbeat, null);
      assert.ok(/^\d+$/.test(await transit(ctx.execution_id) || ''), 'the hand-over marker is still written');
      await client.del(`exec:${ctx.execution_id}:transit`);
    });
  });
});
