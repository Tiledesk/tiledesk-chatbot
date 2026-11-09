'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const tybot = require('../');
const winston = require('../utils/winston');
const httpUtils = require('../utils/HttpUtils');
const tilebotService = require('../services/TilebotService');
const ExecutionRecorder = require('../executions/ExecutionRecorder');
const { ExecutionStore } = require('../executions/ExecutionStore');
const { setEmitterForTests } = require('../executions/TraceEmitter');
const { DirReplaceBot } = require('../tiledeskChatbotPlugs/directives/DirReplaceBot');
const subagentFixture = require('./conversation-call-subagent_bots.js');

const { PARENT_BOT_ID, SUBAGENT_BOT_ID } = subagentFixture;
const PROJECT_ID = 'projectID';
const CHATBOT_TOKEN = 'XXX';
const REPLACER_V2_BOT_ID = 'replacerV2BotID';
const REPLACER_V3_BOT_ID = 'replacerV3BotID';
const TARGET_BOT_ID = 'targetBotID';
const TARGET_SLUG = 'target-bot';
const PARENT_INVOKE_BLOCK = '10000000-0000-0000-0000-000000000001';
const SUBAGENT_START_BLOCK = '20000000-0000-0000-0000-000000000001';
const AFTER_RETURN_BLOCK = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
// Own ports: block jumps come back to APP_PORT, bot replies and replace calls land on API_PORT.
const APP_PORT = 10031;
const API_PORT = 10032;
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'executions-events.sample.json');

const ENV_KEYS = ['EXECUTIONS_ENABLED', 'EXECUTIONS_STATE_ENABLED', 'EXECUTIONS_STATE_HASH_KEY', 'EXECUTIONS_SEAL_PUBLIC_KEY', 'EXECUTIONS_SEAL_KID',
  'EXECUTIONS_AMQP_URL', 'AMQP_MANAGER_URL', 'CHATBOT_MAX_STEPS', 'EXECUTIONS_JUMP_BUDGET_MS'];

function normalizeBot(bot) {
  const intents = bot.intents;
  bot.intents = {};
  bot.intents_by_intent_id = {};
  for (const intent of intents) {
    bot.intents[intent.intent_display_name] = intent;
    bot.intents_by_intent_id[intent.intent_id] = intent;
  }
  return bot;
}

function block(name, id, actions) {
  return { webhook_enabled: false, enabled: true, language: 'en', intent_display_name: name, intent_id: id, question: '', form: {}, actions };
}

function replyAction(text) {
  return { _tdActionType: 'reply', text: '...', attributes: { commands: [{ type: 'message', message: { type: 'text', text } }] } };
}

function replacerBot(name, action) {
  return normalizeBot({ webhook_enabled: false, language: 'en', name, type: 'tilebot', intents: [block('go', name + '-go', [action])] });
}

const bots_data = {
  bots: Object.assign({}, subagentFixture.bots_data.bots, {
    [REPLACER_V3_BOT_ID]: replacerBot('Replacer v3', {
      _tdActionType: 'replacebotv3', _tdActionId: 'act_replace_v3', botId: TARGET_BOT_ID, useSlug: false, blockName: 'hello'
    }),
    [REPLACER_V2_BOT_ID]: replacerBot('Replacer v2', {
      _tdActionType: 'replacebotv2', _tdActionId: 'act_replace_v2', botName: TARGET_SLUG, nameAsSlug: true, blockName: 'hello'
    }),
    [TARGET_BOT_ID]: normalizeBot({
      webhook_enabled: false, language: 'en', name: 'Target bot', type: 'tilebot',
      intents: [block('hello', 'target-hello', [replyAction('Target here')])]
    })
  })
};

const app = express();
app.use('/', tybot.router);
app.use((err, req, res, next) => { winston.error('General error', err); });

function newRequestId() {
  return 'support-group-' + PROJECT_ID + '-' + uuidv4().replace(/-/g, '');
}

function listen(server, port) {
  return new Promise((resolve) => { const l = server.listen(port, '0.0.0.0', () => resolve(l)); });
}

