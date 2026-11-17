'use strict';

// first: sets the endpoint defaults before the engine modules load
const { listen, close, suiteEndpoints } = require('./helpers/executionsTestServer');

const assert = require('assert');
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
const AbortRegistry = require('../executions/AbortRegistry');
const ControlListener = require('../executions/ControlListener');
const { ExecutionStore } = require('../executions/ExecutionStore');
const { setEmitterForTests } = require('../executions/TraceEmitter');
const lifecycle = require('./executions_lifecycle_bot.js').bots_data;

const PROJECT_ID = 'projectID';
const BOT_ID = 'botID';
const CHATBOT_TOKEN = 'XXX';
// Own ports: block jumps come back to APP_PORT, bot replies (and the hanging endpoint) are on API_PORT.
const APP_PORT = 10051;
const API_PORT = 10052;

const ENV_KEYS = ['KB_ENDPOINT', 'GPTKEY', 'EXECUTIONS_ENABLED', 'EXECUTIONS_STATE_ENABLED', 'EXECUTIONS_STATE_HASH_KEY', 'EXECUTIONS_SEAL_PUBLIC_KEY', 'EXECUTIONS_SEAL_KID',
  'EXECUTIONS_AMQP_URL', 'AMQP_MANAGER_URL', 'CHATBOT_MAX_STEPS', 'EXECUTIONS_LEASE_MS', 'EXECUTIONS_HEARTBEAT_MS', 'EXECUTIONS_TRANSIT_MS'];

const app = express();
app.use('/', tybot.router);
app.use((err, req, res, next) => { winston.error('General error', err); });

function newRequestId(prefix = 'support-group-') {
  return prefix + PROJECT_ID + '-' + uuidv4().replace(/-/g, '');
}

const reply = (id, text) => ({ _tdActionType: 'reply', _tdActionId: id, _tdActionTitle: text, text,
  attributes: { commands: [{ type: 'message', message: { type: 'text', text } }] } });

