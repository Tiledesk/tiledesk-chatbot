'use strict';

// first: sets the endpoint defaults before the engine modules load
const { listen, close, suiteEndpoints } = require('./helpers/executionsTestServer');

const assert = require('assert');
const axios = require('axios');
const express = require('express');
const bodyParser = require('body-parser');
const redis = require('redis');
const { v4: uuidv4 } = require('uuid');
const tybot = require('../');
const winston = require('../utils/winston');
const tilebotService = require('../services/TilebotService');
const ExecutionRecorder = require('../executions/ExecutionRecorder');
const { detectTrigger } = require('../executions/trigger');
const { setEmitterForTests } = require('../executions/TraceEmitter');
const { getTestKeys, openSealed } = require('./helpers/executionsTestKeys');
const bots_data = require('./executions_lifecycle_bot.js').bots_data;

const PROJECT_ID = 'projectID';
const BOT_ID = 'botID';
const CHATBOT_TOKEN = 'XXX';
const APP_PORT = 10081;
const API_PORT = 10082;

const ENV_KEYS = ['EXECUTIONS_ENABLED', 'EXECUTIONS_STATE_ENABLED', 'EXECUTIONS_STATE_HASH_KEY', 'EXECUTIONS_SEAL_PUBLIC_KEY', 'EXECUTIONS_SEAL_KID',
  'EXECUTIONS_AMQP_URL', 'AMQP_MANAGER_URL'];

const app = express();
app.use('/', tybot.router);
app.use((err, req, res, next) => { winston.error('General error', err); });

async function waitFor(pred, what, timeoutMs = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('timed out waiting for ' + what);
}

const OID = 'a1b2c3d4e5f60718293a4b5c';

