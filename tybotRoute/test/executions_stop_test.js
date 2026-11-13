'use strict';

// first: sets the endpoint defaults before the engine modules load
const { listen, close, suiteEndpoints } = require('./helpers/executionsTestServer');

const assert = require('assert');
const crypto = require('crypto');
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const tybot = require('../');
const winston = require('../utils/winston');
const httpUtils = require('../utils/HttpUtils');
const tilebotService = require('../services/TilebotService');
const ExecutionRecorder = require('../executions/ExecutionRecorder');
const StopNotice = require('../executions/StopNotice');
const { ExecutionStore } = require('../executions/ExecutionStore');
const { setEmitterForTests } = require('../executions/TraceEmitter');
const lifecycle = require('./executions_lifecycle_bot.js').bots_data;

const PROJECT_ID = 'projectID';
const BOT_ID = 'botID';
const CHATBOT_TOKEN = 'XXX';
// Own ports: block jumps come back to APP_PORT, bot replies land on API_PORT.
const APP_PORT = 10041;
const API_PORT = 10042;

const ENV_KEYS = ['EXECUTIONS_ENABLED', 'EXECUTIONS_STATE_ENABLED', 'EXECUTIONS_STATE_HASH_KEY', 'EXECUTIONS_SEAL_PUBLIC_KEY', 'EXECUTIONS_SEAL_KID',
  'EXECUTIONS_AMQP_URL', 'AMQP_MANAGER_URL', 'CHATBOT_MAX_STEPS', 'EXECUTIONS_LEASE_MS', 'EXECUTIONS_HEARTBEAT_MS', 'EXECUTIONS_TRANSIT_MS'];

const app = express();
app.use('/', tybot.router);
app.use((err, req, res, next) => { winston.error('General error', err); });

function newRequestId(prefix = 'support-group-') {
  return prefix + PROJECT_ID + '-' + uuidv4().replace(/-/g, '');
}

