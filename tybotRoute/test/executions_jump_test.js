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
const WriteTap = require('../executions/WriteTap');
const ExecutionRecorder = require('../executions/ExecutionRecorder');
const { setEmitterForTests } = require('../executions/TraceEmitter');
const { TiledeskChatbot } = require('../engine/TiledeskChatbot');
const { DirMessageToBot } = require('../tiledeskChatbotPlugs/directives/DirMessageToBot');
const bots_data = require('./executions_lifecycle_bot.js').bots_data;

const PROJECT_ID = 'projectID';
const BOT_ID = 'botID';
const CHATBOT_TOKEN = 'XXX';
// Own ports: block jumps come back to APP_PORT, bot replies land on API_PORT.
const APP_PORT = 10021;
const API_PORT = 10022;
const FAIL_PORT = 10003; // the fixture's web request target, always 500

const ENV_KEYS = ['EXECUTIONS_ENABLED', 'EXECUTIONS_STATE_ENABLED', 'EXECUTIONS_STATE_HASH_KEY', 'EXECUTIONS_SEAL_PUBLIC_KEY', 'EXECUTIONS_SEAL_KID',
  'EXECUTIONS_AMQP_URL', 'AMQP_MANAGER_URL', 'CHATBOT_MAX_STEPS', 'EXECUTIONS_JUMP_BUDGET_MS'];

const app = express();
app.use('/', tybot.router);
app.use((err, req, res, next) => { winston.error('General error', err); });

function newRequestId() {
  return 'support-group-' + PROJECT_ID + '-' + uuidv4().replace(/-/g, '');
}


