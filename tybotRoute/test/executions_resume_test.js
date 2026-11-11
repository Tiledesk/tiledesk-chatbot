'use strict';

// first: sets the endpoint defaults before the engine modules load
const { listen, close, suiteEndpoints } = require('./helpers/executionsTestServer');

const assert = require('assert');
const express = require('express');
const bodyParser = require('body-parser');
const redis = require('redis');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const tybot = require('../');
const winston = require('../utils/winston');
const httpUtils = require('../utils/HttpUtils');
const tilebotService = require('../services/TilebotService');
const ExecutionRecorder = require('../executions/ExecutionRecorder');
const ControlListener = require('../executions/ControlListener');
const ResumeDriver = require('../executions/ResumeDriver');
const { ExecutionStore } = require('../executions/ExecutionStore');
const { MockBotsDataSource } = require('../engine/mock/MockBotsDataSource');
const { getConfig } = require('../executions/config');
const { setEmitterForTests } = require('../executions/TraceEmitter');
const { getTestKeys, openSealed } = require('./helpers/executionsTestKeys');
const lifecycle = require('./executions_lifecycle_bot.js').bots_data;

const PROJECT_ID = 'projectID';
const BOT_ID = 'botID';
const BOT_SECRET = 'resume-test-root-secret';
const SUB_VERSION = 'subV';
const SUB_ROOT = 'subRoot';
const SUB_ROOT_SECRET = 'resume-test-sub-root-secret';
const CHATBOT_TOKEN = 'XXX';
const SERVICE_TOKEN = 'resume-test-service-token';
// Own ports: block jumps come back to APP_PORT, bot replies land on API_PORT, the durable checkpoint on SVC_PORT.
const APP_PORT = 10091;
const API_PORT = 10092;
const SVC_PORT = 10093;

const ENV_KEYS = ['EXECUTIONS_ENABLED', 'EXECUTIONS_STATE_ENABLED', 'EXECUTIONS_STATE_HASH_KEY', 'EXECUTIONS_SEAL_PUBLIC_KEY', 'EXECUTIONS_SEAL_KID',
  'EXECUTIONS_AMQP_URL', 'AMQP_MANAGER_URL', 'CHATBOT_MAX_STEPS', 'EXECUTIONS_LEASE_MS', 'EXECUTIONS_HEARTBEAT_MS', 'EXECUTIONS_TRANSIT_MS',
  'EXECUTIONS_CHECKPOINT_TTL', 'EXECUTIONS_DATA_MAX_BYTES', 'EXECUTIONS_SERVICE_URL', 'EXECUTIONS_SERVICE_TOKEN'];

const app = express();
app.use('/', tybot.router);
app.use((err, req, res, next) => { winston.error('General error', err); });

function newRequestId(prefix = 'support-group-') {
  return prefix + PROJECT_ID + '-' + uuidv4().replace(/-/g, '');
}

const reply = (id, text) => ({ _tdActionType: 'reply', _tdActionId: id, _tdActionTitle: text, text,
  attributes: { commands: [{ type: 'message', message: { type: 'text', text } }] } });

function setAttribute(id, destination, value) {
  return { _tdActionType: 'setattribute', _tdActionId: id, _tdActionTitle: 'set ' + destination,
    operation: { operands: [{ value, isVariable: false }], operators: [] }, destination };
}

function intent(name, actions) {
  return { webhook_enabled: false, enabled: true, language: 'en', intent_display_name: name, intent_id: name, question: '', actions };
}

