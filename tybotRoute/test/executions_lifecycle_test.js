'use strict';

// first: sets the endpoint defaults before the engine modules load
const { listen, close, suiteEndpoints } = require('./helpers/executionsTestServer');

const assert = require('assert');
const crypto = require('crypto');
const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const tybot = require('../');
const winston = require('../utils/winston');
const tilebotService = require('../services/TilebotService');
const WriteTap = require('../executions/WriteTap');
const ExecutionRecorder = require('../executions/ExecutionRecorder');
const { detectTrigger } = require('../executions/trigger');
const { ExecutionStore } = require('../executions/ExecutionStore');
const { setEmitterForTests } = require('../executions/TraceEmitter');
const Sealer = require('../executions/Sealer');
const StateDiff = require('../executions/StateDiff');
const { TiledeskRequestVariables } = require('../tiledeskChatbotPlugs/TiledeskRequestVariables');
const { TiledeskChatbot } = require('../engine/TiledeskChatbot');
const { MockBotsDataSource } = require('../engine/mock/MockBotsDataSource');
const bots_data = require('./executions_lifecycle_bot.js').bots_data;

const PROJECT_ID = 'projectID';
const NO_CAPTURE_PROJECT_ID = 'projectNoCapture';
const BOT_ID = 'botID';
const CHATBOT_TOKEN = 'XXX';
// Own ports, not the suite's 10001/10002: a failing test elsewhere can leave those bound.
const APP_PORT = 10011;   // this file's TILEBOT_ENDPOINT: block jumps come back here
const API_PORT = 10012;   // this file's API_ENDPOINT: the bot replies land here
const FAIL_PORT = 10003;  // web request target, always 500

const ENV_KEYS = ['EXECUTIONS_ENABLED', 'EXECUTIONS_STATE_ENABLED', 'EXECUTIONS_STATE_HASH_KEY', 'EXECUTIONS_SEAL_PUBLIC_KEY', 'EXECUTIONS_SEAL_KID',
  'EXECUTIONS_AMQP_URL', 'AMQP_MANAGER_URL', 'CHATBOT_MAX_STEPS'];

const app = express();
app.use('/', tybot.router);
app.use((err, req, res, next) => { winston.error('General error', err); });

function newRequestId(projectId = PROJECT_ID) {
  return 'support-group-' + projectId + '-' + uuidv4().replace(/-/g, '');
}


function startTybot(endpoints = { TILEBOT_ENDPOINT: `http://localhost:${APP_PORT}`, API_ENDPOINT: `http://localhost:${API_PORT}` }) {
  return new Promise((resolve) => {
    tybot.startApp({
      bots: bots_data,
      TILEBOT_ENDPOINT: endpoints.TILEBOT_ENDPOINT,
      API_ENDPOINT: endpoints.API_ENDPOINT,
      API_URL: endpoints.API_ENDPOINT, // mandatory since 3.0.6 (startApp)
      REDIS_HOST: process.env.REDIS_HOST,
      REDIS_PORT: process.env.REDIS_PORT,
      REDIS_PASSWORD: process.env.REDIS_PASSWORD
    }, () => resolve());
  });
}

async function waitFor(pred, what, timeoutMs = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timed out waiting for ' + what);
}

