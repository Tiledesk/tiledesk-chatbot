'use strict';

// first: sets the endpoint defaults before the engine modules load
const { listen, close, suiteEndpoints } = require('./helpers/executionsTestServer');

const assert = require('assert');
const express = require('express');
const bodyParser = require('body-parser');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const tybot = require('../');
const winston = require('../utils/winston');
const tilebotService = require('../services/TilebotService');
const ExecutionRecorder = require('../executions/ExecutionRecorder');
const Checkpointer = require('../executions/Checkpointer');
const ControlListener = require('../executions/ControlListener');
const { ExecutionStore } = require('../executions/ExecutionStore');
const { getConfig } = require('../executions/config');
const { setEmitterForTests } = require('../executions/TraceEmitter');
const { getTestKeys, openSealed } = require('./helpers/executionsTestKeys');
const lifecycle = require('./executions_lifecycle_bot.js').bots_data;

const PROJECT_ID = 'projectID';
const BOT_ID = 'botID';
const CHATBOT_TOKEN = 'XXX';
// Own ports: block jumps come back to APP_PORT, bot replies land on API_PORT.
const APP_PORT = 10071;
const API_PORT = 10072;

const ENV_KEYS = ['EXECUTIONS_ENABLED', 'EXECUTIONS_STATE_ENABLED', 'EXECUTIONS_STATE_HASH_KEY', 'EXECUTIONS_SEAL_PUBLIC_KEY', 'EXECUTIONS_SEAL_KID',
  'EXECUTIONS_AMQP_URL', 'AMQP_MANAGER_URL', 'CHATBOT_MAX_STEPS', 'EXECUTIONS_LEASE_MS', 'EXECUTIONS_HEARTBEAT_MS', 'EXECUTIONS_TRANSIT_MS',
  'EXECUTIONS_CHECKPOINT_TTL', 'EXECUTIONS_DATA_MAX_BYTES'];

const app = express();
app.use('/', tybot.router);
app.use((err, req, res, next) => { winston.error('General error', err); });

function newRequestId(prefix = 'support-group-') {
  return prefix + PROJECT_ID + '-' + uuidv4().replace(/-/g, '');
}

const reply = (id, text) => ({ _tdActionType: 'reply', _tdActionId: id, _tdActionTitle: text, text,
  attributes: { commands: [{ type: 'message', message: { type: 'text', text } }] } });

// the lifecycle bot (count: three set attributes) plus: twostep (a wait, then a reply), longwait (a 20 s
// wait, then a reply), hop (jumps to slow) and slow (a wait, then a reply)
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
    reply('act_second', 'second')
  ]);
  add('longwait', [
    { _tdActionType: 'wait', _tdActionId: 'act_wait', _tdActionTitle: 'long wait', millis: 20000 },
    reply('act_after_wait', 'after wait')
  ]);
  add('capture', [
    { _tdActionType: 'capture_user_reply', _tdActionId: 'act_cap', _tdActionTitle: 'capture', assignResultTo: 'answer' },
    reply('act_cap_done', 'thanks')
  ]);
  add('hop', [{ _tdActionType: 'intent', _tdActionId: 'act_goto_slow', _tdActionTitle: 'go to slow', intentName: '#slow' }]);
  add('slow', [
    { _tdActionType: 'wait', _tdActionId: 'act_slow_wait', _tdActionTitle: 'wait', millis: 300 },
    reply('act_slow_done', 'slow done')
  ]);
  return data;
}