describe('Executions: retry_of and automation trigger id', function () {
  this.timeout(30000);

  let savedEnv, appListener, apiListener, client;
  const log = [];
  const requestIds = [];
  const fakeEmitter = {
    emit(envelope) { log.push({ event: envelope }); },
    async flush() {},
    stats() { return { published: 0, dropped: 0, buffered: 0 }; },
    stop() {}
  };
  const started = () => log.filter((e) => e.event && e.event.type === 'execution.started').map((e) => e.event);

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

  before(async function () {
    savedEnv = {};
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    process.env.EXECUTIONS_ENABLED = 'true';
    process.env.EXECUTIONS_STATE_HASH_KEY = 'retry-test-hash-key';
    process.env.EXECUTIONS_SEAL_PUBLIC_KEY = getTestKeys().publicKeyPem;
    process.env.EXECUTIONS_SEAL_KID = 'kid-retry';
    delete process.env.EXECUTIONS_AMQP_URL;
    delete process.env.AMQP_MANAGER_URL;
    delete process.env.EXECUTIONS_STATE_ENABLED;
    setEmitterForTests(fakeEmitter);
    client = redis.createClient({ url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}` });
    await client.connect();
    const api = express();
    api.use(bodyParser.json());
    api.post('/:projectId/requests/:requestId/messages', (req, res) => res.send({ success: true }));
    api.patch('/:projectId/requests/:requestId/attributes', (req, res) => res.send({ success: true }));
    apiListener = await listen(api, API_PORT);
    await startTybot();
    appListener = await listen(app, APP_PORT);
  });

  after(async function () {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    await startTybot(suiteEndpoints());
    setEmitterForTests(null);
    ExecutionRecorder._resetForTests();
    const del = [];
    for (const id of new Set(log.filter((e) => e.event).map((e) => e.event.execution_id))) del.push(`exec:${id}`, `exec:${id}:seq`, `exec:${id}:state`, `exec:${id}:cp`);
    for (const rid of new Set(requestIds)) del.push(`exec:req:${rid}:${BOT_ID}`, `tilebot:${rid}`, `tilebot:botId_requests:${rid}`);
    if (del.length) await client.del(del);
    await client.quit();
    await close(appListener);
    await close(apiListener);
  });

  it('automation source_id is the webhook id from the request id', function () {
    const t = (rid) => detectTrigger({ request: {} }, rid, 'b');
    assert.strictEqual(t(`automation-request-p1-${OID}-wh_abc123`).source_id, 'wh_abc123');
    assert.strictEqual(t(`automation-request-p1-${OID}-wh_abc123`).type, 'automation');
    // defensive: anything off the exact pattern leaves source_id null
    const uuid = uuidv4().replace(/-/g, '');
    assert.strictEqual(t(`automation-request-p1-${uuid}`).source_id, null, 'no webhook id (a block run)');
    assert.strictEqual(t(`automation-request-p1-${OID.slice(1)}-wh`).source_id, null, 'short ObjectId');
    assert.strictEqual(t(`automation-request-p1-${OID.toUpperCase()}-wh`).source_id, null, 'not lowercase hex');
    assert.strictEqual(t(`automation-request-p1-${OID}-`).source_id, null, 'empty id');
    assert.strictEqual(t(`automation-request-p1-${OID}-a b`).source_id, null, 'odd characters');
    assert.strictEqual(t('automation-request-').source_id, null);
  });

  it('execution.started carries retry_of from request attributes', async function () {
    const rid = 'support-group-' + PROJECT_ID + '-' + uuidv4().replace(/-/g, '');
    requestIds.push(rid);
    tilebotService.sendMessageToBot({
      payload: { _id: uuidv4(), type: 'text', sender: 'A-SENDER', recipient: rid, text: '/count', id_project: PROJECT_ID,
        request: { request_id: rid, attributes: { retry_of: 'exec-old-1', payload: { x: 1 } } } },
      token: CHATBOT_TOKEN
    }, BOT_ID, () => {});
    await waitFor(() => started().some((e) => e.request_id === rid), 'execution.started');
    const ev = started().find((e) => e.request_id === rid);
    assert.strictEqual(ev.data.retry_of, 'exec-old-1');
    assert.ok(!('retry_of' in ev.data.trigger));
  });

  it('execution.started has no retry_of when none is given', async function () {
    const rid = 'support-group-' + PROJECT_ID + '-' + uuidv4().replace(/-/g, '');
    requestIds.push(rid);
    tilebotService.sendMessageToBot({
      payload: { _id: uuidv4(), type: 'text', sender: 'A-SENDER', recipient: rid, text: '/count', id_project: PROJECT_ID, request: { request_id: rid } },
      token: CHATBOT_TOKEN
    }, BOT_ID, () => {});
    await waitFor(() => started().some((e) => e.request_id === rid), 'execution.started');
    assert.ok(!('retry_of' in started().find((e) => e.request_id === rid).data));
  });

  it('retry_of in the message attributes is ignored (only the request attributes the server refire sets count)', async function () {
    const rid = 'support-group-' + PROJECT_ID + '-' + uuidv4().replace(/-/g, '');
    requestIds.push(rid);
    tilebotService.sendMessageToBot({
      payload: { _id: uuidv4(), type: 'text', sender: 'A-SENDER', recipient: rid, text: '/count', id_project: PROJECT_ID,
        attributes: { retry_of: 'exec-spoofed' }, request: { request_id: rid } },
      token: CHATBOT_TOKEN
    }, BOT_ID, () => {});
    await waitFor(() => started().some((e) => e.request_id === rid), 'execution.started');
    assert.ok(!('retry_of' in started().find((e) => e.request_id === rid).data));
  });

  it('/block lifts retry_of out of the payload', async function () {
    const before = started().length;
    const res = await axios.request({ method: 'post', url: `http://localhost:${APP_PORT}/block/${PROJECT_ID}/${BOT_ID}/count`,
      data: { async: true, token: CHATBOT_TOKEN, retry_of: 'exec-old-2', order: 7 } });
    assert.strictEqual(res.status, 200);
    await waitFor(() => started().length > before, 'execution.started');
    const ev = started()[started().length - 1];
    requestIds.push(ev.request_id);
    assert.strictEqual(ev.data.retry_of, 'exec-old-2');
    assert.strictEqual(ev.data.trigger.type, 'automation');
    // the payload that gets sealed no longer holds retry_of
    const plain = openSealed(ev.data.sealed_trigger_payload, getTestKeys().privateKeyPem);
    assert.deepStrictEqual(plain, { order: 7 });
  });
});