describe('Executions lifecycle (recorder + engine hooks)', function () {
  this.timeout(30000);

  let savedEnv;
  let appListener, apiListener, failListener;
  let client;
  const log = [];          // events and proxied redis calls, in order
  const replies = [];      // bot messages received by the fake API
  const requestIds = [];
  const fakeEmitter = {
    emit(envelope) { log.push({ event: envelope }); },
    async flush() {},
    stats() { return { published: 0, dropped: 0, buffered: 0 }; },
    stop() {}
  };

  const events = (requestId) => log.filter((e) => e.event && e.event.request_id === requestId).map((e) => e.event);
  const ofType = (requestId, type) => events(requestId).filter((e) => e.type === type);

  function send(text, requestId, extra = {}) {
    requestIds.push(requestId);
    const projectId = requestId.split('-')[2];
    const request = {
      payload: Object.assign({
        _id: uuidv4(),
        senderFullname: 'guest#367e',
        type: 'text',
        sender: 'A-SENDER',
        recipient: requestId,
        text: text,
        id_project: projectId,
        request: { request_id: requestId }
      }, extra),
      token: CHATBOT_TOKEN
    };
    tilebotService.sendMessageToBot(request, BOT_ID, () => {});
  }

  /** Waits until the request's events stop changing for quietMs. */
  async function settle(requestId, quietMs = 500) {
    await ExecutionRecorder._drainForTests();
    let n = -1;
    let since = Date.now();
    await waitFor(() => {
      const m = events(requestId).length;
      if (m !== n) { n = m; since = Date.now(); return false; }
      return Date.now() - since >= quietMs;
    }, 'events of ' + requestId + ' to settle');
  }

  async function scanExec() {
    const keys = [];
    for await (const k of client.scanIterator({ MATCH: 'exec:*', COUNT: 1000 })) {
      if (Array.isArray(k)) keys.push(...k); else keys.push(k);
    }
    return keys.sort();
  }

  before(async function () {
    savedEnv = {};
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.EXECUTIONS_ENABLED = 'true';
    process.env.EXECUTIONS_STATE_HASH_KEY = 'lifecycle-test-hash-key';
    process.env.EXECUTIONS_SEAL_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    process.env.EXECUTIONS_SEAL_KID = 'kid-lifecycle';
    delete process.env.EXECUTIONS_AMQP_URL;
    delete process.env.AMQP_MANAGER_URL;
    delete process.env.CHATBOT_MAX_STEPS;
    delete process.env.EXECUTIONS_STATE_ENABLED; // default: on when EXECUTIONS_ENABLED
    setEmitterForTests(fakeEmitter);

    client = redis.createClient({ url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}` });
    await client.connect();

    const api = express();
    api.use(bodyParser.json());
    api.post('/:projectId/requests/:requestId/messages', (req, res) => {
      res.send({ success: true });
      replies.push({ requestId: req.params.requestId, message: req.body });
    });
    api.patch('/:projectId/requests/:requestId/attributes', (req, res) => {
      res.send({ success: true });
      replies.push({ requestId: req.params.requestId, attributesPatch: req.body });
    });
    apiListener = await listen(api, API_PORT);

    const fail = express();
    fail.get('/fail', (req, res) => res.status(500).send({ error: 'boom' }));
    fail.get('/ok', (req, res) => res.status(200).send({ ok: true }));
    failListener = await listen(fail, FAIL_PORT);

    await startTybot();
    appListener = await listen(app, APP_PORT);
  });

  after(async function () {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    // put the engine's module state (endpoints) back to what the other test files expect
    await startTybot(suiteEndpoints());
    setEmitterForTests(null);
    ExecutionRecorder._resetForTests();
    const execIds = new Set(log.filter((e) => e.event).map((e) => e.event.execution_id));
    const del = [`exec:policy:${NO_CAPTURE_PROJECT_ID}`];
    for (const id of execIds) del.push(`exec:${id}`, `exec:${id}:seq`, `exec:${id}:state`);
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

  it('flag off: no events, no exec:* keys, no recorder Redis call', async function () {
    process.env.EXECUTIONS_ENABLED = 'false';
    try {
      useProxiedStore();
      const keysBefore = await scanExec();
      const logBefore = log.length;
      const rid = newRequestId();
      send('/start', rid);
      await waitFor(() => replies.some((r) => r.requestId === rid && r.message), 'the done reply');
      const reply = replies.find((r) => r.requestId === rid && r.message).message;
      assert.strictEqual(reply.attributes.commands[0].message.text, 'done');
      await new Promise((r) => setTimeout(r, 300));
      assert.strictEqual(log.length, logBefore, 'no events emitted and no call on the recorder store');
      assert.deepStrictEqual(await scanExec(), keysBefore, 'no exec:* keys written');
      assert.ok(!replies.some((r) => r.requestId === rid && r.attributesPatch), 'no execution_id patch');
    } finally {
      process.env.EXECUTIONS_ENABLED = 'true';
      await startTybot(); // back to the store startApp wires
    }
  });

  describe('a conversation start -> check -> after', function () {
    let rid;
    before(async function () {
      rid = newRequestId();
      send('/start', rid);
      await waitFor(() => replies.some((r) => r.requestId === rid && r.message), 'the done reply');
      await waitFor(() => ofType(rid, 'step.completed').length === 3, 'three step.completed');
      await settle(rid);
    });

    it('start emits execution.started then step.started (keyframe, manifest has the message_in keys)', function () {
      const evs = events(rid);
      assert.strictEqual(evs[0].type, 'execution.started');
      const started = evs[0];
      assert.deepStrictEqual(started.data.trigger, { type: 'widget', source_id: null, start_point_id: null });
      assert.strictEqual(started.data.agent_name, 'Executions lifecycle bot');
      assert.strictEqual(started.data.test, true);
      assert.strictEqual(started.agent_id, BOT_ID);
      assert.strictEqual(started.agent_version, BOT_ID);
      assert.strictEqual(started.id_project, PROJECT_ID);

      const step = evs[1];
      assert.strictEqual(step.type, 'step.started');
      assert.strictEqual(step.data.step_seq, step.seq);
      assert.strictEqual(step.data.block_id, 'start');
      assert.strictEqual(step.data.block_name, 'start');
      assert.strictEqual(step.data.state_keyframe, true);
      const manifestKeys = step.data.state_manifest.map((m) => m.key);
      assert.ok(manifestKeys.includes('lastUserText'));
      assert.ok(manifestKeys.includes('last_user_text'));
      const m = step.data.state_manifest.find((x) => x.key === 'lastUserText');
      assert.strictEqual(m.type, 'string');
      assert.strictEqual(m.reserved, true);
      assert.match(m.hash, /^[0-9a-f]{64}$/);
      assert.ok(!('value' in m));
      const lut = step.data.outside_changes.find((c) => c.key === 'lastUserText');
      assert.strictEqual(lut.by, 'message_in');
      assert.strictEqual(lut.op, 'add');
      assert.strictEqual(step.data.state_vars, manifestKeys.length);
      // the chatbot token is a secret: name and op only
      const tok = step.data.state_manifest.find((x) => x.key === 'chatbotToken');
      assert.deepStrictEqual({ type: tok.type, hash: tok.hash }, { type: 'secret', hash: null });
      assert.strictEqual(step.data.sealed_state.alg, 'RSA-OAEP-256+A256GCM');
      assert.strictEqual(step.data.sealed_state.kid, 'kid-lifecycle');
    });

    it('writes execution_id into the request attributes', async function () {
      const execId = events(rid)[0].execution_id;
      await waitFor(() => replies.some((r) => r.requestId === rid && r.attributesPatch), 'the attributes patch');
      const patch = replies.find((r) => r.requestId === rid && r.attributesPatch).attributesPatch;
      assert.deepStrictEqual(patch, { execution_id: execId });
    });

    it('set attribute deltas are attributed to their action ids', function () {
      const acts = ofType(rid, 'action.completed');
      const total = acts.find((a) => a.data.action_id === 'act_total');
      const status = acts.find((a) => a.data.action_id === 'act_status');
      assert.strictEqual(total.data.action_index, 0);
      assert.strictEqual(total.data.type, 'setattribute');
      assert.strictEqual(total.data.title, 'set order_total');
      assert.strictEqual(total.data.outcome, 'success');
      assert.ok(total.data.duration_ms >= 0);
      assert.deepStrictEqual(total.data.state_delta.map((c) => [c.key, c.op, c.by, c.reserved]), [['order_total', 'add', 'act_total', false]]);
      assert.match(total.data.state_delta[0].hash_after, /^[0-9a-f]{64}$/);
      assert.ok(total.data.sealed_state && total.data.sealed_state.ct);
      assert.strictEqual(status.data.action_index, 1);
      assert.deepStrictEqual(status.data.state_delta.map((c) => [c.key, c.op, c.by, c.type]), [['status', 'add', 'act_status', 'string']]);
      const startStep = ofType(rid, 'step.started').find((s) => s.data.block_id === 'start');
      assert.strictEqual(total.data.step_seq, startStep.seq);
      assert.strictEqual(status.data.step_seq, startStep.seq);
    });

    it('three step.completed; exactly one execution.idle, at the end of the chain; seqs strictly increase', function () {
      const evs = events(rid);
      assert.strictEqual(ofType(rid, 'step.completed').length, 3);
      assert.strictEqual(ofType(rid, 'execution.started').length, 1);
      assert.strictEqual(ofType(rid, 'execution.idle').length, 1, 'no idle mid-chain at the jumps');
      // the parked checkpoint (Phase 3) follows the idle; apart from it, idle is the last event
      const flow = evs.filter((e) => e.type !== 'execution.checkpoint');
      assert.strictEqual(flow[flow.length - 1].type, 'execution.idle');
      assert.strictEqual(flow[flow.length - 1].data.last_seq, flow[flow.length - 1].seq);
      assert.ok(ofType(rid, 'execution.checkpoint').every((c) => c.seq > flow[flow.length - 1].seq));
      for (let i = 1; i < evs.length; i++) {
        assert.ok(evs[i].seq > evs[i - 1].seq, `seq ${evs[i].seq} after ${evs[i - 1].seq}`);
      }
      assert.strictEqual(new Set(evs.map((e) => e.execution_id)).size, 1, 'one execution');
      const startDone = ofType(rid, 'step.completed').find((s) => s.data.step_seq === ofType(rid, 'step.started')[0].seq);
      assert.strictEqual(startDone.data.outcome, 'success');
      assert.strictEqual(startDone.data.changed_keys, 2);
      assert.ok(startDone.data.state_vars >= 2);
    });

    it('writes exec:{id}:state at block exit', async function () {
      const execId = events(rid)[0].execution_id;
      const saved = JSON.parse(await client.get(`exec:${execId}:state`));
      assert.ok(saved.raw && saved.raw.status === '"new"');
      assert.ok(Number.isInteger(saved.step_seq));
      assert.ok(Number.isInteger(saved.blocks_since_kf));
    });
  });

  it('web request false exit maps to failure_condition', async function () {
    const rid = newRequestId();
    send('/start', rid);
    await waitFor(() => ofType(rid, 'execution.idle').length > 0 && ofType(rid, 'step.completed').length === 3, 'the chain to end');
    await settle(rid);
    const web = ofType(rid, 'action.completed').find((a) => a.data.action_id === 'act_fail_request');
    assert.strictEqual(web.data.type, 'webrequestv2');
    assert.strictEqual(web.data.outcome, 'failure_condition');
    assert.strictEqual(web.data.exit_taken, 'false');
    assert.deepStrictEqual(web.data.state_delta.map((c) => [c.key, c.by]), [['status_code', 'act_fail_request']]);
    const checkStep = ofType(rid, 'step.started').find((s) => s.data.block_id === 'check');
    const checkDone = ofType(rid, 'step.completed').find((s) => s.data.step_seq === checkStep.seq);
    assert.strictEqual(checkDone.data.outcome, 'failure_condition');
    assert.strictEqual(checkDone.data.exit_taken, 'false');
    const jump = ofType(rid, 'action.completed').find((a) => a.data.action_id === 'act_goto_check');
    assert.strictEqual(jump.data.exit_taken, 'jump');
    assert.strictEqual(ofType(rid, 'action.completed').filter((a) => a.data.action_id === 'act_fail_request').length, 1, 'afterAction is idempotent');
  });

  for (const [block, outcome, exit] of [['same_ok', 'success', 'true'], ['same_fail', 'failure_condition', 'false']]) {
    it(`web request, true and false exits on the same block: ${block} records ${outcome} / ${exit}`, async function () {
      const rid = newRequestId();
      send('/' + block, rid);
      await waitFor(() => ofType(rid, 'execution.idle').length > 0 && ofType(rid, 'step.completed').length === 2, 'the chain to end');
      await settle(rid);
      const web = ofType(rid, 'action.completed').find((a) => a.data.action_id === 'act_' + block);
      assert.deepStrictEqual([web.data.outcome, web.data.exit_taken], [outcome, exit]);
      const step = ofType(rid, 'step.started').find((s) => s.data.block_id === block);
      const done = ofType(rid, 'step.completed').find((s) => s.data.step_seq === step.seq);
      assert.deepStrictEqual([done.data.outcome, done.data.exit_taken], [outcome, exit]);
    });
  }

  it('a jump after the conversation closed during a wait records no new execution; a new user message starts one (B2)', async function () {
    const rid = newRequestId();
    send('/wait_hop', rid);
    await waitFor(() => ofType(rid, 'step.started').some((s) => s.data.block_id === 'wait_hop'), 'the wait block to start');
    const id = ofType(rid, 'execution.started')[0].execution_id;
    // the server closes the conversation; ingest projects it: terminal status, exec:req deleted
    await client.hSet(`exec:${id}`, 'status', 'completed');
    await client.del(`exec:req:${rid}:${BOT_ID}`);
    // the flow itself goes on as before: the wait ends, the jump runs the after block and replies
    await waitFor(() => replies.some((r) => r.requestId === rid && r.message && r.message.text === 'done'), 'the after block reply', 8000);
    await settle(rid);
    assert.deepStrictEqual([...new Set(events(rid).map((e) => e.execution_id))], [id], 'every event is the closed execution\'s');
    assert.strictEqual(ofType(rid, 'execution.started').length, 1, 'no phantom execution.started');
    assert.ok(!ofType(rid, 'step.started').some((s) => s.data.block_id === 'after'), 'the continuation is not recorded');
    assert.strictEqual(await client.get(`exec:req:${rid}:${BOT_ID}`), null, 'no exec:req written');

    // a real new user message on the reopened conversation starts a new execution
    send('/start', rid);
    await waitFor(() => ofType(rid, 'execution.started').length === 2, 'the new execution');
    await settle(rid);
    const next = ofType(rid, 'execution.started')[1];
    assert.notStrictEqual(next.execution_id, id);
    assert.strictEqual(await client.get(`exec:req:${rid}:${BOT_ID}`), next.execution_id);
  });

  it('/start{"a":1} records a as jump_params in outside_changes', async function () {
    const rid = newRequestId();
    send('/start{"a":1}', rid);
    await waitFor(() => ofType(rid, 'step.started').length > 0, 'step.started');
    const step = ofType(rid, 'step.started')[0];
    const a = step.data.outside_changes.find((c) => c.key === 'a');
    assert.strictEqual(a.by, 'jump_params');
    assert.strictEqual(a.type, 'number');
    assert.strictEqual(step.data.outside_changes.find((c) => c.key === 'lastUserText').by, 'message_in');
    await settle(rid);
  });

  it('capture_data "false" seals no state values (manifest and hashes stay)', async function () {
    await client.hSet(`exec:policy:${NO_CAPTURE_PROJECT_ID}`, 'capture_data', 'false');
    const rid = newRequestId(NO_CAPTURE_PROJECT_ID);
    send('/count', rid, { request: { request_id: rid, attributes: { payload: { x: 1 } } } });
    await waitFor(() => ofType(rid, 'execution.idle').length > 0, 'execution.idle');
    const evs = events(rid);
    assert.ok(!('sealed_trigger_payload' in evs[0].data));
    const step = ofType(rid, 'step.started')[0];
    assert.ok(step.data.state_manifest.length > 0);
    assert.ok(!('sealed_state' in step.data));
    for (const a of ofType(rid, 'action.completed')) {
      assert.ok(!('sealed_state' in a.data));
      assert.match(a.data.state_delta[0].hash_after, /^[0-9a-f]{64}$/);
    }
  });

  it('seals the trigger payload, without secrets, when capture is on', async function () {
    const rid = newRequestId();
    send('/count', rid, { request: { request_id: rid, attributes: { payload: { x: 1, api_key: 'k' } } } });
    await waitFor(() => ofType(rid, 'execution.idle').length > 0, 'execution.idle');
    const started = ofType(rid, 'execution.started')[0];
    assert.strictEqual(started.data.sealed_trigger_payload.alg, 'RSA-OAEP-256+A256GCM');
  });

  it('an automation run ends with execution.ended completed', async function () {
    // axios.request, not axios.post: analytics_test.js stubs axios.post for the whole run
    const res = await axios.request({ method: 'post', url: `http://localhost:${APP_PORT}/block/${PROJECT_ID}/${BOT_ID}/count`, data: { async: true, token: CHATBOT_TOKEN } });
    assert.strictEqual(res.status, 200);
    await waitFor(() => log.some((e) => e.event && e.event.type === 'execution.ended' && e.event.request_id.startsWith('automation-request-' + PROJECT_ID)), 'execution.ended');
    const ended = log.find((e) => e.event && e.event.type === 'execution.ended').event;
    requestIds.push(ended.request_id);
    const evs = events(ended.request_id);
    assert.strictEqual(evs[0].data.trigger.type, 'automation');
    assert.deepStrictEqual(ended.data, { end_reason: 'completed' });
    assert.ok(!evs.some((e) => e.type === 'execution.idle'));
    assert.strictEqual(await client.hGet(`exec:${ended.execution_id}`, 'status'), 'completed');
    assert.ok(!replies.some((r) => r.requestId === ended.request_id && r.attributesPatch), 'no attributes patch for automations');
  });

  describe('with CHATBOT_MAX_STEPS=2', function () {
    before(async function () {
      process.env.CHATBOT_MAX_STEPS = '2';
      await startTybot();
    });
    after(async function () {
      process.env.CHATBOT_MAX_STEPS = '1000'; // index.js keeps MAX_STEPS in module state: put the default back
      await startTybot();
      delete process.env.CHATBOT_MAX_STEPS;
    });

    it('max steps exceeded emits execution.failed max_steps_exceeded', async function () {
      const rid = newRequestId();
      send('/start', rid);
      await waitFor(() => ofType(rid, 'execution.failed').length > 0, 'execution.failed');
      await settle(rid);
      const failed = ofType(rid, 'execution.failed')[0];
      assert.strictEqual(failed.data.error_code, 'max_steps_exceeded');
      assert.strictEqual(failed.data.message, 'Anomaly detection. MAX ACTIONS (2) exeeded.');
      const step = ofType(rid, 'step.started')[0];
      assert.strictEqual(failed.data.step_seq, step.seq);
      assert.strictEqual(ofType(rid, 'action.completed').length, 2);
      assert.strictEqual(ofType(rid, 'step.completed')[0].data.outcome, 'error');
      assert.strictEqual(ofType(rid, 'execution.idle').length, 0);
      assert.strictEqual(await client.hGet(`exec:${failed.execution_id}`, 'status'), 'failed');
    });

    it('max_steps closes the open step with outcome error', async function () {
      const rid = newRequestId();
      send('/start', rid);
      await waitFor(() => ofType(rid, 'execution.failed').length > 0, 'execution.failed');
      await settle(rid);
      const failed = ofType(rid, 'execution.failed')[0];
      const done = ofType(rid, 'step.completed').filter((e) => e.data.step_seq === failed.data.step_seq);
      // closed by the failure itself, before execution.failed: not left to the runtime error message the
      // engine sends next (whose directive may never reach the end of the chain)
      assert.strictEqual(done.length, 1, 'the step is closed once');
      assert.strictEqual(done[0].data.outcome, 'error');
      assert.ok(done[0].seq < failed.seq, 'step.completed (' + done[0].seq + ') before execution.failed (' + failed.seq + ')');
    });
  });

  it('TiledeskRequestVariables.set(name, v, cb) stays inside the action chain', async function () {
    const vars = new TiledeskRequestVariables('r-cb', { hset: async () => {} }, {});
    const seen = await new Promise((resolve) => {
      WriteTap.runAction({ executionId: 'e', stepSeq: 1, actionIndex: 0, actionId: 'a-cb', requestId: 'r-cb' }, () => {
        vars.set('k', 'v', () => resolve(WriteTap.current()));
      });
    });
    assert.strictEqual(seen.actionId, 'a-cb');
    assert.strictEqual(seen.writes.get('k'), 'set');
  });

  it('a throwing or rejecting execute call is recorded as error and still throws', async function () {
    const store = new ExecutionStore(client);
    const open = async () => {
      const rid = newRequestId();
      requestIds.push(rid);
      const ctx = await ExecutionRecorder.onMessageIn({ message: { request: { request_id: rid } }, bot: { name: 'b' }, botId: BOT_ID, requestId: rid, projectId: PROJECT_ID, token: CHATBOT_TOKEN, store });
      await ExecutionRecorder.blockEntry(ctx, { blockId: 'blk', blockName: 'blk' });
      return { rid, ctx };
    };
    const directive = { name: 'code', action: { _tdActionId: 'act_boom' } };

    const sync = await open();
    assert.throws(() => ExecutionRecorder.runAction(sync.ctx, { index: 0, directive }, () => { throw new Error('boom'); }), /boom/);
    await waitFor(() => ofType(sync.rid, 'execution.idle').length === 1, 'idle after the throw');

    const async_ = await open();
    await assert.rejects(ExecutionRecorder.runAction(async_.ctx, { index: 0, directive }, async () => { throw new Error('later'); }), /later/);
    await waitFor(() => ofType(async_.rid, 'execution.idle').length === 1, 'idle after the rejection');

    for (const { rid } of [sync, async_]) {
      const act = ofType(rid, 'action.completed')[0];
      assert.deepStrictEqual([act.data.outcome, act.data.error_code, act.data.exit_taken], ['error', 'action_error', null]);
      assert.strictEqual(ofType(rid, 'step.completed')[0].data.outcome, 'error');
    }
  });

  it('every hook is a no-op on a null ctx', async function () {
    assert.strictEqual(await ExecutionRecorder.blockEntry(null, { blockId: 'x' }), null);
    assert.strictEqual(await ExecutionRecorder.afterAction(null, { index: 0 }), null);
    assert.strictEqual(await ExecutionRecorder.blockExit(null), null);
    assert.strictEqual(await ExecutionRecorder.endOfChain(null), null);
    assert.strictEqual(await ExecutionRecorder.failed(null, { error_code: 'x' }), null);
    assert.strictEqual(ExecutionRecorder.runAction(null, { index: 0 }, () => 7), 7);
    assert.strictEqual(await ExecutionRecorder.withScope(null, 'message_in', async () => 8), 8);
    const theend = () => 9;
    assert.strictEqual(ExecutionRecorder.wrapTheEnd(null, theend), theend);
  });

  it('detectTrigger', function () {
    assert.deepStrictEqual(detectTrigger({ request: {} }, 'automation-request-p-1', 'b'), { type: 'automation', source_id: null, start_point_id: null });
    assert.deepStrictEqual(detectTrigger({ request: { attributes: { start_type: 'webhook', webhook_id: 'w1' } } }, 'support-group-p-1', 'b'), { type: 'webhook', source_id: 'w1', start_point_id: null });
    assert.deepStrictEqual(detectTrigger({ request: { attributes: { start_type: 'scheduled', chatbot_id: 'c1' } }, attributes: { action: '#sp1' } }, 'support-group-p-1', 'b'), { type: 'scheduled', source_id: 'c1', start_point_id: 'sp1' });
    assert.deepStrictEqual(detectTrigger({ request: { channel: { name: 'whatsapp' } } }, 'support-group-p-1', 'b'), { type: 'channel', source_id: 'whatsapp', start_point_id: null });
    assert.deepStrictEqual(detectTrigger({ request: { channel: { name: 'chat21' } } }, 'support-group-p-1', 'b'), { type: 'widget', source_id: null, start_point_id: null });
    // T5: a scheduled run with neither id falls back to the agent (root) id; other types do not
    assert.deepStrictEqual(detectTrigger({ request: { attributes: { start_type: 'scheduled' } } }, 'support-group-p-1', 'b', 'root1'), { type: 'scheduled', source_id: 'root1', start_point_id: null });
    assert.deepStrictEqual(detectTrigger({ request: { attributes: { start_type: 'scheduled', chatbot_id: 'c1' } } }, 'support-group-p-1', 'b', 'root1').source_id, 'c1');
    assert.deepStrictEqual(detectTrigger({ request: { attributes: { start_type: 'webhook' } } }, 'support-group-p-1', 'b', 'root1').source_id, null);
  });

  /** Points the recorder at a store whose client logs every call into `log`. */
  /** A client that logs every call into `log` (with its resolved value); fail(prop) can make a method throw. */
  function proxiedClient(fail = () => false) {
    const pending = { n: 0 };
    return new Proxy(client, {
      get(target, prop) {
        const v = target[prop];
        if (typeof v !== 'function') return v;
        // a MULTI goes out as one write at exec(): logged once there, as 'multi' with its queued commands
        // (args: the first command's), result: the first command's reply
        if (prop === 'multi') {
          return (...margs) => {
            const real = v.apply(target, margs);
            const cmds = [];
            const chain = new Proxy(real, {
              get(t, p) {
                const f = t[p];
                if (typeof f !== 'function') return f;
                if (p === 'exec') {
                  return (...eargs) => {
                    const entry = { call: 'multi', cmds: cmds.map((c) => c.call), args: cmds.length ? cmds[0].args : [], pendingBefore: pending.n };
                    log.push(entry);
                    const r = f.apply(t, eargs);
                    pending.n++;
                    r.then((value) => { entry.result = Array.isArray(value) ? value[0] : value; pending.n--; }, () => { pending.n--; });
                    return r;
                  };
                }
                return (...a) => { cmds.push({ call: String(p), args: a }); f.apply(t, a); return chain; };
              }
            });
            return chain;
          };
        }
        return (...args) => {
          // pendingBefore: calls of this client still awaiting their reply when this one was issued
          // (node-redis sends commands issued in the same tick in one write: one round trip)
          const entry = { call: String(prop), args, pendingBefore: pending.n };
          log.push(entry);
          if (fail(String(prop))) return Promise.reject(new Error('injected ' + String(prop) + ' failure'));
          const r = v.apply(target, args);
          // the checkpoint SET is fire-and-forget (never awaited by the flow): not counted as pending
          const cpWrite = entry.call === 'eval' && args[1] && Array.isArray(args[1].keys) && /^exec:.+:cp$/.test(args[1].keys[0]);
          if (cpWrite) entry.cpWrite = true;
          if (r && typeof r.then === 'function' && !cpWrite) {
            pending.n++;
            r.then((value) => { entry.result = value; pending.n--; }, () => { pending.n--; });
          }
          return r;
        };
      }
    });
  }

  function useProxiedStore() {
    ExecutionRecorder.init({ store: new ExecutionStore(proxiedClient()) });
  }

  /** onMessageIn + blockEntry on a given store, outside the engine. */
  async function openCtx(store) {
    const rid = newRequestId();
    requestIds.push(rid);
    const ctx = await ExecutionRecorder.onMessageIn({ message: { request: { request_id: rid } }, bot: { name: 'b' }, botId: BOT_ID, requestId: rid, projectId: PROJECT_ID, token: CHATBOT_TOKEN, store });
    await ExecutionRecorder.blockEntry(ctx, { blockId: 'blk', blockName: 'blk' });
    return { rid, ctx };
  }

  it('diffing and sealing are not awaited by the flow (slow Sealer)', async function () {
    const origSeal = Sealer.seal;
    const origDiff = StateDiff.diffStates;
    let seals = 0;
    let diffs = 0;
    Sealer.seal = function (...args) {
      seals++;
      const until = Date.now() + 150;
      while (Date.now() < until) { /* a slow seal */ }
      return origSeal.apply(Sealer, args);
    };
    StateDiff.diffStates = function (...args) { diffs++; return origDiff.apply(StateDiff, args); };
    try {
      const store = new ExecutionStore(client);
      const { rid, ctx } = await openCtx(store);
      assert.strictEqual(diffs + seals, 0, 'blockEntry resolved before its diff and keyframe seal');
      await ExecutionRecorder._drainForTests();
      assert.strictEqual(diffs, 1);
      seals = 0;
      diffs = 0;

      const directive = { name: 'setattribute', action: { _tdActionId: 'act_slow' } };
      await ExecutionRecorder.runAction(ctx, { index: 0, directive }, async () => {
        await client.hSet(`tilebot:requests:${rid}:parameters`, 'slow_var', '"v"');
        WriteTap.note(rid, 'slow_var', 'set');
      });
      const t0 = Date.now();
      await ExecutionRecorder.afterAction(ctx, { index: 0, directive });
      const elapsed = Date.now() - t0;
      assert.strictEqual(diffs + seals, 0, 'afterAction resolved before its diff and seal');
      assert.ok(elapsed < 150, 'the next action is not delayed by the 150 ms seal (took ' + elapsed + ' ms)');
      await ExecutionRecorder._drainForTests();
      assert.strictEqual(seals, 1);
      const act = ofType(rid, 'action.completed')[0];
      assert.deepStrictEqual(act.data.state_delta.map((c) => [c.key, c.by]), [['slow_var', 'act_slow']]);
      assert.ok(act.data.sealed_state.ct);
      // seq order is kept even though the events are built later
      const evs = events(rid);
      for (let i = 1; i < evs.length; i++) assert.ok(evs[i].seq > evs[i - 1].seq);
    } finally {
      Sealer.seal = origSeal;
      StateDiff.diffStates = origDiff;
    }
  });

  it('a failed HGETALL at block entry still records the step without state fields', async function () {
    const store = new ExecutionStore(proxiedClient((prop) => prop === 'hGetAll'));
    const { rid, ctx } = await openCtx(store);
    const directive = { name: 'setattribute', action: { _tdActionId: 'act_x' } };
    await ExecutionRecorder.runAction(ctx, { index: 0, directive }, () => {});
    await ExecutionRecorder.afterAction(ctx, { index: 0, directive });
    await ExecutionRecorder.blockExit(ctx);
    await ExecutionRecorder._drainForTests();
    const evs = events(rid);
    assert.deepStrictEqual(evs.map((e) => e.type), ['execution.started', 'step.started', 'action.completed', 'step.completed']);
    assert.deepStrictEqual(evs[1].data.outside_changes, []);
    assert.strictEqual(evs[1].data.state_manifest, null);
    assert.ok(!('state_vars' in evs[1].data));
    assert.deepStrictEqual(evs[2].data.state_delta, []);
    assert.ok(!('changed_keys' in evs[3].data));
    assert.strictEqual(await client.exists(`exec:${ctx.execution_id}:state`), 0, 'no state write over a failed read');
  });

  it('a block that yields no reply still closes its step', async function () {
    const rid = newRequestId();
    send('/empty', rid);
    await waitFor(() => ofType(rid, 'execution.idle').length > 0, 'execution.idle');
    await settle(rid, 300);
    const started = ofType(rid, 'step.started');
    assert.strictEqual(started.length, 1);
    assert.strictEqual(started[0].data.block_id, 'empty');
    for (const s of started) {
      assert.strictEqual(ofType(rid, 'step.completed').filter((c) => c.data.step_seq === s.seq).length, 1, 'step ' + s.seq + ' closed once');
    }
    assert.strictEqual(ofType(rid, 'step.completed')[0].data.outcome, 'success');
  });

  it('flag off: intent parameters are written as in 3.0.5 (not awaited)', async function () {
    const make = (execution) => {
      const chatbot = new TiledeskChatbot({ botsDataSource: new MockBotsDataSource(bots_data), botId: BOT_ID, bot: { name: 'b' }, requestId: 'r-params' });
      chatbot.execution = execution;
      chatbot.added = [];
      chatbot.addParameter = (k, v) => { chatbot.added.push([k, v]); return new Promise(() => {}); }; // never settles
      chatbot.execIntent = async () => 'replied';
      return chatbot;
    };
    const message = { text: '/start{"a":1,"b":2}', sender: 'A-SENDER', request: { request_id: 'r-params' } };
    const timeout = (p) => Promise.race([p, new Promise((r) => setTimeout(() => r('pending'), 200))]);

    const off = make(null);
    assert.strictEqual(await timeout(off.replyToMessage(message)), 'replied');
    assert.deepStrictEqual(off.added, [['a', 1], ['b', 2]]);

    const on = make({ request_id: 'r-params', scopes: { message_in: new Set(), jump_params: new Set() } });
    assert.strictEqual(await timeout(on.replyToMessage(message)), 'pending', 'with a ctx the writes are awaited');
    assert.deepStrictEqual(on.added, [['a', 1]]);
  });

  it('EXECUTIONS_STATE_ENABLED=false: no state reads or writes, events still flow', async function () {
    process.env.EXECUTIONS_STATE_ENABLED = 'false';
    try {
      useProxiedStore();
      const from = log.length;
      const rid = newRequestId();
      send('/count', rid);
      await waitFor(() => ofType(rid, 'execution.idle').length > 0, 'execution.idle');
      await ExecutionRecorder._drainForTests();
      const evs = events(rid);
      assert.deepStrictEqual(evs.map((e) => e.type), ['execution.started', 'step.started', 'action.completed', 'action.completed', 'action.completed', 'step.completed', 'execution.idle',
        'execution.checkpoint']);
      const step = evs[1].data;
      assert.deepStrictEqual(step.outside_changes, []);
      assert.strictEqual(step.state_keyframe, false);
      assert.strictEqual(step.state_manifest, null);
      assert.ok(!('state_vars' in step) && !('sealed_state' in step));
      for (const a of ofType(rid, 'action.completed')) {
        assert.deepStrictEqual(a.data.state_delta, []);
        assert.ok(!('sealed_state' in a.data));
        assert.strictEqual(a.data.outcome, 'success');
      }
      const done = ofType(rid, 'step.completed')[0].data;
      assert.ok(!('state_vars' in done) && !('changed_keys' in done));
      const calls = log.slice(from).filter((e) => e.call);
      assert.ok(!calls.some((c) => c.call === 'hGetAll'), 'no HGETALL');
      assert.ok(!calls.some((c) => String(c.args[0]).endsWith(':state')), 'no exec:{id}:state read or write');
      assert.strictEqual(await client.exists(`exec:${evs[0].execution_id}:state`), 0);
    } finally {
      delete process.env.EXECUTIONS_STATE_ENABLED;
    }
  });

  it('no extra awaited Redis call per action beyond the stop GET and HGETALL+INCR', async function () {
    useProxiedStore();
    const rid = newRequestId();
    send('/count', rid);
    await waitFor(() => ofType(rid, 'execution.idle').length > 0, 'execution.idle');
    // events are built after the flow moves on, so the window is cut on the INCRs that allocated their seqs
    const execId = ofType(rid, 'step.started')[0].execution_id;
    // nextSeq is one MULTI (INCR + EXPIRE, the TTL refreshed every time): one entry, one round trip
    const isSeq = (e) => e.call === 'multi' && e.cmds[0] === 'incr' && e.args[0] === `exec:${execId}:seq`;
    const seqCall = (seq) => log.findIndex((e) => isSeq(e) && e.result === seq);
    const from = seqCall(ofType(rid, 'step.started')[0].seq);
    const to = seqCall(ofType(rid, 'step.completed')[0].seq);
    assert.ok(from >= 0 && to > from);
    assert.strictEqual(ofType(rid, 'action.completed').length, 3);
    // Phase 3: the checkpoint context read at block entry (agent_stack, subagent stack, three locks), issued with
    // the block's HGETALL + INCR, and one fire-and-forget checkpoint SET per action plus one at block entry
    const all = log.slice(from + 1).filter((e) => e.call);
    const isCtxRead = (e) => (e.call === 'hGet' && e.args[0] === `exec:${execId}` && e.args[1] === 'agent_stack') ||
      (e.call === 'lRange' && e.args[0] === `subagent:stack:${rid}`) ||
      (e.call === 'get' && /^tilebot:requests:.+:(locked|action:locked|mcp:locked)$/.test(String(e.args[0])));
    const ctxReads = all.filter(isCtxRead);
    assert.deepStrictEqual(ctxReads.map((e) => e.call), ['hGet', 'lRange', 'get', 'get', 'get'], 'checkpoint context read once, at block entry');
    assert.ok(ctxReads.every((e) => e.pendingBefore >= 1), 'issued with the block entry HGETALL + INCR (same round trip)');
    const cpWrites = log.filter((e) => e.cpWrite && e.args[1].keys[0] === `exec:${execId}:cp`);
    assert.strictEqual(cpWrites.length, 4, 'one checkpoint SET at block entry, one per action');
    // 3 actions x (stop GET before it, Phase 2; HGETALL + INCR after it), then the INCR of step.completed with the state write
    const calls = all.filter((e) => !isCtxRead(e) && !e.cpWrite);
    assert.deepStrictEqual(calls.slice(0, 11).map((e) => e.call),
      ['get', 'hGetAll', 'multi', 'get', 'hGetAll', 'multi', 'get', 'hGetAll', 'multi', 'multi', 'set']);
    for (const i of [2, 5, 8, 9]) assert.deepStrictEqual(calls[i].cmds, ['incr', 'expire'], 'INCR + EXPIRE in one MULTI');
    for (const i of [0, 3, 6]) assert.strictEqual(calls[i].args[0], `exec:${execId}:stop`, 'GET ' + i + ' is the stop flag');
    // pipelined: each action's INCR goes out with its HGETALL (1 round trip after each action), and the
    // state write with the step.completed INCR (1 round trip at block exit)
    for (const i of [2, 5, 8]) assert.ok(calls[i].pendingBefore >= 1, 'INCR ' + i + ' issued with its HGETALL');
    assert.strictEqual(calls[9].args[0], `exec:${execId}:seq`);
    assert.strictEqual(calls[10].args[0], `exec:${execId}:state`);
    assert.ok(calls[10].pendingBefore >= 1, 'state write issued with the step.completed INCR');
    const roundTrips = (slice) => slice.filter((e) => e.pendingBefore === 0).length;
    for (const i of [0, 3, 6]) assert.strictEqual(roundTrips(calls.slice(i, i + 3)), 2, 'stop GET + one round trip for action at ' + i);
    assert.strictEqual(roundTrips(calls.slice(9, 11)), 1, 'one round trip at block exit');
  });

  it('a message resolves without EXISTS, its status and state read together (T3b)', async function () {
    useProxiedStore();
    const rid = newRequestId();
    send('/count', rid);
    await waitFor(() => ofType(rid, 'execution.idle').length > 0, 'execution.idle');
    await settle(rid, 200);
    const execId = ofType(rid, 'execution.started')[0].execution_id;
    const from = log.length;
    send('/count', rid, { attributes: { execution_id: execId } });
    await waitFor(() => ofType(rid, 'execution.idle').length > 1, 'second execution.idle');
    const calls = log.slice(from).filter((e) => e.call);
    assert.ok(!calls.some((e) => e.call === 'exists'), 'no EXISTS');
    const status = calls.findIndex((e) => e.call === 'hGet' && e.args[0] === `exec:${execId}` && e.args[1] === 'status');
    assert.ok(status >= 0);
    assert.strictEqual(calls[status + 1].call, 'get');
    assert.strictEqual(calls[status + 1].args[0], `exec:${execId}:state`);
    assert.ok(calls[status + 1].pendingBefore >= 1, 'the state GET goes out with the status HGET');
    assert.strictEqual(calls.filter((e) => e.call === 'get' && e.args[0] === `exec:${execId}:state`).length, 1, 'state read once');
  });

  it('a sealed block over EXECUTIONS_DATA_MAX_BYTES is left out: data_missing, the clear part stays (T2)', async function () {
    const saved = process.env.EXECUTIONS_DATA_MAX_BYTES;
    process.env.EXECUTIONS_DATA_MAX_BYTES = '200';
    try {
      const rid = newRequestId();
      requestIds.push(rid);
      const message = { request: { request_id: rid, attributes: { payload: { blob: 'x'.repeat(500) } } } };
      const ctx = await ExecutionRecorder.onMessageIn({ message, bot: { name: 'b' }, botId: BOT_ID, requestId: rid, projectId: PROJECT_ID, token: CHATBOT_TOKEN, store: new ExecutionStore(client) });
      await ExecutionRecorder._drainForTests();
      const started = ofType(rid, 'execution.started')[0];
      assert.ok(!('sealed_trigger_payload' in started.data));
      assert.strictEqual(started.data.data_missing, true);
      assert.deepStrictEqual(started.data.trigger, { type: 'widget', source_id: null, start_point_id: null });
      assert.strictEqual(started.data.agent_name, 'b');
      assert.ok(ctx);
    } finally {
      if (saved === undefined) delete process.env.EXECUTIONS_DATA_MAX_BYTES; else process.env.EXECUTIONS_DATA_MAX_BYTES = saved;
    }
  });

  it('a scheduled run without webhook_id / chatbot_id records the agent root id as source_id (T5)', async function () {
    const rid = newRequestId();
    requestIds.push(rid);
    const message = { request: { request_id: rid, attributes: { start_type: 'scheduled' } }, attributes: { action: '#sp9' } };
    await ExecutionRecorder.onMessageIn({ message, bot: { name: 'b', root_id: 'rootAgent' }, botId: BOT_ID, requestId: rid, projectId: PROJECT_ID, token: CHATBOT_TOKEN, store: new ExecutionStore(client) });
    await ExecutionRecorder._drainForTests();
    const started = ofType(rid, 'execution.started')[0];
    requestIds.push(rid);
    assert.deepStrictEqual(started.data.trigger, { type: 'scheduled', source_id: 'rootAgent', start_point_id: 'sp9' });
    await client.del(`exec:req:${rid}:rootAgent`);
  });

  it('flag off: the flow makes no awaited recorder call (T6)', async function () {
    const names = ['onMessageIn', 'withScope', 'blockEntry', 'afterAction', 'failed', 'blockExit', 'endOfChain', 'onSubagentCall', 'onSubagentReturn', 'onHandedToBot'];
    const orig = {};
    const called = [];
    for (const n of names) {
      orig[n] = ExecutionRecorder[n];
      ExecutionRecorder[n] = function (...args) { called.push(n); return orig[n].apply(ExecutionRecorder, args); };
    }
    process.env.EXECUTIONS_ENABLED = 'false';
    try {
      const rid = newRequestId();
      send('/start', rid);
      await waitFor(() => replies.some((r) => r.requestId === rid && r.message), 'the done reply');
      await new Promise((r) => setTimeout(r, 300));
      assert.deepStrictEqual(called, []);
    } finally {
      for (const n of names) ExecutionRecorder[n] = orig[n];
      process.env.EXECUTIONS_ENABLED = 'true';
    }
  });
});