// the lifecycle bot plus: longwait (a 20 s wait, then a reply), webfail (a hanging web request with a
// falseIntent), falseblock (its error exit), email (a slow send email, then a reply)
function buildBots() {
  const data = JSON.parse(JSON.stringify(lifecycle));
  const bot = data.bots[BOT_ID];
  const add = (name, actions) => {
    const intent = { webhook_enabled: false, enabled: true, language: 'en', intent_display_name: name, intent_id: name, question: '', actions };
    bot.intents[name] = intent;
    bot.intents_by_intent_id[name] = intent;
  };
  add('longwait', [
    { _tdActionType: 'wait', _tdActionId: 'act_wait', _tdActionTitle: 'long wait', millis: 20000 },
    reply('act_after_wait', 'after wait')
  ]);
  add('webfail', [
    { _tdActionType: 'webrequestv2', _tdActionId: 'act_web', _tdActionTitle: 'hanging call', method: 'GET',
      url: `http://localhost:${API_PORT}/hang`, headersString: {}, settings: { timeout: 60000 },
      assignResultTo: 'result', falseIntent: '#falseblock' },
    reply('act_after_web', 'after web')
  ]);
  add('falseblock', [reply('act_false', 'false branch')]);
  add('webv1', [
    { _tdActionType: 'webrequest', _tdActionId: 'act_web1', _tdActionTitle: 'hanging v1 call', method: 'GET',
      url: `http://localhost:${API_PORT}/hang`, headersString: {}, assignTo: 'result' },
    reply('act_after_web1', 'after web v1')
  ]);
  add('askkb', [
    { _tdActionType: 'askgpt', _tdActionId: 'act_ask', _tdActionTitle: 'ask kb', question: 'what?', kbid: 'kb1',
      assignReplyTo: 'kb_answer', falseIntent: '#falseblock' },
    reply('act_after_ask', 'after ask')
  ]);
  add('email', [
    { _tdActionType: 'email', _tdActionId: 'act_email', _tdActionTitle: 'send email', subject: 'hi', text: 'body', to: 'a@b.c' },
    reply('act_after_email', 'after email')
  ]);
  add('whatsapp', [
    { _tdActionType: 'send_whatsapp', _tdActionId: 'act_wa', _tdActionTitle: 'send whatsapp',
      payload: { receiver_list: [{ phone_number: '+390000000000' }] } },
    reply('act_after_wa', 'after whatsapp')
  ]);
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

describe('Executions: hard stop (abort registry, control listener, abortable directives)', function () {
  this.timeout(30000);

  let savedEnv;
  let appListener, apiListener;
  let client;
  const log = [];
  const sent = []; // messages the bot posted to the mock server: { rid, text }
  const jumps = []; // block jumps posted to /ext: { rid, text }
  const httpCalls = []; // every httpUtils.request options object
  const requestIds = [];
  const hanging = [];
  let emailDelayMs = 800;
  const originalRequest = httpUtils.request;
  const fakeEmitter = {
    emit(envelope) { log.push(envelope); },
    async flush() {},
    stats() { return { published: 0, dropped: 0, buffered: 0 }; },
    stop() {}
  };

  function hookedRequest(options, callback, ...rest) {
    httpCalls.push(options);
    if (options && typeof options.url === 'string' && options.url.startsWith(`http://localhost:${APP_PORT}/ext/`) &&
        options.json && options.json.payload && options.json.payload.sender === '_tdinternal') {
      jumps.push({ rid: options.json.payload.recipient, text: options.json.payload.text });
    }
    return originalRequest.call(httpUtils, options, callback, ...rest);
  }

  const events = (rid) => log.filter((e) => e.request_id === rid);
  const ofType = (rid, type) => events(rid).filter((e) => e.type === type);
  const execIdOf = (rid) => (events(rid)[0] || {}).execution_id;
  const owner = (id) => client.get(`exec:${id}:owner`);
  const sentTo = (rid) => sent.filter((m) => m.rid === rid);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** What the API does for a hard stop: the flag, then the control message. */
  async function hardStop(id) {
    await client.set(`exec:${id}:stop`, 'hard', { EX: 604800 });
    await client.publish('exec:control', JSON.stringify({ type: 'stop', mode: 'hard', execution_id: id }));
  }

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

  before(async function () {
    savedEnv = {};
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.EXECUTIONS_ENABLED = 'true';
    process.env.EXECUTIONS_STATE_HASH_KEY = 'hardstop-test-hash-key';
    process.env.EXECUTIONS_SEAL_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    process.env.EXECUTIONS_SEAL_KID = 'kid-hardstop';
    delete process.env.EXECUTIONS_AMQP_URL;
    delete process.env.AMQP_MANAGER_URL;
    delete process.env.CHATBOT_MAX_STEPS;
    delete process.env.EXECUTIONS_STATE_ENABLED;
    process.env.KB_ENDPOINT = `http://localhost:${API_PORT}/kb`; // its /qa hangs
    process.env.GPTKEY = 'sk-hardstop-test';
    setEmitterForTests(fakeEmitter);

    client = redis.createClient({ url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}` });
    await client.connect();

    httpUtils.request = hookedRequest;

    const api = express();
    api.use(bodyParser.json());
    api.post('/:projectId/requests/:requestId/messages', (req, res) => {
      sent.push({ rid: req.params.requestId, text: req.body && req.body.text });
      res.send({ success: true });
    });
    api.patch('/:projectId/requests/:requestId/attributes', (req, res) => res.send({ success: true }));
    api.put('/:projectId/requests/:requestId/attributes', (req, res) => res.send({ success: true }));
    api.post('/:projectId/emails/internal/send', (req, res) => setTimeout(() => res.send({ queued: true }), emailDelayMs));
    api.post('/modules/whatsapp/api/tiledesk/broadcast', (req, res) => res.send({ success: true }));
    api.get('/hang', (req, res) => { hanging.push(res); }); // never answers
    api.post('/kb/qa', (req, res) => { hanging.push(res); }); // never answers
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
    await startTybot(suiteEndpoints(), lifecycle); // flag back off (unless set outside): the listener stops
    await ControlListener.stop();
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
    for (const res of hanging) res.destroy();
    await close(appListener);
    await close(apiListener);
  });

  afterEach(async function () {
    process.env.EXECUTIONS_ENABLED = 'true';
    httpCalls.length = 0;
    ExecutionRecorder.init({ store: new ExecutionStore(client) });
    if (!ControlListener.isRunning()) await startTybot();
  });

  it('hard stop during a 20 s wait ends within 1 s with interrupted + execution.stopped {mode:\'hard\', interrupted_action}', async function () {
    const rid = newRequestId();
    send('/longwait', rid);
    await waitFor(() => ofType(rid, 'step.started').length === 1, 'the block to start');
    await sleep(100); // the wait is running
    const id = execIdOf(rid);
    const t0 = Date.now();
    await hardStop(id);
    await waitFor(() => ofType(rid, 'execution.stopped').length === 1, 'execution.stopped', 1000);
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 1000, 'stopped within 1 s, took ' + elapsed + ' ms');
    await sleep(500);
    await ExecutionRecorder._drainForTests();
    const acts = ofType(rid, 'action.completed');
    assert.strictEqual(acts.length, 1, 'the reply after the wait never ran');
    assert.strictEqual(acts[0].data.outcome, 'interrupted');
    assert.strictEqual(acts[0].data.error_code, 'hard_stop');
    const stopped = ofType(rid, 'execution.stopped');
    assert.strictEqual(stopped.length, 1, 'emitted once');
    assert.strictEqual(stopped[0].data.mode, 'hard');
    assert.deepStrictEqual(stopped[0].data.interrupted_action, { index: 0, action_id: 'act_wait', type: 'wait', title: 'long wait' });
    assert.strictEqual(stopped[0].data.last_seq, stopped[0].seq);
    const exits = ofType(rid, 'step.completed');
    assert.strictEqual(exits.length, 1);
    assert.strictEqual(exits[0].data.outcome, 'interrupted', 'step outcome interrupted');
    assert.ok(acts[0].seq < exits[0].seq && exits[0].seq < stopped[0].seq, 'action, step exit, stopped in order');
    assert.strictEqual(ofType(rid, 'execution.idle').length, 0, 'no execution.idle');
    assert.strictEqual(sentTo(rid).length, 0, 'nothing sent');
    assert.strictEqual(await owner(id), null, 'lease released');
    assert.strictEqual(AbortRegistry.abort(id), false, 'controller released at the chain exit');
  });

  it('hard stop during a web request with falseIntent runs no further block', async function () {
    const rid = newRequestId();
    send('/webfail', rid);
    await waitFor(() => hanging.length > 0 && ofType(rid, 'step.started').length === 1, 'the hanging call');
    const id = execIdOf(rid);
    await hardStop(id);
    await waitFor(() => ofType(rid, 'execution.stopped').length === 1, 'execution.stopped', 2000);
    await sleep(800);
    await ExecutionRecorder._drainForTests();
    assert.deepStrictEqual(ofType(rid, 'step.started').map((s) => s.data.block_id), ['webfail'], 'no step.started for the false block');
    assert.strictEqual(jumps.filter((j) => j.rid === rid).length, 0, 'no jump posted');
    const acts = ofType(rid, 'action.completed');
    assert.strictEqual(acts.length, 1);
    assert.strictEqual(acts[0].data.outcome, 'interrupted');
    assert.strictEqual(acts[0].data.error_code, 'hard_stop');
    const stopped = ofType(rid, 'execution.stopped');
    assert.strictEqual(stopped.length, 1);
    assert.strictEqual(stopped[0].data.mode, 'hard');
    assert.deepStrictEqual(stopped[0].data.interrupted_action, { index: 0, action_id: 'act_web', type: 'webrequestv2', title: 'hanging call' });
    assert.strictEqual(ofType(rid, 'execution.idle').length, 0);
    assert.strictEqual(sentTo(rid).length, 0, 'neither the next action nor the false block replied');
    assert.strictEqual(await owner(id), null, 'lease released');
  });

  it('hard stop during a v1 webrequest: interrupted + stopped, no unhandled rejection, process alive', async function () {
    const rejections = [];
    const onRejection = (reason) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    try {
      const rid = newRequestId();
      const before = hanging.length;
      send('/webv1', rid);
      await waitFor(() => hanging.length > before && ofType(rid, 'step.started').length === 1, 'the hanging v1 call');
      const id = execIdOf(rid);
      await hardStop(id);
      await waitFor(() => ofType(rid, 'execution.stopped').length === 1, 'execution.stopped', 2000);
      await sleep(800); // the aborted request's .catch has run
      await ExecutionRecorder._drainForTests();
      assert.deepStrictEqual(rejections.map((r) => String(r && r.stack || r)), [], 'no unhandled rejection');
      const acts = ofType(rid, 'action.completed');
      assert.strictEqual(acts.length, 1, 'the reply after the call never ran');
      assert.strictEqual(acts[0].data.outcome, 'interrupted');
      assert.strictEqual(acts[0].data.error_code, 'hard_stop');
      const stopped = ofType(rid, 'execution.stopped');
      assert.strictEqual(stopped[0].data.mode, 'hard');
      assert.deepStrictEqual(stopped[0].data.interrupted_action, { index: 0, action_id: 'act_web1', type: 'webrequest', title: 'hanging v1 call' });
      assert.strictEqual(sentTo(rid).length, 0);
      assert.strictEqual(await owner(id), null, 'lease released');
      const rid2 = newRequestId();
      send('/after', rid2);
      await waitFor(() => sentTo(rid2).length === 1, 'a reply after the stop');
    } finally {
      process.removeListener('unhandledRejection', onRejection);
    }
  });

  it('hard stop during askgpt: interrupted + stopped, no unhandled rejection, process alive', async function () {
    const rejections = [];
    const onRejection = (reason) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    try {
      const rid = newRequestId();
      const before = hanging.length;
      send('/askkb', rid);
      await waitFor(() => hanging.length > before && ofType(rid, 'step.started').length === 1, 'the hanging /qa call');
      const id = execIdOf(rid);
      await hardStop(id);
      await waitFor(() => ofType(rid, 'execution.stopped').length === 1, 'execution.stopped', 2000);
      await sleep(800); // the aborted request's callback has run
      await ExecutionRecorder._drainForTests();
      assert.deepStrictEqual(rejections.map((r) => String(r && r.stack || r)), [], 'no unhandled rejection');
      const acts = ofType(rid, 'action.completed');
      assert.strictEqual(acts.length, 1);
      assert.strictEqual(acts[0].data.outcome, 'interrupted');
      assert.strictEqual(acts[0].data.error_code, 'hard_stop');
      const stopped = ofType(rid, 'execution.stopped');
      assert.strictEqual(stopped[0].data.mode, 'hard');
      assert.deepStrictEqual(stopped[0].data.interrupted_action, { index: 0, action_id: 'act_ask', type: 'askgpt', title: 'ask kb' });
      assert.deepStrictEqual(ofType(rid, 'step.started').map((s) => s.data.block_id), ['askkb'], 'the false block never ran');
      assert.strictEqual(jumps.filter((j) => j.rid === rid).length, 0, 'no jump posted');
      assert.strictEqual(sentTo(rid).length, 0);
      assert.strictEqual(await owner(id), null, 'lease released');
      // the pod still serves
      const rid2 = newRequestId();
      send('/after', rid2);
      await waitFor(() => sentTo(rid2).length === 1, 'a reply after the stop');
    } finally {
      process.removeListener('unhandledRejection', onRejection);
    }
  });

  it('hard stop during an action without abort support → that action completes with hard_degraded true, then stopped before the next action', async function () {
    const rid = newRequestId();
    send('/email', rid);
    await waitFor(() => ofType(rid, 'step.started').length === 1, 'the block to start');
    await sleep(200); // the email call is in flight (800 ms)
    const id = execIdOf(rid);
    await hardStop(id);
    await waitFor(() => ofType(rid, 'execution.stopped').length === 1, 'execution.stopped', 3000);
    await sleep(500);
    await ExecutionRecorder._drainForTests();
    const acts = ofType(rid, 'action.completed');
    assert.strictEqual(acts.length, 1, 'the next action never ran');
    assert.strictEqual(acts[0].data.hard_degraded, true);
    assert.strictEqual(acts[0].data.outcome, 'success', 'the action ran to completion');
    assert.strictEqual(acts[0].data.error_code, undefined);
    const stopped = ofType(rid, 'execution.stopped');
    assert.strictEqual(stopped.length, 1);
    assert.strictEqual(stopped[0].data.mode, 'hard');
    assert.strictEqual(stopped[0].data.interrupted_action, undefined, 'nothing was interrupted');
    assert.ok(acts[0].seq < stopped[0].seq);
    assert.strictEqual(ofType(rid, 'step.completed')[0].data.outcome, 'success');
    assert.strictEqual(sentTo(rid).length, 0, 'the reply after the email was not sent');
    assert.strictEqual(ofType(rid, 'execution.idle').length, 0);
    assert.strictEqual(await owner(id), null, 'lease released');
  });

  it('ControlListener ignores malformed messages', async function () {
    assert.ok(ControlListener.isRunning());
    const id = 'exec-test-' + uuidv4();
    const ac = AbortRegistry.register(id);
    try {
      for (const bad of ['not json', '{"type":"stop"', '42', 'null', '[]', JSON.stringify({ type: 'stop', mode: 'hard' }),
        JSON.stringify({ type: 'stop', mode: 'soft', execution_id: id }), JSON.stringify({ type: 'other', execution_id: id })]) {
        await client.publish('exec:control', bad);
      }
      await sleep(200);
      assert.strictEqual(ac.signal.aborted, false, 'nothing aborted by malformed, soft or unknown messages');
      // the listener is still alive: a valid cleanup aborts
      await client.publish('exec:control', JSON.stringify({ type: 'cleanup', execution_id: id }));
      await waitFor(() => ac.signal.aborted, 'the cleanup abort', 2000);
    } finally {
      AbortRegistry.release(id, ac);
    }
  });

  it('flag off: no subscription, HttpUtils call options unchanged (signal undefined)', async function () {
    // the Redis may be shared (a live stack's tybot is subscribed too): count this process's subscriber only
    const numsub = async () => Number((await client.sendCommand(['PUBSUB', 'NUMSUB', 'exec:control']))[1]);
    assert.ok(ControlListener.isRunning(), 'subscribed with the flag on');
    const before = await numsub();
    process.env.EXECUTIONS_ENABLED = 'false';
    await startTybot();
    assert.strictEqual(ControlListener.isRunning(), false);
    assert.strictEqual(await numsub(), before - 1, 'this process dropped its exec:control subscription');

    // the axios options HttpUtils builds: no signal key without a signal, the signal with one
    const base = { url: 'http://localhost:1/x', method: 'POST', params: { a: 1 }, headers: { h: 'v' }, json: { b: 2 }, timeout: 5 };
    const expected = { url: base.url, method: 'POST', params: { a: 1 }, headers: { h: 'v' }, data: { b: 2 }, timeout: 5 };
    assert.deepStrictEqual(httpUtils.axiosOptions(Object.assign({}, base, { signal: undefined })), expected);
    assert.ok(!('signal' in httpUtils.axiosOptions(Object.assign({}, base, { signal: undefined }))));
    const ac = new AbortController();
    assert.strictEqual(httpUtils.axiosOptions(Object.assign({}, base, { signal: ac.signal })).signal, ac.signal);

    // a flow run with the flag off: the directives' calls carry no signal
    const rid = newRequestId();
    send('/whatsapp', rid);
    await waitFor(() => sentTo(rid).length === 1, 'the reply');
    await sleep(200);
    assert.ok(httpCalls.some((o) => o.url.endsWith('/modules/whatsapp/api/tiledesk/broadcast')), 'the whatsapp call went through HttpUtils');
    for (const options of httpCalls) {
      assert.strictEqual(options.signal, undefined);
      assert.ok(!('signal' in httpUtils.axiosOptions(options)));
    }
    assert.strictEqual(events(rid).length, 0);
  });

  it('abort of an execution not on this pod is a no-op', async function () {
    const rid = newRequestId();
    send('/after', rid);
    await waitFor(() => ofType(rid, 'execution.idle').length === 1, 'the chain to end');
    await ExecutionRecorder._drainForTests(); // the idle park (execution.checkpoint) goes out after idle
    const before = log.length;
    assert.strictEqual(AbortRegistry.abort('exec-not-here-' + uuidv4()), false);
    AbortRegistry.release('exec-not-here'); // unknown id: nothing to release, no throw
    await client.publish('exec:control', JSON.stringify({ type: 'stop', mode: 'hard', execution_id: 'exec-not-here-' + uuidv4() }));
    await sleep(300);
    await ExecutionRecorder._drainForTests();
    assert.strictEqual(log.length, before, 'no event emitted');
    assert.ok(ControlListener.isRunning(), 'the listener is still running');
  });
});