function startTybot(endpoints = { TILEBOT_ENDPOINT: `http://localhost:${APP_PORT}`, API_ENDPOINT: `http://localhost:${API_PORT}` }) {
  return new Promise((resolve) => {
    tybot.startApp({
      bots: bots_data,
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
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timed out waiting for ' + what);
}

describe('Executions: jumps across blocks and pods', function () {
  this.timeout(30000);

  let savedEnv;
  let appListener, apiListener, failListener;
  let client;
  const log = [];
  const requestIds = [];
  const posted = [];          // jump messages posted to /ext, as sent
  let betweenBlocks = null;   // optional async hook run before a /ext jump is posted
  const originalRequest = httpUtils.request;
  const fakeEmitter = {
    emit(envelope) { log.push(envelope); },
    async flush() {},
    stats() { return { published: 0, dropped: 0, buffered: 0 }; },
    stop() {}
  };

  /** Sees each jump as posted; betweenBlocks runs after the jumping block's exit, before the next block. */
  function recordingRequest(options, callback, ...rest) {
    if (options && typeof options.url === 'string' && options.url.startsWith(`http://localhost:${APP_PORT}/ext/`)) {
      posted.push(JSON.parse(JSON.stringify(options.json)));
      if (betweenBlocks) {
        const hook = betweenBlocks;
        return Promise.resolve(hook(options.json)).then(() => originalRequest.call(httpUtils, options, callback, ...rest));
      }
    }
    return originalRequest.call(httpUtils, options, callback, ...rest);
  }

  const events = (requestId) => log.filter((e) => e.request_id === requestId);
  const ofType = (requestId, type) => events(requestId).filter((e) => e.type === type);
  const stepOf = (requestId, blockId) => ofType(requestId, 'step.started').find((s) => s.data.block_id === blockId);
  const doneOf = (requestId, step) => ofType(requestId, 'step.completed').find((s) => s.data.step_seq === step.seq);

  function send(text, requestId) {
    requestIds.push(requestId);
    tilebotService.sendMessageToBot({
      payload: {
        _id: uuidv4(),
        senderFullname: 'guest#367e',
        type: 'text',
        sender: 'A-SENDER',
        recipient: requestId,
        text: text,
        id_project: PROJECT_ID,
        request: { request_id: requestId }
      },
      token: CHATBOT_TOKEN
    }, BOT_ID, () => {});
  }

  /** Runs the start -> check -> after chain of a new conversation to its end. */
  async function runChain() {
    const rid = newRequestId();
    send('/start', rid);
    await waitFor(() => ofType(rid, 'execution.idle').length > 0 && ofType(rid, 'step.completed').length === 3, 'the chain to end');
    await new Promise((r) => setTimeout(r, 300));
    await ExecutionRecorder._drainForTests();
    return rid;
  }

  before(async function () {
    savedEnv = {};
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.EXECUTIONS_ENABLED = 'true';
    process.env.EXECUTIONS_STATE_HASH_KEY = 'jump-test-hash-key';
    process.env.EXECUTIONS_SEAL_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    process.env.EXECUTIONS_SEAL_KID = 'kid-jump';
    delete process.env.EXECUTIONS_AMQP_URL;
    delete process.env.AMQP_MANAGER_URL;
    delete process.env.CHATBOT_MAX_STEPS;
    delete process.env.EXECUTIONS_STATE_ENABLED;
    setEmitterForTests(fakeEmitter);

    client = redis.createClient({ url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}` });
    await client.connect();

    httpUtils.request = recordingRequest;

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
    await startTybot(suiteEndpoints());
    setEmitterForTests(null);
    ExecutionRecorder._resetForTests();
    const del = [];
    for (const id of new Set(log.map((e) => e.execution_id))) del.push(`exec:${id}`, `exec:${id}:seq`, `exec:${id}:state`);
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
  });

  describe('a chain start -> check -> after', function () {
    let rid;
    before(async function () {
      rid = await runChain();
    });

    it('the jump message carries attributes.execution_id', function () {
      const execId = events(rid)[0].execution_id;
      const jumps = posted.filter((m) => m.payload.recipient === rid);
      assert.deepStrictEqual(jumps.map((m) => m.payload.text), ['/start', '/#check', '/#after']);
      assert.ok(!jumps[0].payload.attributes, 'the first message comes from outside the flow: untouched');
      for (const m of jumps.slice(1)) assert.deepStrictEqual(m.payload.attributes, { execution_id: execId });
      assert.strictEqual(new Set(events(rid).map((e) => e.execution_id)).size, 1, 'one execution');
    });

    it('step.completed of the jumping block is emitted before the next block\'s step.started', function () {
      const evs = events(rid);
      const at = (e) => evs.indexOf(e);
      const start = stepOf(rid, 'start');
      const check = stepOf(rid, 'check');
      const after = stepOf(rid, 'after');
      assert.ok(doneOf(rid, start).seq < check.seq, 'start completed before check started');
      assert.ok(at(doneOf(rid, start)) < at(check));
      assert.ok(doneOf(rid, check).seq < after.seq, 'check completed before after started');
      assert.ok(at(doneOf(rid, check)) < at(after));
      const jumpAction = ofType(rid, 'action.completed').find((a) => a.data.action_id === 'act_goto_check');
      assert.strictEqual(jumpAction.data.exit_taken, 'jump');
      assert.ok(jumpAction.seq < doneOf(rid, start).seq);
    });

    it('exactly one execution.idle, at the end of the chain', function () {
      const evs = events(rid);
      assert.strictEqual(ofType(rid, 'execution.idle').length, 1);
      assert.strictEqual(evs[evs.length - 1].type, 'execution.idle');
    });

    it('next block\'s outside_changes are empty when nothing changed between blocks', function () {
      // each block runs in its own /ext call with a fresh ctx: prev comes from exec:{id}:state (the other-pod case)
      // the only change is the jump message's own id, labelled as the incoming message
      for (const blockId of ['check', 'after']) {
        const step = stepOf(rid, blockId);
        assert.deepStrictEqual(step.data.outside_changes.map((c) => [c.key, c.op, c.by]), [['last_message_id', 'set', 'message_in']],
          blockId + ': no change outside the flow');
        assert.strictEqual(step.data.state_keyframe, false, blockId + ': a delta against the saved state');
      }
    });
  });

  it('a server-side attribute write between blocks shows as by:"external"', async function () {
    betweenBlocks = async (message) => {
      if (message.payload.text !== '/#check') return;
      const key = TiledeskChatbot.requestCacheKey(message.payload.recipient) + ':parameters';
      await client.hSet(key, 'server_note', JSON.stringify('set by the server'));
    };
    const rid = await runChain();
    const check = stepOf(rid, 'check');
    assert.deepStrictEqual(check.data.outside_changes.map((c) => [c.key, c.op, c.by]).sort(),
      [['last_message_id', 'set', 'message_in'], ['server_note', 'add', 'external']]);
    const after = stepOf(rid, 'after');
    assert.ok(!after.data.outside_changes.some((c) => c.key === 'server_note'), 'recorded once, at the block after the write');
  });

  describe('sendMessageToBot', function () {
    let calls;
    beforeEach(function () {
      calls = [];
      httpUtils.request = function (options, callback) {
        calls.push(options);
        callback(null, { ok: true });
      };
    });
    afterEach(function () {
      httpUtils.request = recordingRequest;
    });

    const message = () => ({ payload: { text: '/next', recipient: 'r1' }, token: 't' });

    it('tracing off: posts synchronously, message untouched', function () {
      const m = message();
      let cbArgs;
      tilebotService.sendMessageToBot(m, BOT_ID, (...args) => { cbArgs = args; });
      assert.strictEqual(calls.length, 1, 'posted within the call');
      assert.deepStrictEqual(calls[0].json, message());
      assert.deepStrictEqual(cbArgs, [null, { ok: true }]);
    });

    it('a scope store (no onJump) posts synchronously too', function () {
      WriteTap.runScope('message_in', 'r1', () => {
        tilebotService.sendMessageToBot(message(), BOT_ID, () => {});
        assert.strictEqual(calls.length, 1);
      });
      assert.ok(!calls[0].json.payload.attributes);
    });

    it('in an action: onJump runs synchronously, the post waits for it, attributes are merged', async function () {
      let release;
      const seen = [];
      const onJump = (target) => { seen.push(target); return new Promise((r) => { release = r; }); };
      const m = message();
      m.payload.attributes = { keep: 1 };
      let done;
      const finished = new Promise((r) => { done = r; });
      WriteTap.runAction({ executionId: 'exec-1', requestId: 'r1', onJump }, () => {
        tilebotService.sendMessageToBot(m, BOT_ID, (...args) => done(args));
        assert.deepStrictEqual(seen, ['/next'], 'onJump called before sendMessageToBot returns');
      });
      await new Promise((r) => setImmediate(r));
      assert.strictEqual(calls.length, 0, 'not posted before the block exit is recorded');
      release();
      assert.deepStrictEqual(await finished, [null, { ok: true }]);
      assert.strictEqual(calls.length, 1);
      assert.deepStrictEqual(calls[0].json.payload.attributes, { keep: 1, execution_id: 'exec-1' });
    });

    it('a rejection in beforeJump is logged and the post goes on', async function () {
      const onJump = () => Promise.reject(new Error('boom'));
      let done;
      const finished = new Promise((r) => { done = r; });
      WriteTap.runAction({ executionId: 'exec-2', requestId: 'r1', onJump }, () => {
        tilebotService.sendMessageToBot(message(), BOT_ID, (...args) => done(args));
      });
      assert.deepStrictEqual(await finished, [null, { ok: true }]);
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0].json.payload.attributes.execution_id, 'exec-2');
    });

    it('a block exit that never settles is cut at EXECUTIONS_JUMP_BUDGET_MS and the post goes on', async function () {
      process.env.EXECUTIONS_JUMP_BUDGET_MS = '80';
      try {
        const onJump = () => new Promise(() => {}); // a hung exec Redis call
        let done;
        const finished = new Promise((r) => { done = r; });
        const t0 = Date.now();
        WriteTap.runAction({ executionId: 'exec-3', requestId: 'r1', onJump }, () => {
          tilebotService.sendMessageToBot(message(), BOT_ID, (...args) => done(args));
        });
        assert.deepStrictEqual(await finished, [null, { ok: true }]);
        const waited = Date.now() - t0;
        assert.ok(waited >= 70 && waited < 1000, 'posted after about the budget, waited ' + waited + ' ms');
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].json.payload.attributes.execution_id, 'exec-3');
      } finally {
        delete process.env.EXECUTIONS_JUMP_BUDGET_MS;
      }
    });

    it('tracing on: a post that throws synchronously reaches the callback as an error', async function () {
      httpUtils.request = function () { throw new Error('bad request options'); };
      let done;
      const finished = new Promise((r) => { done = r; });
      WriteTap.runAction({ executionId: 'exec-4', requestId: 'r1', onJump: async () => {} }, () => {
        tilebotService.sendMessageToBot(message(), BOT_ID, (...args) => done(args));
      });
      const [err] = await finished;
      assert.strictEqual(err.message, 'bad request options');
    });

    it('DirReplyV2 no-match fallback (DirMessageToBot) is recorded as a jump; the current execution_id overwrites a stale one', async function () {
      const rid = newRequestId();
      requestIds.push(rid);
      const ctx = await ExecutionRecorder.onMessageIn({ message: { request: { request_id: rid } }, bot: { name: 'b' }, botId: BOT_ID, requestId: rid, projectId: PROJECT_ID, token: CHATBOT_TOKEN });
      await ExecutionRecorder.blockEntry(ctx, { blockId: 'blk', blockName: 'blk' });
      // the user's original message, re-sent to the bot: it may carry the attributes of an older execution
      const original = { _id: uuidv4(), text: 'something else', sender: 'A-SENDER', recipient: rid, attributes: { execution_id: 'stale-exec', x: 1 }, request: { request_id: rid } };
      const directive = { name: 'replyv2', action: { _tdActionId: 'act_reply', _tdActionType: 'replyv2' } };
      await new Promise((resolve) => {
        ExecutionRecorder.runAction(ctx, { index: 0, directive }, () => {
          new DirMessageToBot({ supportRequest: { bot_id: BOT_ID }, token: CHATBOT_TOKEN }).execute({ action: { message: original } }, () => resolve());
        });
      });
      await ExecutionRecorder._drainForTests();
      assert.strictEqual(calls.length, 1);
      assert.deepStrictEqual(calls[0].json.payload.attributes, { execution_id: ctx.execution_id, x: 1 });
      const act = ofType(rid, 'action.completed').find((a) => a.data.action_id === 'act_reply');
      assert.strictEqual(act.data.exit_taken, 'jump');
      assert.strictEqual(ofType(rid, 'step.completed').length, 1, 'the block exit is recorded before the post');
      assert.ok(ctx.jumpInFlight);
    });
  });
});
