/**
 * Harness per gli unit test degli handler V4 — SENZA server/Redis/Mongo.
 *
 * Fornisce:
 *  - `makeCache()`  → tdcache in-memory (hset/hget/hgetall/hdel + get/set/del);
 *  - `makeCtx()`    → un HandlerContext identico a quello reale (`variables`, `fill`,
 *                     `sender` fake che registra i messaggi, `params` getter);
 *  - micro asserzioni (`ok`, `eq`, `run`).
 *
 * Un handler si testa così: `const r = await handler.execute(node, ctx)` e si
 * verificano `r` + le variabili scritte (`await ctx.variables.all()`) + `ctx.sender.sent`.
 */
const { createVariables } = require('../variables-V4.js');
const { Filler } = require('../../tiledeskChatbotPlugs/Filler.js');

function makeCache() {
  const hashes = {};
  const kv = {};
  return {
    async hset(k, f, v) { (hashes[k] = hashes[k] || {})[f] = v; },
    async hget(k, f) { return (hashes[k] || {})[f] != null ? hashes[k][f] : null; },
    async hgetall(k) { return hashes[k] ? { ...hashes[k] } : null; },
    async hdel(k, f) { if (hashes[k]) delete hashes[k][f]; },
    async get(k) { return kv[k] != null ? kv[k] : null; },
    async set(k, v) { kv[k] = v; },
    async del(k) { delete kv[k]; },
    _hashes: hashes,
    _kv: kv,
  };
}

function makeSender(params) {
  const filler = new Filler();
  const sender = {
    params: params || {},
    filler,
    sentCount: 0,
    sent: [],
    hasSent() { return this.sentCount > 0; },
    async sendV4Messages(messages, buttonSlotMap) {
      // riproduce il fill del testo + skip vuoti come il sender reale (semplificato)
      for (const m of messages || []) {
        const text = filler.fill(m.text != null ? m.text : '', { ...sender.params });
        this.sent.push({ type: m.type || 'text', text, buttons: m.buttons || null, raw: m });
        this.sentCount++;
      }
    },
    async sendText(t) { this.sent.push({ type: 'text', text: t }); this.sentCount++; },
    async refreshParams() { if (this._reload) await this._reload(); },
  };
  return sender;
}

function makeCtx(opts) {
  opts = opts || {};
  const cache = opts.cache || makeCache();
  const requestId = opts.requestId || 'test-req-1';
  const variables = createVariables(cache, requestId);
  const standard = { chatbot_id: 'B', chatbot_name: 'TestBot', conversation_id: requestId };
  const sender = makeSender({ ...standard, ...(opts.params || {}) });
  sender._reload = async () => {
    const all = await variables.all();
    sender.params = { ...all, ...standard, ...(opts.params || {}) };
  };
  const ctx = {
    tdcache: cache,
    requestId,
    projectId: opts.projectId || 'P',
    token: opts.token || 'T',
    tilebotEndpoint: opts.tilebotEndpoint || 'http://localhost:3000',
    botId: opts.botId || 'B',
    bot: opts.bot || { name: 'TestBot' },
    sender,
    message: opts.message || { text: '' },
    nodes: opts.nodes || [],
    variables,
    // mock dei service (configurabile via opts.mock: {isOpen, onlineAgents})
    services: opts.services || require('../services/mock-services.js').create({ mock: opts.mock }),
    get params() { return sender.params; },
    fill(text) { return sender.filler.fill(text || '', { ...sender.params }); },
  };
  return ctx;
}

// ── micro test runner ────────────────────────────────────────────────────────
let _pass = 0;
let _fail = 0;
function ok(cond, msg) {
  if (cond) { _pass++; console.log('  ✓ ' + msg); }
  else { _fail++; console.log('  ✗ ' + msg); }
}
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(a === e, msg + (a === e ? '' : ` (atteso ${e}, ottenuto ${a})`));
}
async function run(name, fn) {
  console.log('• ' + name);
  try { await fn(); } catch (err) { _fail++; console.log('  ✗ EXCEPTION: ' + (err && err.stack || err)); }
}
function summary() {
  console.log(`\n=== ${_pass} pass, ${_fail} fail ===`);
  if (_fail > 0) process.exitCode = 1;
}

module.exports = { makeCache, makeSender, makeCtx, ok, eq, run, summary };