function close(listener) {
  return new Promise((resolve) => (listener ? listener.close(() => resolve()) : resolve()));
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

function visibleText(message) {
  const commands = message.attributes && message.attributes.commands;
  const cmd = commands && commands.find((c) => c.type === 'message');
  return (cmd && cmd.message && cmd.message.text) || null;
}

describe('Executions: subagents, replace bot, event fixture', function () {
  this.timeout(30000);

  let savedEnv;
  let appListener, apiListener;
  let client;
  const log = [];
  const requestIds = [];
  const activeBot = {};       // request id -> bot that owns the conversation (as the server would track it)
  const replaceBodies = {};   // request id -> bodies of the replace calls, as received
  const messages = {};        // request id -> messages the bots sent
  const duringSubagent = {};  // request id -> exec:* snapshot taken when the subagent is triggered
  const originalRequest = httpUtils.request;
  const fakeEmitter = {
    emit(envelope) { log.push(envelope); },
    async flush() {},
    stats() { return { published: 0, dropped: 0, buffered: 0 }; },
    stop() {}
  };

  // RequestService reads API_ENDPOINT once, at load: its replace calls are sent to this file's mock.
  function redirectingRequest(options, callback, ...rest) {
    if (options && typeof options.url === 'string') {
      const m = options.url.match(/^https?:\/\/[^/]+(\/[^/]+\/requests\/([^/]+)\/replace)$/);
      if (m && requestIds.includes(m[2])) options = Object.assign({}, options, { url: `http://localhost:${API_PORT}${m[1]}` });
    }
    return originalRequest.call(httpUtils, options, callback, ...rest);
  }

  const events = (requestId) => log.filter((e) => e.request_id === requestId);
  const ofType = (requestId, type) => events(requestId).filter((e) => e.type === type);
  const texts = (requestId) => (messages[requestId] || []).map(visibleText).filter(Boolean);

  function send(text, requestId, botId) {
    if (!requestIds.includes(requestId)) requestIds.push(requestId);
    activeBot[requestId] = activeBot[requestId] || botId;
    tilebotService.sendMessageToBot({
      payload: {
        _id: uuidv4(),
        senderFullname: 'guest#367e',
        type: 'text',
        sender: 'A-SENDER',
        recipient: requestId,
        text: text,
        id_project: PROJECT_ID,
        request: { request_id: requestId, id_project: PROJECT_ID }
      },
      token: CHATBOT_TOKEN
    }, botId, () => {});
  }

  async function settle() {
    await new Promise((r) => setTimeout(r, 300));
    await ExecutionRecorder._drainForTests();
  }

  before(async function () {
    savedEnv = {};
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.EXECUTIONS_ENABLED = 'true';
    process.env.EXECUTIONS_STATE_HASH_KEY = 'subagent-test-hash-key';
    process.env.EXECUTIONS_SEAL_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' });
    process.env.EXECUTIONS_SEAL_KID = 'kid-subagent';
    delete process.env.EXECUTIONS_AMQP_URL;
    delete process.env.AMQP_MANAGER_URL;
    delete process.env.CHATBOT_MAX_STEPS;
    delete process.env.EXECUTIONS_STATE_ENABLED;
    setEmitterForTests(fakeEmitter);

    client = redis.createClient({ url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}` });
    await client.connect();

    httpUtils.request = redirectingRequest;

    const api = express();
    api.use(bodyParser.json());
    api.put('/:projectId/requests/:requestId/replace', (req, res) => {
      const rid = req.params.requestId;
      (replaceBodies[rid] = replaceBodies[rid] || []).push(req.body);
      const botId = req.body.id || (req.body.slug === TARGET_SLUG ? TARGET_BOT_ID : null);
      if (botId) activeBot[rid] = botId;
      res.send({ success: true, replaced_bot_root_id: botId });
    });
    api.post('/:projectId/requests/:requestId/messages', async (req, res) => {
      res.send({ success: true });
      const rid = req.params.requestId;
      const message = req.body;
      (messages[rid] = messages[rid] || []).push(message);
      // a hidden /block command after a replace: the server hands it to the bot now in the conversation
      if (message.attributes && message.attributes.subtype === 'info' && typeof message.text === 'string' && message.text.startsWith('/')) {
        if (activeBot[rid] === SUBAGENT_BOT_ID && !duringSubagent[rid]) {
          const alias = await client.get(`exec:req:${rid}:${SUBAGENT_BOT_ID}`);
          duringSubagent[rid] = {
            alias,
            parent: await client.get(`exec:req:${rid}:${PARENT_BOT_ID}`),
            stack: alias ? await client.hGet(`exec:${alias}`, 'agent_stack') : null
          };
        }
        send(message.text, rid, activeBot[rid]);
      }
    });
    api.patch('/:projectId/requests/:requestId/attributes', (req, res) => res.send({ success: true }));
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
    await startTybot({ TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT, API_ENDPOINT: process.env.API_ENDPOINT });
    setEmitterForTests(null);
    ExecutionRecorder._resetForTests();
    const del = [];
    for (const id of new Set(log.map((e) => e.execution_id))) del.push(`exec:${id}`, `exec:${id}:seq`, `exec:${id}:state`);
    for (const rid of requestIds) {
      for await (const k of client.scanIterator({ MATCH: `*${rid}*`, COUNT: 1000 })) {
        if (Array.isArray(k)) del.push(...k); else del.push(k);
      }
    }
    if (del.length) await client.del(del);
    await client.quit();
    await close(appListener);
    await close(apiListener);
  });

  describe('call subagent and return', function () {
    let rid;
    before(async function () {
      rid = newRequestId();
      send('/invoke_subagent', rid, PARENT_BOT_ID);
      await waitFor(() => texts(rid).includes('Subagent returned to the parent'), 'the parent to resume');
      await waitFor(() => {
        const resumed = ofType(rid, 'step.started').find((s) => s.data.block_id === AFTER_RETURN_BLOCK);
        return resumed && ofType(rid, 'step.completed').some((s) => s.data.step_seq === resumed.seq);
      }, 'the parent chain to end');
      await settle();
    });

    it('subagent steps share the parent\'s execution_id and carry the subagent\'s agent_id', function () {
      const evs = events(rid);
      assert.strictEqual(new Set(evs.map((e) => e.execution_id)).size, 1, 'one execution for the whole call');
      assert.strictEqual(ofType(rid, 'execution.started').length, 1);
      const agentOf = (blockId) => ofType(rid, 'step.started').find((s) => s.data.block_id === blockId);
      assert.strictEqual(agentOf(PARENT_INVOKE_BLOCK).agent_id, PARENT_BOT_ID);
      assert.strictEqual(agentOf(SUBAGENT_START_BLOCK).agent_id, SUBAGENT_BOT_ID);
      assert.strictEqual(agentOf(SUBAGENT_START_BLOCK).agent_version, SUBAGENT_BOT_ID);
      assert.strictEqual(agentOf(AFTER_RETURN_BLOCK).agent_id, PARENT_BOT_ID);
      // while the subagent ran: the alias pointed at the caller's execution, with the caller's frame on the stack
      const snap = duringSubagent[rid];
      assert.ok(snap, 'snapshot taken when the subagent was triggered');
      assert.strictEqual(snap.alias, evs[0].execution_id);
      assert.strictEqual(snap.parent, evs[0].execution_id);
      assert.deepStrictEqual(JSON.parse(snap.stack), [{ agent_id: PARENT_BOT_ID, agent_version: PARENT_BOT_ID, return_block: '#' + AFTER_RETURN_BLOCK }]);
    });

    it('return removes the alias', async function () {
      const execId = events(rid)[0].execution_id;
      assert.strictEqual(await client.exists(`exec:req:${rid}:${SUBAGENT_BOT_ID}`), 0);
      assert.strictEqual(await client.get(`exec:req:${rid}:${PARENT_BOT_ID}`), execId, 'the caller\'s own key stays');
      assert.deepStrictEqual(JSON.parse(await client.hGet(`exec:${execId}`, 'agent_stack')), []);
    });

    it('replace call body has reason subagent_call / subagent_return', function () {
      assert.deepStrictEqual(replaceBodies[rid], [
        { id: SUBAGENT_BOT_ID, reason: 'subagent_call' },
        { id: PARENT_BOT_ID, reason: 'subagent_return' }
      ]);
    });
  });

  describe('replace bot v2 / v3', function () {
    for (const [label, replacerId, body] of [
      ['v3 (by id)', REPLACER_V3_BOT_ID, { id: TARGET_BOT_ID }],
      ['v2 (by slug)', REPLACER_V2_BOT_ID, { slug: TARGET_SLUG }]
    ]) {
      it(`replace bot emits handed_to_bot and the next bot's execution.started has parent_execution_id: ${label}`, async function () {
        const rid = newRequestId();
        send('/go', rid, replacerId);
        await waitFor(() => texts(rid).includes('Target here'), 'the target bot to reply');
        await waitFor(() => ofType(rid, 'execution.idle').length === 2, 'both chains to end');
        await settle();

        const started = ofType(rid, 'execution.started');
        assert.strictEqual(started.length, 2, 'the target bot runs its own execution');
        const parent = started.find((e) => e.agent_id === replacerId);
        const child = started.find((e) => e.agent_id === TARGET_BOT_ID);
        assert.notStrictEqual(parent.execution_id, child.execution_id);
        const handed = ofType(rid, 'execution.handed_to_bot');
        assert.strictEqual(handed.length, 1);
        assert.strictEqual(handed[0].execution_id, parent.execution_id);
        assert.deepStrictEqual(handed[0].data, { to_bot_id: TARGET_BOT_ID });
        assert.strictEqual(child.data.parent_execution_id, parent.execution_id);
        assert.strictEqual(await client.exists(`exec:handoff:${rid}`), 0, 'the handoff is consumed by the child');
        assert.deepStrictEqual(replaceBodies[rid], [body]);
      });
    }
  });

  describe('replace bot v1 (by name, no root id in the response)', function () {
    let store;
    before(function () {
      store = new ExecutionStore(client);
    });

    function directive(execution, replaceErr) {
      const rid = newRequestId();
      requestIds.push(rid);
      const dir = new DirReplaceBot({
        requestId: rid,
        projectId: PROJECT_ID,
        token: CHATBOT_TOKEN,
        API_ENDPOINT: `http://localhost:${API_PORT}`,
        tdcache: { hgetall: async () => ({}) },
        reply: {},
        chatbot: { execution: execution && Object.assign({ request_id: rid }, execution) }
      });
      dir.tdClient.replaceBotByName = (requestId, botName, cb) => cb(replaceErr);
      return { rid, dir };
    }

    it('records the handoff to the requested name and emits handed_to_bot', async function () {
      const execId = 'exec-v1-' + uuidv4();
      const { rid, dir } = directive({ execution_id: execId, id_project: PROJECT_ID, agent_id: 'v1BotID', agent_version: 'v1BotID', _store: store });
      await new Promise((resolve) => dir.execute({ action: { botName: 'Target bot' } }, resolve));
      await ExecutionRecorder._drainForTests();
      assert.deepStrictEqual(JSON.parse(await client.get(`exec:handoff:${rid}`)), { parent_execution_id: execId, to_agent_id: 'Target bot' });
      const handed = ofType(rid, 'execution.handed_to_bot');
      assert.strictEqual(handed.length, 1);
      assert.deepStrictEqual(handed[0].data, { to_bot_id: 'Target bot' });
      await client.del([`exec:handoff:${rid}`, `exec:${execId}:seq`]);
    });

    it('a failed replace records nothing; a null ctx records nothing', async function () {
      const failed = directive({ execution_id: 'exec-v1-' + uuidv4(), id_project: PROJECT_ID, agent_id: 'v1BotID', agent_version: 'v1BotID', _store: store }, new Error('not found'));
      await new Promise((resolve) => failed.dir.execute({ action: { botName: 'Nope' } }, resolve));
      const off = directive(null);
      await new Promise((resolve) => off.dir.execute({ action: { botName: 'Target bot' } }, resolve));
      await ExecutionRecorder._drainForTests();
      for (const rid of [failed.rid, off.rid]) {
        assert.strictEqual(await client.exists(`exec:handoff:${rid}`), 0);
        assert.strictEqual(events(rid).length, 0);
      }
    });

    it('the subagent and replace helpers are no-ops on a null ctx', async function () {
      assert.strictEqual(await ExecutionRecorder.onSubagentCall(null, { subagentRootId: 'x', returnBlock: '#y' }), null);
      assert.strictEqual(await ExecutionRecorder.onSubagentReturn(null), null);
      assert.strictEqual(await ExecutionRecorder.onHandedToBot(null, { toAgentId: 'x' }), null);
    });
  });

  // last: mocha runs a suite's own tests before its sub-suites, so this sits in a sub-suite of its own
  describe('event fixture', function () {
    it('writes every envelope seen in this file to test/fixtures/executions-events.sample.json', function () {
      const byType = new Map();
      for (const envelope of log) if (!byType.has(envelope.type)) byType.set(envelope.type, envelope);
      const sample = [...byType.keys()].sort().map((type) => byType.get(type));
      for (const type of ['execution.started', 'step.started', 'action.completed', 'step.completed', 'execution.idle', 'execution.handed_to_bot']) {
        assert.ok(byType.has(type), 'saw ' + type);
      }
      for (const e of sample) {
        assert.deepStrictEqual(Object.keys(e).sort(),
          ['agent_id', 'agent_version', 'at', 'data', 'event_version', 'execution_id', 'id_project', 'pod', 'request_id', 'seq', 'type']);
      }
      fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
      fs.writeFileSync(FIXTURE_PATH, JSON.stringify(sample, null, 2) + '\n');
      assert.deepStrictEqual(JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')).map((e) => e.type), [...byType.keys()].sort());
    });
  });
});