// the lifecycle bot (with a secret) plus: three (set s1, a wait, set s2), midwait (a wait, then a reply),
// hop (jumps to slow by name) and slow (set sl, then a reply); a subagent version subV (root subRoot)
function buildBots() {
  const data = JSON.parse(JSON.stringify(lifecycle));
  const bot = data.bots[BOT_ID];
  bot.secret = BOT_SECRET;
  // a V2 bot (no ds_version) with a connectors list: ignored by the flow, never in a minted token
  bot.connectors = [{ id: 'conn-1', fromId: 'three/act_s1', toId: 'slow' }];
  const add = (b, name, actions) => {
    const i = intent(name, actions);
    b.intents[name] = i;
    b.intents_by_intent_id[name] = i;
  };
  add(bot, 'three', [
    setAttribute('act_s1', 's1', '1'),
    { _tdActionType: 'wait', _tdActionId: 'act_w', _tdActionTitle: 'wait', millis: 700 },
    setAttribute('act_s2', 's2', '2')
  ]);
  add(bot, 'midwait', [
    { _tdActionType: 'wait', _tdActionId: 'act_mw', _tdActionTitle: 'wait', millis: 1200 },
    reply('act_mw_done', 'done')
  ]);
  add(bot, 'hop', [{ _tdActionType: 'intent', _tdActionId: 'act_goto_slow', _tdActionTitle: 'go to slow', intentName: 'slow' }]);
  add(bot, 'slow', [setAttribute('act_sl', 'sl', '1'), reply('act_slow_done', 'slow done')]);

  const sub = { webhook_enabled: false, language: 'en', name: 'sub version', type: 'tilebot', root_id: SUB_ROOT, intents: {}, intents_by_intent_id: {} };
  add(sub, 'subblock', [
    setAttribute('act_sub1', 'sub1', '1'),
    { _tdActionType: 'wait', _tdActionId: 'act_sub_w', _tdActionTitle: 'wait', millis: 300 },
    setAttribute('act_sub2', 'sub2', '2')
  ]);
  data.bots[SUB_VERSION] = sub;
  data.bots[SUB_ROOT] = { webhook_enabled: false, language: 'en', name: 'sub root', type: 'tilebot', secret: SUB_ROOT_SECRET, intents: {}, intents_by_intent_id: {} };
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

describe('Executions: resume driver (exec:control resume, self-jump, /ext startIndex)', function () {
  this.timeout(30000);

  let savedEnv;
  let appListener, apiListener, svcListener;
  let client;
  const keys = getTestKeys();
  const log = [];
  const requestIds = [];
  const durable = new Map(); // execution id -> the unsealed checkpoint the fake service returns
  const svcHits = [];
  let betweenBlocks = null;
  const originalRequest = httpUtils.request;
  const fakeEmitter = {
    emit(envelope) { log.push(envelope); },
    async flush() {},
    stats() { return { published: 0, dropped: 0, buffered: 0 }; },
    stop() {}
  };

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
  const getCp = async (id) => {
    const raw = await client.get(`exec:${id}:cp`);
    return raw ? JSON.parse(raw) : null;
  };
  const params = (rid) => client.hGetAll(`tilebot:requests:${rid}:parameters`);
  const setStop = (id, mode = 'soft') => client.set(`exec:${id}:stop`, mode, { EX: 604800 });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const resumeMsg = (id) => JSON.stringify({ type: 'resume', execution_id: id });
  /** The resumed chain's step (the last step.started of the conversation) and its actions' indices. */
  function lastStep(rid) {
    const steps = ofType(rid, 'step.started');
    const step = steps[steps.length - 1];
    const actions = ofType(rid, 'action.completed').filter((a) => a.data.step_seq === step.seq);
    return { step, indices: actions.map((a) => a.data.action_index), actions };
  }

  async function hardStop(id) {
    await client.set(`exec:${id}:stop`, 'hard', { EX: 604800 });
    await client.publish('exec:control', JSON.stringify({ type: 'stop', mode: 'hard', execution_id: id }));
  }

  function send(text, requestId, { sender = 'A-SENDER', attributes, botId = BOT_ID } = {}) {
    if (!requestIds.includes(requestId)) requestIds.push(requestId);
    const payload = {
      _id: uuidv4(),
      senderFullname: sender === '_tdinternal' ? '_tdinternal' : 'guest#367e',
      type: 'text',
      sender,
      recipient: requestId,
      text,
      id_project: PROJECT_ID,
      request: { request_id: requestId, id_project: PROJECT_ID }
    };
    if (attributes) payload.attributes = attributes;
    tilebotService.sendMessageToBot({ payload, token: CHATBOT_TOKEN }, botId, () => {});
  }

  async function settle(rid, type = 'execution.idle', n = 1) {
    await waitFor(() => ofType(rid, type).length >= n, type);
    await sleep(200);
    await ExecutionRecorder._drainForTests();
  }

  /**
   * What the service does before it publishes (Task 7): exec:req NX, status running, the seq it resumes
   * from (resume_requested_seq: the checkpoint it read, the Redis one unless given), no stop flag, transit.
   */
  async function serviceRestore(id, rid, { agentId = BOT_ID, seq } = {}) {
    const requested = seq !== undefined ? seq : (await getCp(id)).seq;
    await client.set(`exec:req:${rid}:${agentId}`, id, { NX: true, EX: 604800 });
    await client.hSet(`exec:${id}`, { status: 'running', resume_requested_seq: String(requested) });
    await client.del(`exec:${id}:stop`);
    await client.set(`exec:${id}:transit`, String(Date.now()), { PX: 120000 });
  }

  async function resume(id, rid) {
    await serviceRestore(id, rid);
    await client.publish('exec:control', resumeMsg(id));
  }

  /** /three stopped (soft) during its wait: the checkpoint points at action 2. */
  async function stoppedThree() {
    const rid = newRequestId();
    send('/three', rid);
    await waitFor(() => ofType(rid, 'step.started').length === 1, 'the block to start');
    await sleep(200); // action 1 (the wait) is running
    const id = execIdOf(rid);
    await setStop(id, 'soft');
    await settle(rid, 'execution.stopped');
    await sleep(700);
    await ExecutionRecorder._drainForTests();
    const cp = await getCp(id);
    assert.deepStrictEqual([cp.block_id, cp.action_index, cp.next_action], ['three', 2, 'run']);
    return { rid, id, cp };
  }

  before(async function () {
    savedEnv = {};
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    process.env.EXECUTIONS_ENABLED = 'true';
    process.env.EXECUTIONS_STATE_HASH_KEY = 'resume-test-hash-key';
    process.env.EXECUTIONS_SEAL_PUBLIC_KEY = keys.publicKeyPem;
    process.env.EXECUTIONS_SEAL_KID = 'kid-resume';
    process.env.EXECUTIONS_SERVICE_URL = `http://localhost:${SVC_PORT}`;
    process.env.EXECUTIONS_SERVICE_TOKEN = SERVICE_TOKEN;
    delete process.env.EXECUTIONS_AMQP_URL;
    delete process.env.AMQP_MANAGER_URL;
    delete process.env.CHATBOT_MAX_STEPS;
    delete process.env.EXECUTIONS_STATE_ENABLED;
    delete process.env.EXECUTIONS_CHECKPOINT_TTL;
    delete process.env.EXECUTIONS_DATA_MAX_BYTES;
    setEmitterForTests(fakeEmitter);
    httpUtils.request = hookedRequest;

    client = redis.createClient({ url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}` });
    await client.connect();

    const api = express();
    api.use(bodyParser.json());
    api.post('/:projectId/requests/:requestId/messages', (req, res) => res.send({ success: true }));
    api.patch('/:projectId/requests/:requestId/attributes', (req, res) => res.send({ success: true }));
    api.put('/:projectId/requests/:requestId/attributes', (req, res) => res.send({ success: true }));
    apiListener = await listen(api, API_PORT);

    const svc = express();
    svc.get('/internal/executions/:id/checkpoint', (req, res) => {
      svcHits.push({ id: req.params.id, token: req.headers['x-executions-service-token'] });
      if (req.headers['x-executions-service-token'] !== SERVICE_TOKEN) return res.status(401).send({ error: 'unauthorized' });
      const cp = durable.get(req.params.id);
      if (!cp) return res.status(404).send({ error: 'not_found' });
      return res.send(cp);
    });
    svc.post('/blackhole/ext/:botId', (req, res) => res.send({ success: true })); // accepted, never run
    svcListener = await listen(svc, SVC_PORT);

    await startTybot();
    appListener = await listen(app, APP_PORT);
  });

  after(async function () {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    httpUtils.request = originalRequest;
    await startTybot(suiteEndpoints(), lifecycle); // flag back off (unless set outside): the listener stops
    await ControlListener.stop();
    setEmitterForTests(null);
    ExecutionRecorder._resetForTests();
    const del = [];
    for (const id of new Set(log.map((e) => e.execution_id))) {
      del.push(`exec:${id}`, `exec:${id}:seq`, `exec:${id}:state`, `exec:${id}:owner`, `exec:${id}:transit`, `exec:${id}:stop`,
        `exec:${id}:cp`, `exec:${id}:resume`);
    }
    for (const rid of new Set(requestIds)) {
      del.push(`exec:req:${rid}:${BOT_ID}`, `exec:req:${rid}:${SUB_ROOT}`, `tilebot:${rid}`, `tilebot:botId_requests:${rid}`, `subagent:stack:${rid}`);
      for await (const k of client.scanIterator({ MATCH: `tilebot:requests:${rid}*`, COUNT: 1000 })) {
        if (Array.isArray(k)) del.push(...k); else del.push(k);
      }
    }
    if (del.length) await client.del(del);
    await client.quit();
    await close(appListener);
    await close(apiListener);
    await close(svcListener);
  });

  beforeEach(function () {
    ExecutionRecorder.init({ store: new ExecutionStore(client) });
  });

  afterEach(async function () {
    betweenBlocks = null;
    process.env.EXECUTIONS_ENABLED = 'true';
    if (!ControlListener.isRunning()) await startTybot();
  });

  it('resume runs the block from the checkpoint action, not from the start', async function () {
    const { rid, id, cp } = await stoppedThree();
    await client.hDel(`tilebot:requests:${rid}:parameters`, 's1'); // a re-run of action 0 would write it back
    const stepsBefore = ofType(rid, 'step.started').length;
    await resume(id, rid); // through exec:control, as the service does
    await settle(rid, 'execution.idle');
    const resumed = ofType(rid, 'execution.resumed');
    assert.strictEqual(resumed.length, 1, 'execution.resumed once');
    assert.deepStrictEqual(resumed[0].data, { from_seq: cp.seq, checkpoint_unsealed: false });
    assert.strictEqual(resumed[0].execution_id, id, 'same execution id');
    assert.strictEqual(ofType(rid, 'step.started').length, stepsBefore + 1);
    const { step, indices } = lastStep(rid);
    assert.strictEqual(step.data.block_id, 'three');
    assert.ok(resumed[0].seq < step.seq, 'resumed before the step');
    assert.deepStrictEqual(indices, [2], 'only the actions from the checkpoint ran');
    const p = await params(rid);
    assert.strictEqual(p.s2, '"2"');
    assert.strictEqual(p.s1, undefined, 'action 0 did not run again');
    assert.ok(p.chatbotToken && p.chatbot_jwt_token, 'the minted token is in the state');
    const decoded = jwt.verify(JSON.parse(p.chatbotToken), BOT_SECRET, { audience: 'https://tiledesk.com/bots/' + BOT_ID, issuer: 'https://tiledesk.com', subject: 'bot' });
    assert.strictEqual(decoded.secret, undefined, 'the bot secret is not in the token payload');
    assert.ok((await new MockBotsDataSource(buildBots()).getBotById(BOT_ID)).connectors, 'the loaded bot has a connectors list');
    assert.strictEqual(decoded.connectors, undefined, 'nor the connectors (the flow) of the bot');
    const after = await getCp(id);
    assert.deepStrictEqual([after.block_id, after.action_index], ['three', 3]);
    assert.strictEqual(await client.get(`exec:${id}:transit`), null, 'transit cleared by the /ext pod');
    assert.strictEqual(await client.get(`exec:${id}:owner`), null, 'lease released at the end');
  });

  it('rerun re-executes the interrupted action', async function () {
    const rid = newRequestId();
    send('/midwait', rid);
    await waitFor(() => ofType(rid, 'step.started').length === 1, 'the block to start');
    await sleep(150);
    const id = execIdOf(rid);
    await hardStop(id);
    await settle(rid, 'execution.stopped');
    const cp = await getCp(id);
    assert.deepStrictEqual([cp.block_id, cp.action_index, cp.next_action], ['midwait', 0, 'rerun']);
    await serviceRestore(id, rid);
    assert.strictEqual(await ControlListener._handle(resumeMsg(id)), 'started');
    await settle(rid, 'execution.idle');
    const { step, indices, actions } = lastStep(rid);
    assert.strictEqual(step.data.block_id, 'midwait');
    assert.deepStrictEqual(indices, [0, 1], 'the interrupted wait ran again, then the reply');
    assert.strictEqual(actions[0].data.outcome, 'success');
    assert.ok(actions[0].data.duration_ms >= 1100, 'the whole wait ran');
  });

  it('two concurrent resumes run the block once', async function () {
    const { rid, id, cp } = await stoppedThree();
    const stepsBefore = ofType(rid, 'step.started').length;
    await serviceRestore(id, rid);
    const results = await Promise.all([ControlListener._handle(resumeMsg(id)), ControlListener._handle(resumeMsg(id))]);
    assert.deepStrictEqual(results.slice().sort(), ['not_owner', 'started']);
    // a late duplicate (the winner already let go of its lease) does not post the jump again
    assert.strictEqual(await ControlListener._handle(resumeMsg(id)), 'not_owner');
    await settle(rid, 'execution.idle');
    await sleep(400);
    assert.strictEqual(ofType(rid, 'execution.resumed').length, 1);
    assert.strictEqual(ofType(rid, 'step.started').length, stepsBefore + 1, 'the block ran once');
    // the resumed message delivered twice: the second is dropped at /ext
    send('/#three', rid, { sender: '_tdinternal', attributes: { execution_id: id, resume: { execution_id: id, action_index: 2, next_action: 'run', from_seq: cp.seq } } });
    await sleep(600);
    await ExecutionRecorder._drainForTests();
    assert.strictEqual(ofType(rid, 'execution.resumed').length, 1);
    assert.strictEqual(ofType(rid, 'step.started').length, stepsBefore + 1, 'still once');
    assert.strictEqual(await client.get(`exec:${id}:owner`), null, 'the dropped message let go of its lease');
  });

  it('resume falls back to the durable checkpoint', async function () {
    const { rid, id, cp } = await stoppedThree();
    const parked = ofType(rid, 'execution.checkpoint');
    const sealed = parked[parked.length - 1];
    assert.strictEqual(sealed.data.cp_seq, cp.seq);
    const unsealed = openSealed(sealed.data.sealed, keys.privateKeyPem);
    assert.ok(unsealed.request_state.parameters.s1, 'the sealed copy has the state');
    durable.set(id, unsealed);
    // past the Redis TTLs: no pointer and no :parameters
    await client.del([`exec:${id}:cp`, `tilebot:requests:${rid}:parameters`]);
    svcHits.length = 0;
    await serviceRestore(id, rid, { seq: unsealed.seq });
    assert.strictEqual(await ControlListener._handle(resumeMsg(id)), 'started');
    await settle(rid, 'execution.idle');
    assert.deepStrictEqual(svcHits, [{ id, token: SERVICE_TOKEN }]);
    const resumed = ofType(rid, 'execution.resumed');
    assert.deepStrictEqual(resumed[0].data, { from_seq: cp.seq, checkpoint_unsealed: true });
    const { step, indices } = lastStep(rid);
    assert.strictEqual(step.data.block_id, 'three');
    assert.deepStrictEqual(indices, [2]);
    const p = await params(rid);
    assert.strictEqual(p.s1, '"1"', ':parameters restored from the durable copy');
    assert.strictEqual(p.s2, '"2"');
    jwt.verify(JSON.parse(p.chatbotToken), BOT_SECRET);
    assert.strictEqual(JSON.parse(p.chatbot_jwt_token), 'JWT ' + JSON.parse(p.chatbotToken));
  });

  it('no checkpoint anywhere emits execution.failed resume_failed', async function () {
    const { rid, id, cp } = await stoppedThree();
    await client.del(`exec:${id}:cp`);
    durable.delete(id);
    await serviceRestore(id, rid, { seq: cp.seq });
    assert.strictEqual(await ControlListener._handle(resumeMsg(id)), 'no_checkpoint');
    await settle(rid, 'execution.failed');
    const failed = ofType(rid, 'execution.failed');
    assert.strictEqual(failed.length, 1);
    assert.deepStrictEqual(failed[0].data.error, { code: 'resume_failed', message: 'no checkpoint' });
    assert.strictEqual(await client.get(`exec:${id}:owner`), null, 'lease released');
    assert.strictEqual(ofType(rid, 'execution.resumed').length, 0);
  });

  it('resume restores locks and clears mcp lock', async function () {
    const { rid, id, cp } = await stoppedThree();
    cp.locks = { intent: '#three', action: 'act_s2', mcp: 'locked' };
    await client.set(`exec:${id}:cp`, JSON.stringify(cp));
    const base = `tilebot:requests:${rid}`;
    await client.del([`${base}:locked`, `${base}:action:locked`]);
    await client.set(`${base}:mcp:locked`, 'true'); // left set, it makes replyToMessage return without running anything
    await serviceRestore(id, rid);
    assert.strictEqual(await ControlListener._handle(resumeMsg(id)), 'started');
    await settle(rid, 'execution.idle');
    assert.deepStrictEqual(lastStep(rid).indices, [2], 'the block ran');
    assert.strictEqual(await client.get(`${base}:locked`), '#three');
    assert.strictEqual(await client.get(`${base}:action:locked`), 'act_s2');
    assert.strictEqual(await client.get(`${base}:mcp:locked`), null);
    for (const k of [`${base}:locked`, `${base}:action:locked`]) {
      const ttl = await client.ttl(k);
      assert.ok(ttl > 0 && ttl <= 86400, k + ' restored with a TTL (TdCache default), got ' + ttl);
    }
  });

  it('resume resets step and started', async function () {
    const { rid, id } = await stoppedThree();
    const base = `tilebot:requests:${rid}`;
    await client.set(`${base}:step`, '999999');
    await client.set(`${base}:started`, '1'); // decades ago: MAX_EXECUTION_TIME long exceeded
    const t0 = Date.now();
    await serviceRestore(id, rid);
    assert.strictEqual(await ControlListener._handle(resumeMsg(id)), 'started');
    await settle(rid, 'execution.idle');
    assert.strictEqual(ofType(rid, 'execution.failed').length, 0, 'no limit hit');
    assert.deepStrictEqual(lastStep(rid).indices, [2]);
    assert.ok(Number(await client.get(`${base}:step`)) <= 2, 'the step counter starts again from the resume');
    assert.ok(Number(await client.get(`${base}:started`)) >= t0, 'started is the resume time');
    assert.ok(await client.ttl(`${base}:step`) > 0, ':step has a TTL');
    assert.ok(await client.ttl(`${base}:started`) > 0, ':started has a TTL');
  });

  it('an expired pending claim lets the next resume proceed', async function () {
    const { rid, id, cp } = await stoppedThree();
    await serviceRestore(id, rid);
    // a driver whose post went nowhere (the /ext pod died before it took the claim): short lease and transit
    const blackhole = `http://localhost:${SVC_PORT}/blackhole`;
    const cfg = Object.assign({}, getConfig(), { leaseMs: 400, transitMs: 400 });
    const r = await ResumeDriver.handle(id, { cfg, endpoint: blackhole, botsDataSource: () => new MockBotsDataSource(buildBots()) });
    assert.strictEqual(r, 'started');
    assert.strictEqual(await client.get(`exec:${id}:resume`), 'pending:' + cp.seq);
    const pttl = await client.pTTL(`exec:${id}:resume`);
    assert.ok(pttl > 0 && pttl <= 400, 'the pending claim lives max(transit, lease), got ' + pttl);
    await sleep(500);
    assert.strictEqual(await client.get(`exec:${id}:resume`), null, 'expired');
    assert.strictEqual(await ControlListener._handle(resumeMsg(id)), 'started');
    await settle(rid, 'execution.idle');
    assert.strictEqual(ofType(rid, 'execution.resumed').length, 1);
    assert.deepStrictEqual(lastStep(rid).indices, [2]);
    const ttl = await client.ttl(`exec:${id}:resume`);
    assert.ok(ttl > 86400, 'ran:<seq> keeps the long TTL, got ' + ttl);
  });

  it('a second handle after the resumed block advanced the checkpoint does nothing', async function () {
    const { rid, id } = await stoppedThree();
    await resume(id, rid);
    await settle(rid, 'execution.idle');
    const steps = ofType(rid, 'step.started').length;
    assert.strictEqual((await getCp(id)).action_index, 3, 'the resumed block moved the checkpoint on');
    // a late copy of the same publish: the lease is free (idle), the claim of the old seq ran
    assert.strictEqual(await ControlListener._handle(resumeMsg(id)), 'not_requested');
    await sleep(600);
    await ExecutionRecorder._drainForTests();
    assert.strictEqual(ofType(rid, 'step.started').length, steps, 'the block did not run twice');
    assert.strictEqual(ofType(rid, 'execution.resumed').length, 1);
    assert.strictEqual(await client.get(`exec:${id}:owner`), null);
  });

  it('no resume_requested_seq or a status other than running: the driver refuses', async function () {
    const { rid, id } = await stoppedThree();
    await serviceRestore(id, rid);
    await client.hDel(`exec:${id}`, 'resume_requested_seq');
    assert.strictEqual(await ControlListener._handle(resumeMsg(id)), 'not_requested');
    await serviceRestore(id, rid);
    await client.hSet(`exec:${id}`, 'status', 'stopped');
    assert.strictEqual(await ControlListener._handle(resumeMsg(id)), 'not_requested');
    await sleep(300);
    assert.strictEqual(ofType(rid, 'execution.resumed').length, 0);
    assert.strictEqual(ofType(rid, 'execution.failed').length, 0);
  });

  it('a destroyed or expired execution: no_checkpoint, no event, hash untouched', async function () {
    const { rid, id } = await stoppedThree();
    await client.hSet(`exec:${id}`, 'status', 'destroyed');
    assert.strictEqual(await ControlListener._handle(resumeMsg(id)), 'no_checkpoint');
    assert.strictEqual(await client.hGet(`exec:${id}`, 'status'), 'destroyed', 'never overwritten');
    const gone = 'gone-' + uuidv4();
    assert.strictEqual(await ControlListener._handle(resumeMsg(gone)), 'no_checkpoint');
    assert.strictEqual(await client.exists(`exec:${gone}`), 0, 'no hash created');
    await sleep(300);
    await ExecutionRecorder._drainForTests();
    assert.strictEqual(ofType(rid, 'execution.failed').length, 0);
    assert.strictEqual(log.filter((e) => e.execution_id === gone).length, 0);
  });

  it('resume inside a subagent re-pushes the stack with fresh tokens', async function () {
    const { rid, id, cp } = await stoppedThree();
    // the run was inside the subagent: its version, its block, the caller's frames (no tokens)
    Object.assign(cp, {
      agent_version: SUB_VERSION,
      block_id: 'subblock',
      action_index: 2,
      next_action_type: 'setattribute',
      agent_stack: [{ agent_id: BOT_ID, agent_version: BOT_ID, return_block: '#slow' }],
      subagent_stack: [{ parentId: BOT_ID, parentParticipantId: BOT_ID, nextBlock: { intentName: '#slow' } }]
    });
    await client.set(`exec:${id}:cp`, JSON.stringify(cp));
    await client.del(`subagent:stack:${rid}`); // expired (24 h)
    await client.hDel(`exec:${id}`, 'agent_stack');
    await client.set(`exec:req:${rid}:${SUB_ROOT}`, id, { EX: 604800 });
    await serviceRestore(id, rid);
    assert.strictEqual(await ControlListener._handle(resumeMsg(id)), 'started');
    await settle(rid, 'execution.idle');
    const resumed = ofType(rid, 'execution.resumed')[0];
    assert.strictEqual(resumed.agent_version, SUB_VERSION);
    assert.strictEqual(resumed.agent_id, SUB_ROOT);
    const { step, indices } = lastStep(rid);
    assert.strictEqual(step.data.block_id, 'subblock');
    assert.deepStrictEqual(indices, [2]);
    const frames = await client.lRange(`subagent:stack:${rid}`, 0, -1);
    assert.strictEqual(frames.length, 1);
    const frame = JSON.parse(frames[0]);
    assert.deepStrictEqual(Object.keys(frame).sort(), ['nextBlock', 'parentId', 'parentParticipantId', 'parentToken']);
    const parent = jwt.verify(frame.parentToken, BOT_SECRET, { audience: 'https://tiledesk.com/bots/' + BOT_ID, subject: 'bot' });
    assert.ok(parent.jti);
    assert.ok(await client.ttl(`subagent:stack:${rid}`) > 86000, '24 h TTL');
    const p = await params(rid);
    jwt.verify(JSON.parse(p.chatbotToken), SUB_ROOT_SECRET, { audience: 'https://tiledesk.com/bots/' + SUB_ROOT, subject: 'bot' });
    assert.deepStrictEqual(JSON.parse(await client.hGet(`exec:${id}`, 'agent_stack')), cp.agent_stack, 'agent_stack back on the hash');
  });

  it('missing agent version emits execution.failed resume_failed', async function () {
    const { rid, id, cp } = await stoppedThree();
    cp.agent_version = 'ghostBot';
    await client.set(`exec:${id}:cp`, JSON.stringify(cp));
    await serviceRestore(id, rid);
    assert.strictEqual(await ControlListener._handle(resumeMsg(id)), 'bot_gone');
    await settle(rid, 'execution.failed');
    const failed = ofType(rid, 'execution.failed');
    assert.strictEqual(failed.length, 1);
    assert.deepStrictEqual(failed[0].data.error, { code: 'resume_failed', message: 'agent version not found' });
    assert.strictEqual(ofType(rid, 'execution.resumed').length, 0);
    assert.strictEqual(await client.get(`exec:${id}:owner`), null, 'lease released');
  });

  it('stop while a jump is in transit resumes at the jump target', async function () {
    const rid = newRequestId();
    betweenBlocks = async (message) => {
      if (message.payload.text !== '/slow') return;
      betweenBlocks = null;
      await setStop(execIdOf(rid), 'soft'); // set while the jump is in transit
    };
    send('/hop', rid);
    await settle(rid, 'execution.stopped');
    const id = execIdOf(rid);
    assert.deepStrictEqual(ofType(rid, 'step.started').map((s) => s.data.block_id), ['hop']);
    const stopped = ofType(rid, 'execution.stopped')[0];
    const cp = await getCp(id);
    assert.strictEqual(cp.pending_jump, '/slow');
    assert.strictEqual(cp.action_index, 0);
    assert.strictEqual(cp.next_action, 'run');
    assert.strictEqual(cp.seq, stopped.seq, 'written with the seq of execution.stopped');
    const parked = ofType(rid, 'execution.checkpoint');
    assert.strictEqual(parked[parked.length - 1].data.cp_seq, stopped.seq, 'sealed too');
    await serviceRestore(id, rid);
    assert.strictEqual(await ControlListener._handle(resumeMsg(id)), 'started');
    await settle(rid, 'execution.idle');
    const { step, indices } = lastStep(rid);
    assert.strictEqual(step.data.block_id, 'slow');
    assert.deepStrictEqual(indices, [0, 1]);
    assert.strictEqual((await params(rid)).sl, '"1"');
  });

  it('a user message with attributes.resume does not bypass a stop', async function () {
    const { rid, id, cp } = await stoppedThree();
    const stepsBefore = ofType(rid, 'step.started').length;
    send('/three', rid, { attributes: { execution_id: id, resume: { execution_id: id, action_index: 2, next_action: 'run', from_seq: cp.seq } } });
    await settle(rid, 'execution.message_while_stopped');
    assert.strictEqual(ofType(rid, 'step.started').length, stepsBefore);
    assert.strictEqual(ofType(rid, 'execution.resumed').length, 0);
    // nor does an internal one: the stop flag is still set
    send('/#three', rid, { sender: '_tdinternal', attributes: { execution_id: id, resume: { execution_id: id, action_index: 2, next_action: 'run', from_seq: cp.seq } } });
    await sleep(600);
    await ExecutionRecorder._drainForTests();
    assert.strictEqual(ofType(rid, 'step.started').length, stepsBefore);
    assert.strictEqual(ofType(rid, 'execution.resumed').length, 0);
  });

  it('a resume message for another execution never runs the block from its start', async function () {
    const rid = newRequestId();
    const ghost = 'ghost-' + uuidv4();
    send('/#three', rid, { sender: '_tdinternal', attributes: { execution_id: ghost, resume: { execution_id: ghost, action_index: 2, next_action: 'run', from_seq: 9 } } });
    await sleep(800);
    await ExecutionRecorder._drainForTests();
    assert.strictEqual(ofType(rid, 'step.started').length, 0, 'nothing ran');
    assert.strictEqual((await params(rid)).s1, undefined);
    assert.strictEqual(ofType(rid, 'execution.resumed').length, 0);
  });

  it('flag off: resume messages are ignored', async function () {
    const { rid, id, cp } = await stoppedThree();
    await serviceRestore(id, rid);
    process.env.EXECUTIONS_ENABLED = 'false';
    await startTybot(); // the listener stops
    assert.strictEqual(ControlListener.isRunning(), false);
    const n = events(rid).length;
    await client.publish('exec:control', resumeMsg(id));
    assert.strictEqual(await ResumeDriver.handle(id, {}), 'disabled');
    await sleep(800);
    assert.strictEqual(events(rid).length, n, 'nothing emitted');
    assert.strictEqual(await client.get(`exec:${id}:owner`), null, 'no lease taken');
    assert.deepStrictEqual(await getCp(id), cp, 'checkpoint untouched');
    // attributes.resume on a message has no effect: the block runs from its first action, as in 3.0.5
    await client.hDel(`tilebot:requests:${rid}:parameters`, 's1');
    send('/#three', rid, { sender: '_tdinternal', attributes: { execution_id: id, resume: { execution_id: id, action_index: 2, next_action: 'run', from_seq: cp.seq } } });
    await waitFor(async () => (await params(rid)).s2 === '"2"', 'the block to run');
    assert.strictEqual((await params(rid)).s1, '"1"', 'action 0 ran');
    assert.strictEqual(events(rid).length, n, 'still nothing emitted');
  });
});