function startTybot(endpoints = { TILEBOT_ENDPOINT: `http://localhost:${APP_PORT}`, API_ENDPOINT: `http://localhost:${API_PORT}` }, bots = buildBots()) {
  return new Promise((resolve) => {
    tybot.startApp({
      bots,
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
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timed out waiting for ' + what);
}

describe('Executions: checkpoints (exec:{id}:cp pointer, sealed parked checkpoint)', function () {
  this.timeout(30000);

  let savedEnv;
  let appListener, apiListener;
  let client;
  const keys = getTestKeys();
  const log = [];
  const calls = [];
  const requestIds = [];
  // set by a test: delays the reply of every checkpoint write by this many ms
  let cpDelayMs = 0;
  const fakeEmitter = {
    emit(envelope) { log.push(envelope); },
    async flush() {},
    stats() { return { published: 0, dropped: 0, buffered: 0 }; },
    stop() {}
  };

  const isCpEval = (c) => c.call === 'eval' && c.args[1] && Array.isArray(c.args[1].keys) && /^exec:.+:cp$/.test(c.args[1].keys[0]);

  /** A client that logs every call into `calls` (with when it settled); checkpoint writes can be delayed. */
  function proxiedClient() {
    return new Proxy(client, {
      get(target, prop) {
        const v = target[prop];
        if (typeof v !== 'function') return v;
        return (...args) => {
          const entry = { call: String(prop), args, at: Date.now(), settledAt: null };
          calls.push(entry);
          let r = v.apply(target, args);
          if (r && typeof r.then === 'function') {
            if (isCpEval(entry) && cpDelayMs > 0) {
              const ms = cpDelayMs;
              r = r.then((x) => new Promise((resolve) => setTimeout(() => resolve(x), ms)));
            }
            r.then(() => { entry.settledAt = Date.now(); }, () => { entry.settledAt = Date.now(); });
          }
          return r;
        };
      }
    });
  }

  const events = (rid) => log.filter((e) => e.request_id === rid);
  const ofType = (rid, type) => events(rid).filter((e) => e.type === type);
  const execIdOf = (rid) => (events(rid)[0] || {}).execution_id;
  const cpWrites = (id) => calls.filter((c) => isCpEval(c) && c.args[1].keys[0] === `exec:${id}:cp`)
    .map((c) => JSON.parse(c.args[1].arguments[0]));
  const getCp = async (id) => {
    const raw = await client.get(`exec:${id}:cp`);
    return raw ? JSON.parse(raw) : null;
  };
  const setStop = (id, mode = 'soft') => client.set(`exec:${id}:stop`, mode, { EX: 604800 });
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

  async function settle(rid, type = 'execution.idle') {
    await waitFor(() => ofType(rid, type).length >= 1, type);
    await sleep(200);
    await ExecutionRecorder._drainForTests();
  }

  before(async function () {
    savedEnv = {};
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    process.env.EXECUTIONS_ENABLED = 'true';
    process.env.EXECUTIONS_STATE_HASH_KEY = 'checkpoint-test-hash-key';
    process.env.EXECUTIONS_SEAL_PUBLIC_KEY = keys.publicKeyPem;
    process.env.EXECUTIONS_SEAL_KID = 'kid-checkpoint';
    delete process.env.EXECUTIONS_AMQP_URL;
    delete process.env.AMQP_MANAGER_URL;
    delete process.env.CHATBOT_MAX_STEPS;
    delete process.env.EXECUTIONS_STATE_ENABLED;
    delete process.env.EXECUTIONS_CHECKPOINT_TTL;
    delete process.env.EXECUTIONS_DATA_MAX_BYTES;
    setEmitterForTests(fakeEmitter);

    client = redis.createClient({ url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}` });
    await client.connect();

    const api = express();
    api.use(bodyParser.json());
    api.post('/:projectId/requests/:requestId/messages', (req, res) => res.send({ success: true }));
    api.patch('/:projectId/requests/:requestId/attributes', (req, res) => res.send({ success: true }));
    api.put('/:projectId/requests/:requestId/attributes', (req, res) => res.send({ success: true }));
    apiListener = await listen(api, API_PORT);

    await startTybot();
    appListener = await listen(app, APP_PORT);
  });

  after(async function () {
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
      del.push(`exec:${id}`, `exec:${id}:seq`, `exec:${id}:state`, `exec:${id}:owner`, `exec:${id}:transit`, `exec:${id}:stop`, `exec:${id}:cp`);
    }
    for (const rid of new Set(requestIds)) {
      del.push(`exec:req:${rid}:${BOT_ID}`, `tilebot:${rid}`, `tilebot:botId_requests:${rid}`, `subagent:stack:${rid}`);
      for await (const k of client.scanIterator({ MATCH: `tilebot:requests:${rid}*`, COUNT: 1000 })) {
        if (Array.isArray(k)) del.push(...k); else del.push(k);
      }
    }
    if (del.length) await client.del(del);
    await client.quit();
    await close(appListener);
    await close(apiListener);
  });

  beforeEach(function () {
    ExecutionRecorder.init({ store: new ExecutionStore(proxiedClient()) });
  });

  afterEach(async function () {
    process.env.EXECUTIONS_ENABLED = 'true';
    cpDelayMs = 0;
    calls.length = 0;
    ExecutionRecorder.init({ store: new ExecutionStore(client) });
    if (!ControlListener.isRunning()) await startTybot();
  });

  it('after each action exec:{id}:cp points at the next action', async function () {
    const rid = newRequestId();
    send('/count', rid);
    await settle(rid);
    const id = execIdOf(rid);
    const acts = ofType(rid, 'action.completed');
    assert.strictEqual(acts.length, 3);
    const writes = cpWrites(id);
    assert.deepStrictEqual(writes.map((w) => [w.block_id, w.action_index, w.next_action, w.next_action_type]), [
      ['count', 0, 'run', 'setattribute'],
      ['count', 1, 'run', 'setattribute'],
      ['count', 2, 'run', 'setattribute'],
      ['count', 3, 'run', null]
    ]);
    assert.deepStrictEqual(writes.slice(1).map((w) => w.seq), acts.map((a) => a.seq), 'each write carries the seq of its action.completed');
    const cp = await getCp(id);
    assert.deepStrictEqual(Object.keys(cp).sort(), ['action_index', 'agent_stack', 'agent_version', 'block_id', 'locks', 'next_action',
      'next_action_type', 'seq', 'subagent_stack', 'trigger', 'version', 'written_at']);
    assert.strictEqual(cp.version, 1);
    assert.strictEqual(cp.seq, acts[2].seq);
    assert.strictEqual(cp.block_id, 'count');
    assert.strictEqual(cp.action_index, 3);
    assert.strictEqual(cp.next_action, 'run');
    assert.strictEqual(cp.agent_version, BOT_ID);
    assert.deepStrictEqual(cp.agent_stack, []);
    assert.deepStrictEqual(cp.subagent_stack, []);
    assert.deepStrictEqual(cp.locks, { intent: null, action: null, mcp: null });
    assert.deepStrictEqual(cp.trigger, events(rid)[0].data.trigger);
    assert.ok(!Number.isNaN(Date.parse(cp.written_at)));
    const ttl = await client.ttl(`exec:${id}:cp`);
    assert.ok(ttl > 604700 && ttl <= 604800, 'TTL EXECUTIONS_CHECKPOINT_TTL default 7 d, got ' + ttl);
    assert.strictEqual(getConfig().checkpointTtlS, 604800);
  });

  it('a jump landing writes action_index 0 for the new block', async function () {
    const rid = newRequestId();
    send('/hop', rid);
    await settle(rid);
    const id = execIdOf(rid);
    const steps = ofType(rid, 'step.started');
    assert.deepStrictEqual(steps.map((s) => s.data.block_id), ['hop', 'slow']);
    const writes = cpWrites(id);
    const landing = writes.find((w) => w.block_id === 'slow' && w.action_index === 0);
    assert.ok(landing, 'a landing write for the new block');
    assert.strictEqual(landing.seq, steps[1].seq, 'written with the seq of the new block\'s step.started');
    assert.strictEqual(landing.next_action, 'run');
    assert.strictEqual(landing.next_action_type, 'wait');
    const hopWrites = writes.filter((w) => w.block_id === 'hop');
    assert.ok(hopWrites.every((w) => w.seq < landing.seq), 'the old block\'s writes are older');
    const cp = await getCp(id);
    assert.deepStrictEqual([cp.block_id, cp.action_index, cp.next_action_type], ['slow', 2, null]);
  });

  it('hard stop of an abortable action writes rerun at that action', async function () {
    const rid = newRequestId();
    send('/longwait', rid);
    await waitFor(() => ofType(rid, 'step.started').length === 1, 'the block to start');
    await sleep(100);
    const id = execIdOf(rid);
    await hardStop(id);
    await settle(rid, 'execution.stopped');
    const stopped = ofType(rid, 'execution.stopped')[0];
    const cp = await getCp(id);
    assert.deepStrictEqual([cp.block_id, cp.action_index, cp.next_action, cp.next_action_type], ['longwait', 0, 'rerun', 'wait']);
    assert.strictEqual(cp.seq, stopped.seq, 'written with the seq of execution.stopped');
    assert.ok(!cpWrites(id).some((w) => w.action_index === 1), 'never pointed past the interrupted action');
  });

  it('soft stop writes run at the next action', async function () {
    const rid = newRequestId();
    send('/twostep', rid);
    await waitFor(() => ofType(rid, 'step.started').length === 1, 'the block to start');
    await sleep(150); // the 800 ms wait (action 0) is running: past action 0's gate
    const id = execIdOf(rid);
    await setStop(id, 'soft');
    await settle(rid, 'execution.stopped');
    await sleep(800);
    const stopped = ofType(rid, 'execution.stopped')[0];
    const cp = await getCp(id);
    assert.deepStrictEqual([cp.block_id, cp.action_index, cp.next_action, cp.next_action_type], ['twostep', 1, 'run', 'reply']);
    assert.strictEqual(cp.seq, stopped.seq, 'written with the seq of execution.stopped');
  });

  it('checkpoint never contains chatbotToken or chatbot_jwt_token', async function () {
    const rid = newRequestId();
    requestIds.push(rid);
    // a caller frame on the subagent stack: its bot token must not reach the checkpoint
    await client.lPush(`subagent:stack:${rid}`, JSON.stringify({ parentId: 'parent-bot', parentParticipantId: 'bot_parent', parentToken: 'JWT-PARENT', nextBlock: 'back' }));
    send('/count', rid);
    await settle(rid);
    const id = execIdOf(rid);
    const params = await client.hGetAll(`tilebot:requests:${rid}:parameters`);
    assert.ok(params.chatbotToken && params.chatbot_jwt_token, 'the flow state does hold the tokens');
    const raw = await client.get(`exec:${id}:cp`);
    for (const s of ['chatbotToken', 'chatbot_jwt_token', 'parentToken', 'JWT-PARENT', CHATBOT_TOKEN]) {
      assert.ok(!raw.includes(s), 'pointer has no ' + s);
    }
    const cp = JSON.parse(raw);
    assert.deepStrictEqual(cp.subagent_stack, [{ parentId: 'parent-bot', parentParticipantId: 'bot_parent', nextBlock: 'back' }]);
    const parked = ofType(rid, 'execution.checkpoint');
    assert.strictEqual(parked.length, 1);
    const plain = openSealed(parked[0].data.sealed, keys.privateKeyPem);
    const p = plain.request_state.parameters;
    assert.strictEqual(p.chatbotToken, undefined);
    assert.strictEqual(p.chatbot_jwt_token, undefined);
    assert.strictEqual(p.c1, '"1"', 'the rest of the state is kept, raw');
    assert.deepStrictEqual(plain.subagent_stack, cp.subagent_stack);
    assert.ok(!JSON.stringify(plain).includes('JWT-PARENT'));
  });

  it('a locking action\'s checkpoint carries the locks it set, and the unlock clears them', async function () {
    const rid = newRequestId();
    send('/capture', rid);
    await settle(rid);
    const id = execIdOf(rid);
    let cp = await getCp(id);
    assert.deepStrictEqual([cp.block_id, cp.action_index], ['capture', 1]);
    assert.deepStrictEqual(cp.locks, { intent: '#capture', action: 'act_cap', mcp: null });
    send('my answer', rid); // the locked intent runs the capture again: it unlocks and goes on
    await waitFor(() => ofType(rid, 'execution.idle').length >= 2, 'the second chain');
    await sleep(200);
    await ExecutionRecorder._drainForTests();
    cp = await getCp(id);
    assert.deepStrictEqual([cp.block_id, cp.action_index, cp.next_action_type], ['capture', 2, null]);
    assert.deepStrictEqual(cp.locks, { intent: null, action: null, mcp: null });
  });

  it('an older seq never overwrites a newer checkpoint', async function () {
    const store = new ExecutionStore(client);
    const id = 'cp-seq-' + uuidv4();
    try {
      assert.strictEqual(await store.getCheckpoint(id), null);
      await store.setCheckpoint(id, { version: 1, seq: 5, action_index: 5 });
      await store.setCheckpoint(id, { version: 1, seq: 3, action_index: 3 });
      assert.strictEqual((await store.getCheckpoint(id)).action_index, 5, 'older seq ignored');
      await store.setCheckpoint(id, { version: 1, seq: 5, action_index: 9 });
      assert.strictEqual((await store.getCheckpoint(id)).action_index, 5, 'same seq ignored');
      await store.setCheckpoint(id, { version: 1, seq: 7, action_index: 7 });
      assert.strictEqual((await store.getCheckpoint(id)).action_index, 7, 'newer seq written');
      const ttl = await client.ttl(`exec:${id}:cp`);
      assert.ok(ttl > 604700 && ttl <= 604800);
      // never throws: a broken client resolves
      const broken = new ExecutionStore({ eval: async () => { throw new Error('down'); }, get: async () => { throw new Error('down'); } });
      await broken.setCheckpoint(id, { seq: 99 });
      assert.strictEqual(await broken.getCheckpoint(id), null);
    } finally {
      await client.del(`exec:${id}:cp`);
    }
  });

  it('idle, stopped and failed emit execution.checkpoint with a sealed payload (idle, stopped)', async function () {
    // idle
    const rid = newRequestId();
    send('/count', rid);
    await settle(rid);
    const id = execIdOf(rid);
    const parked = ofType(rid, 'execution.checkpoint');
    assert.strictEqual(parked.length, 1);
    assert.deepStrictEqual(Object.keys(parked[0].data).sort(), ['cp_seq', 'sealed']);
    const cp = await getCp(id);
    assert.strictEqual(parked[0].data.cp_seq, cp.seq);
    const plain = openSealed(parked[0].data.sealed, keys.privateKeyPem);
    const { request_state, ...pointer } = plain;
    assert.deepStrictEqual(pointer, cp, 'the sealed copy is the pointer plus request_state');
    assert.deepStrictEqual(Object.keys(request_state), ['parameters']);
    assert.strictEqual(request_state.parameters.c3, '"3"');

    // stopped
    const rid2 = newRequestId();
    send('/twostep', rid2);
    await waitFor(() => ofType(rid2, 'step.started').length === 1, 'the block to start');
    await sleep(150); // past action 0's gate
    const id2 = execIdOf(rid2);
    await setStop(id2, 'soft');
    await settle(rid2, 'execution.stopped');
    const parked2 = ofType(rid2, 'execution.checkpoint');
    assert.strictEqual(parked2.length, 1);
    const plain2 = openSealed(parked2[0].data.sealed, keys.privateKeyPem);
    assert.deepStrictEqual([plain2.block_id, plain2.action_index, plain2.next_action], ['twostep', 1, 'run']);
    assert.strictEqual(parked2[0].data.cp_seq, ofType(rid2, 'execution.stopped')[0].seq);
    assert.ok(parked2[0].seq > parked2[0].data.cp_seq);
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

    it('idle, stopped and failed emit execution.checkpoint with a sealed payload (failed: limit before action k writes k, run)', async function () {
      const rid = newRequestId();
      send('/count', rid);
      await settle(rid, 'execution.failed');
      const id = execIdOf(rid);
      const failed = ofType(rid, 'execution.failed')[0];
      assert.strictEqual(failed.data.error_code, 'max_steps_exceeded');
      const cp = await getCp(id);
      assert.deepStrictEqual([cp.block_id, cp.action_index, cp.next_action, cp.next_action_type], ['count', 2, 'run', 'setattribute']);
      assert.strictEqual(cp.seq, failed.seq);
      const parked = ofType(rid, 'execution.checkpoint');
      assert.strictEqual(parked.length, 1);
      assert.strictEqual(parked[0].data.cp_seq, failed.seq);
      const plain = openSealed(parked[0].data.sealed, keys.privateKeyPem);
      assert.strictEqual(plain.action_index, 2);
      assert.strictEqual(plain.request_state.parameters.c2, '"2"');
      assert.strictEqual(plain.request_state.parameters.c3, undefined);
    });
  });

  it('over 256 KB no execution.checkpoint is emitted', async function () {
    const id = 'cp-big-' + uuidv4();
    const ctx = {
      execution_id: id, id_project: PROJECT_ID, agent_id: BOT_ID, agent_version: BOT_ID, request_id: newRequestId(),
      trigger: { type: 'widget' }, _store: new ExecutionStore(client), _cfg: getConfig(), _captureData: true,
      _cp: { agent_stack: [], subagent_stack: [], locks: { intent: null, action: null, mcp: null }, last: null }
    };
    const pointer = Checkpointer.build(ctx, { block_id: 'b', action_index: 0, next_action: 'run', next_action_type: 'wait', seq: 1 });
    const warned = [];
    const origWarn = winston.warn;
    winston.warn = (...a) => { warned.push(a.join(' ')); };
    try {
      await Checkpointer.sealedPark(ctx, pointer, { big: 'x'.repeat(300 * 1024), chatbotToken: 't' });
      await ExecutionRecorder._drainForTests();
      assert.strictEqual(log.filter((e) => e.execution_id === id).length, 0, 'nothing emitted');
      assert.ok(warned.some((w) => /checkpoint/i.test(w)), 'logged');
      // a small one is emitted
      await Checkpointer.sealedPark(ctx, pointer, { small: '"x"' });
      await ExecutionRecorder._drainForTests();
      const evs = log.filter((e) => e.execution_id === id);
      assert.deepStrictEqual(evs.map((e) => e.type), ['execution.checkpoint']);
      assert.strictEqual(evs[0].data.cp_seq, 1);
    } finally {
      winston.warn = origWarn;
      await client.del([`exec:${id}:seq`]);
    }
  });

  it('flag off: no cp key, no checkpoint event', async function () {
    process.env.EXECUTIONS_ENABLED = 'false';
    const rid = newRequestId();
    send('/count', rid);
    await sleep(800);
    await ExecutionRecorder._drainForTests();
    assert.strictEqual(calls.length, 0, 'the recorder store is not touched at all');
    assert.strictEqual(events(rid).length, 0);
    // no execution at all, so no exec:{id}:cp can exist for this conversation
    assert.strictEqual(await client.get(`exec:req:${rid}:${BOT_ID}`), null);
  });

  it('per-action Redis budget: exactly one extra SET per action, not awaited', async function () {
    cpDelayMs = 1500; // every checkpoint write answers 1.5 s late: the flow must not wait for it
    const actions = buildBots().bots[BOT_ID].intents.count.actions.length;
    const rid = newRequestId();
    const t0 = Date.now();
    send('/count', rid);
    await waitFor(() => ofType(rid, 'execution.idle').length === 1, 'the chain to end', 1400);
    const idleAt = Date.now();
    assert.ok(idleAt - t0 < 1400, 'the chain ended before any checkpoint write answered');
    const id = execIdOf(rid);
    const cpCalls = calls.filter((c) => isCpEval(c) && c.args[1].keys[0] === `exec:${id}:cp`);
    assert.strictEqual(cpCalls.length, actions + 1, 'one per action, plus one at block entry');
    assert.ok(cpCalls.every((c) => c.settledAt === null), 'none had answered when the chain ended');
    assert.strictEqual(calls.filter((c) => c.args[0] === `exec:${id}:cp`).length, 0, 'no plain GET/SET on the key on the flow path');
    // the rest of the per-action budget is unchanged: one stop GET and one HGETALL per action
    const stopReads = calls.filter((c) => c.args[0] === `exec:${id}:stop`);
    assert.strictEqual(stopReads.length, actions + 1, 'one per action, plus one per message');
    const reads = calls.filter((c) => c.call === 'hGetAll' && c.args[0] === `tilebot:requests:${rid}:parameters`);
    assert.strictEqual(reads.length, actions + 1, 'one per action, plus one at block entry');
    await sleep(1700);
    await ExecutionRecorder._drainForTests();
    assert.strictEqual((await getCp(id)).action_index, actions);
  });
});