// the lifecycle bot plus: twostep (a wait, then a reply), slow (a wait) and hop (jumps to slow)
function buildBots() {
  const data = JSON.parse(JSON.stringify(lifecycle));
  const bot = data.bots[BOT_ID];
  const add = (name, actions) => {
    const intent = { webhook_enabled: false, enabled: true, language: 'en', intent_display_name: name, intent_id: name, question: '', actions };
    bot.intents[name] = intent;
    bot.intents_by_intent_id[name] = intent;
  };
  add('twostep', [
    { _tdActionType: 'wait', _tdActionId: 'act_wait', _tdActionTitle: 'wait', millis: 800 },
    { _tdActionType: 'reply', _tdActionId: 'act_second', _tdActionTitle: 'second', text: 'second',
      attributes: { commands: [{ type: 'message', message: { type: 'text', text: 'second' } }] } }
  ]);
  add('slow', [{ _tdActionType: 'wait', _tdActionId: 'act_wait', _tdActionTitle: 'wait', millis: 300 }]);
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

describe('Executions: stop gates (soft stop and blocked messages)', function () {
  this.timeout(30000);

  let savedEnv;
  let appListener, apiListener;
  let client;
  const log = [];
  const calls = [];
  const sent = []; // messages the bot posted to the mock server: { rid, text }
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

  /** A client that logs every call into `calls`, with the calls still pending when it was issued. */
  function proxiedClient() {
    const pending = { n: 0 };
    return new Proxy(client, {
      get(target, prop) {
        const v = target[prop];
        if (typeof v !== 'function') return v;
        return (...args) => {
          const entry = { call: String(prop), args, pendingBefore: pending.n };
          calls.push(entry);
          const r = v.apply(target, args);
          if (r && typeof r.then === 'function') {
            pending.n++;
            r.then(() => { pending.n--; }, () => { pending.n--; });
          }
          return r;
        };
      }
    });
  }

  const events = (rid) => log.filter((e) => e.request_id === rid);
  const ofType = (rid, type) => events(rid).filter((e) => e.type === type);
  const execIdOf = (rid) => (events(rid)[0] || {}).execution_id;
  const owner = (id) => client.get(`exec:${id}:owner`);
  const transit = (id) => client.get(`exec:${id}:transit`);
  const setStop = (id, mode = 'soft') => client.set(`exec:${id}:stop`, mode, { EX: 604800 });
  const sentTo = (rid) => sent.filter((m) => m.rid === rid);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function send(text, requestId, sender = 'A-SENDER') {
    if (!requestIds.includes(requestId)) requestIds.push(requestId);
    tilebotService.sendMessageToBot({
      payload: {
        _id: uuidv4(),
        senderFullname: 'guest#367e',
        type: 'text',
        sender,
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
    process.env.EXECUTIONS_STATE_HASH_KEY = 'stop-test-hash-key';
    process.env.EXECUTIONS_SEAL_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    process.env.EXECUTIONS_SEAL_KID = 'kid-stop';
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
    api.post('/:projectId/requests/:requestId/messages', (req, res) => {
      sent.push({ rid: req.params.requestId, text: req.body && req.body.text, notice: !!(req.body && req.body.attributes && req.body.attributes.execution_notice) });
      res.send({ success: true });
    });
    api.patch('/:projectId/requests/:requestId/attributes', (req, res) => res.send({ success: true }));
    api.put('/:projectId/requests/:requestId/attributes', (req, res) => res.send({ success: true }));
    apiListener = await listen(api, API_PORT);

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
      del.push(`exec:${id}`, `exec:${id}:seq`, `exec:${id}:state`, `exec:${id}:owner`, `exec:${id}:transit`, `exec:${id}:stop`);
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
  });

  afterEach(function () {
    betweenBlocks = null;
    process.env.EXECUTIONS_ENABLED = 'true';
    calls.length = 0;
    // back to the store startApp gave the recorder
    ExecutionRecorder.init({ store: new ExecutionStore(client) });
  });

  it('soft stop set during action 1 stops before action 2: execution.stopped {mode:\'soft\'}, no action.completed for action 2, no execution.idle', async function () {
    const rid = newRequestId();
    send('/twostep', rid);
    await waitFor(() => ofType(rid, 'step.started').length === 1, 'the block to start');
    const id = execIdOf(rid);
    await setStop(id, 'soft'); // the 800 ms wait (action 1) is running
    await waitFor(() => ofType(rid, 'execution.stopped').length === 1, 'execution.stopped');
    await sleep(1200);
    await ExecutionRecorder._drainForTests();
    const stopped = ofType(rid, 'execution.stopped');
    assert.strictEqual(stopped.length, 1, 'emitted once');
    assert.strictEqual(stopped[0].data.mode, 'soft');
    assert.strictEqual(stopped[0].data.last_seq, stopped[0].seq);
    const acts = ofType(rid, 'action.completed');
    assert.deepStrictEqual(acts.map((a) => a.data.action_index), [0], 'action 2 never ran');
    const exits = ofType(rid, 'step.completed');
    assert.strictEqual(exits.length, 1, 'the block exit is recorded');
    assert.strictEqual(exits[0].data.outcome, 'success', 'step outcome unchanged by the stop');
    assert.ok(exits[0].seq < stopped[0].seq, 'step.completed before execution.stopped');
    assert.strictEqual(ofType(rid, 'execution.idle').length, 0, 'no execution.idle');
    assert.strictEqual(sentTo(rid).filter((m) => m.text === 'second').length, 0, 'the reply was not sent');
    assert.strictEqual(await owner(id), null, 'lease released');
  });

  it('jump arriving after the stop flag emits stopped and runs nothing', async function () {
    const rid = newRequestId();
    betweenBlocks = async (message) => {
      if (message.payload.text !== '/#slow') return;
      await setStop(execIdOf(rid), 'soft'); // set while the jump is in transit
    };
    send('/hop', rid);
    await waitFor(() => ofType(rid, 'execution.stopped').length === 1, 'execution.stopped');
    const id = execIdOf(rid);
    await sleep(600);
    await ExecutionRecorder._drainForTests();
    const stopped = ofType(rid, 'execution.stopped');
    assert.strictEqual(stopped.length, 1);
    assert.strictEqual(stopped[0].data.mode, 'soft');
    assert.strictEqual(stopped[0].data.last_seq, stopped[0].seq);
    assert.deepStrictEqual(ofType(rid, 'step.started').map((s) => s.data.block_id), ['hop'], 'the slow block never started');
    assert.strictEqual(ofType(rid, 'execution.idle').length, 0);
    assert.strictEqual(ofType(rid, 'execution.message_while_stopped').length, 0, 'a jump is not a user message');
    assert.strictEqual(await transit(id), null, 'transit cleared');
    assert.strictEqual(await owner(id), null, 'lease released');
  });

  it('a user message while stopped emits message_while_stopped; the bot sends only the stop notice, once per stop', async function () {
    const rid = newRequestId();
    send('/after', rid);
    await settle(rid);
    const id = execIdOf(rid);
    assert.strictEqual(sentTo(rid).length, 1, 'the first message got its reply');
    await setStop(id, 'soft');
    send('/after', rid);
    await waitFor(() => ofType(rid, 'execution.message_while_stopped').length === 1, 'message_while_stopped');
    await sleep(600);
    await ExecutionRecorder._drainForTests();
    const blocked = ofType(rid, 'execution.message_while_stopped').slice(0, 1);
    assert.strictEqual(blocked.length, 1);
    assert.deepStrictEqual(blocked[0].data, {});
    assert.strictEqual(blocked[0].execution_id, id, 'same execution');
    // no reply to the message, only the notice (in English: no language on the request)
    assert.deepStrictEqual(sentTo(rid).slice(1), [{ rid, text: StopNotice.DEFAULTS.en, notice: true }]);
    // a second message during the same stop: no second notice
    send('/after', rid);
    await waitFor(() => ofType(rid, 'execution.message_while_stopped').length === 2, 'second message_while_stopped');
    await sleep(300);
    assert.strictEqual(sentTo(rid).length, 2, 'one notice per stop');
    assert.strictEqual(ofType(rid, 'step.started').length, 1, 'no block ran');
    assert.strictEqual(ofType(rid, 'execution.stopped').length, 0);
    assert.strictEqual(ofType(rid, 'execution.idle').length, 1);
    assert.strictEqual(await owner(id), null, 'lease released');
    assert.strictEqual(await ExecutionRecorder.gateMessage(null, {}), 'run');
  });

  it('the stop notice: a new stop notifies again; the project can change its text or turn it off', async function () {
    const rid = newRequestId();
    const project = rid.split('-')[2];
    send('/after', rid);
    await settle(rid);
    const id = execIdOf(rid);
    const stopAndWrite = async (n) => {
      await client.del(`exec:${id}:notice`); // what the executions API does with every new stop flag
      await setStop(id, 'soft');
      send('/after', rid);
      await waitFor(() => ofType(rid, 'execution.message_while_stopped').length === n, 'message_while_stopped ' + n);
      await sleep(300);
    };
    try {
      await client.hSet(`exec:policy:${project}`, 'stop_notice_text', 'Back soon');
      StopNotice._clearCacheForTests();
      await stopAndWrite(1);
      assert.deepStrictEqual(sentTo(rid).slice(1).map((m) => m.text), ['Back soon']);
      await client.hSet(`exec:policy:${project}`, 'stop_notice', 'false');
      StopNotice._clearCacheForTests();
      await stopAndWrite(2);
      assert.strictEqual(sentTo(rid).length, 2, 'turned off: no notice');
    } finally {
      await client.del(`exec:policy:${project}`);
      StopNotice._clearCacheForTests();
    }
  });

  it('automation sync caller receives 409 execution_stopped once', async function () {
    const rid = newRequestId('automation-request-');
    requestIds.push(rid);
    const topic = `/webhooks/${rid}`;
    const published = [];
    const sub = client.duplicate();
    await sub.connect();
    await sub.subscribe(topic, (msg) => published.push(msg));
    try {
      const resP = axios.request({
        method: 'post',
        url: `http://localhost:${APP_PORT}/block/${PROJECT_ID}/${BOT_ID}/twostep`,
        data: { token: CHATBOT_TOKEN, preloaded_request_id: rid },
        validateStatus: () => true
      });
      await waitFor(() => ofType(rid, 'step.started').length === 1, 'the block to start');
      const id = execIdOf(rid);
      await setStop(id, 'soft');
      const res = await resP;
      assert.strictEqual(res.status, 409);
      assert.deepStrictEqual(res.data, { error: 'execution_stopped', execution_id: id });
      await sleep(1200);
      await ExecutionRecorder._drainForTests();
      assert.strictEqual(published.length, 1, 'published once');
      assert.deepStrictEqual(JSON.parse(published[0]), { status: 409, payload: { error: 'execution_stopped', execution_id: id } });
      assert.strictEqual(ofType(rid, 'execution.stopped').length, 1);
      assert.strictEqual(ofType(rid, 'execution.ended').length, 0, 'a stopped automation does not end as completed');
      assert.strictEqual(await client.hGet(`exec:${id}`, 'status'), 'running', 'no completed status hint');
    } finally {
      await sub.unsubscribe(topic);
      await sub.quit();
    }
  });

  it('flag off: no stop read (proxied client records zero GETs on exec:*)', async function () {
    process.env.EXECUTIONS_ENABLED = 'false';
    ExecutionRecorder.init({ store: new ExecutionStore(proxiedClient()) });
    const rid = newRequestId();
    send('/after', rid);
    await waitFor(() => sentTo(rid).length === 1, 'the reply');
    await sleep(300);
    const execGets = calls.filter((c) => c.call === 'get' && String(c.args[0]).startsWith('exec:'));
    assert.strictEqual(execGets.length, 0);
    assert.strictEqual(calls.length, 0, 'the recorder store is not touched at all');
    assert.strictEqual(events(rid).length, 0);
  });

  it('per-action Redis budget: exactly one extra GET per action', async function () {
    ExecutionRecorder.init({ store: new ExecutionStore(proxiedClient()) });
    const actions = buildBots().bots[BOT_ID].intents.count.actions.length;
    assert.ok(actions >= 2);
    const rid = newRequestId();
    send('/count', rid);
    await settle(rid);
    const id = execIdOf(rid);
    const stopKey = `exec:${id}:stop`;
    const stopReads = calls.filter((c) => c.args[0] === stopKey);
    assert.ok(stopReads.every((c) => c.call === 'get'), 'reads only');
    assert.strictEqual(stopReads.length, actions + 1, 'one per action, plus one per message');
    // the message's read goes out with the lease SET NX (same tick: one round trip)
    const first = calls.indexOf(stopReads[0]);
    const lease = calls.findIndex((c) => c.call === 'set' && c.args[0] === `exec:${id}:owner`);
    assert.ok(lease >= 0 && lease < first, 'lease SET issued before the stop GET');
    assert.ok(stopReads[0].pendingBefore >= 1, 'issued while the lease SET was still pending');
    // no other GET on exec:*: only resolve's two reads (request key, handoff), once per message
    const otherGets = calls.filter((c) => c.call === 'get' && String(c.args[0]).startsWith('exec:') && c.args[0] !== stopKey);
    assert.deepStrictEqual(otherGets.map((c) => c.args[0]), [`exec:req:${rid}:${BOT_ID}`, `exec:handoff:${rid}`]);
  });
});
