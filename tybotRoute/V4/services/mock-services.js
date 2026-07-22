const winston = require('../../utils/winston');

/**
 * Mock dei servizi esterni del motore V4 (routing/operatore, HTTP, AI).
 * Deterministico e senza I/O: registra le chiamate in `_calls` e ritorna valori
 * configurabili (`opts.mock`). Usato dai test e quando i backend non sono disponibili.
 */
function create(opts) {
  opts = opts || {};
  const cfg = Object.assign({ isOpen: true, onlineAgents: true }, opts.mock || {});
  const calls = [];
  const note = (m) => { calls.push(m); winston.verbose('(services:mock) ' + m); };
  return {
    _calls: calls,
    // disponibilità (branching)
    async isOpen() { note('isOpen'); return !!cfg.isOpen; },
    async onlineAgents() { note('onlineAgents'); return !!cfg.onlineAgents; },
    // operazioni conversazione
    async transferToAgent() { note('transferToAgent'); },
    async changeDepartment(name) { note('changeDepartment:' + name); },
    async moveToUnassigned() { note('moveToUnassigned'); },
    async closeRequest() { note('closeRequest'); },
    async clearTranscript() { note('clearTranscript'); },
    async addTags(tags, target, pushToList) { note('addTags:' + JSON.stringify(tags) + ':' + target + ':' + !!pushToList); return { ok: true }; },
    async leadUpdate(update) { note('leadUpdate:' + JSON.stringify(update)); },
    async replaceBot(o) { note('replaceBot:' + JSON.stringify(o)); },
    // HTTP / integrazioni (Fase 3)
    async http(req) {
      note('http:' + (req.method || 'GET') + ' ' + req.url);
      if (cfg.httpError) return { ok: false, status: cfg.httpStatus || 500, body: null, error: 'mock http error' };
      return { ok: true, status: cfg.httpStatus || 200, body: cfg.httpBody !== undefined ? cfg.httpBody : { echo: req.body || null }, error: null };
    },
    async sendEmail(opts) { note('sendEmail:' + (opts && opts.to)); return { ok: !cfg.emailError }; },
    async sendWhatsapp(opts) { note('sendWhatsapp:' + (opts && opts.templateName)); return { ok: !cfg.whatsappError, error: cfg.whatsappError ? 'mock wa error' : null }; },
    // AI / KB (Fase 4)
    async aiPrompt(opts) {
      note('aiPrompt:' + (opts && opts.model));
      if (cfg.aiError) return { ok: false, reply: null, error: 'mock ai error' };
      return { ok: true, reply: cfg.aiReply !== undefined ? cfg.aiReply : 'MOCK_ANSWER', error: null };
    },
    async askKb(opts) {
      note('askKb:' + (opts && opts.namespace));
      if (cfg.aiError) return { ok: false, reply: null, source: null, error: 'mock kb error' };
      return { ok: true, reply: cfg.aiReply !== undefined ? cfg.aiReply : 'MOCK_KB_ANSWER', source: 'https://mock/source', error: null };
    },
    async gptAssistant(opts) {
      note('gptAssistant:' + (opts && opts.assistantId));
      if (cfg.aiError) return { ok: false, result: null, error: 'mock assistant error' };
      return { ok: true, result: cfg.aiReply !== undefined ? cfg.aiReply : 'MOCK_ASSISTANT', error: null };
    },
    async aiCondition(opts) {
      note('aiCondition');
      if (cfg.aiError) return { ok: false, branchId: null, error: 'mock ai_condition error' };
      const branches = (opts && (opts.branches || opts.intents)) || []; // intents = legacy
      // mock: classifica sul primo ramo (o cfg.matchBranchId / legacy cfg.matchIntentId)
      const branchId = cfg.matchBranchId || cfg.matchIntentId || (branches[0] && branches[0].id) || null;
      return { ok: true, branchId, reply: 'MOCK', error: null };
    },
    async addKbContent(opts) { note('addKbContent:' + (opts && opts.question)); return { ok: !cfg.aiError }; },
    // Composio (Fase 4) — tool generico (toolkit/tool/arguments)
    async composioExecute(opts) {
      note('composioExecute:' + (opts && opts.toolkit) + '/' + (opts && opts.tool));
      if (cfg.composioError) return { ok: false, error: 'mock composio error' };
      return { ok: true, data: { mock: true, tool: opts && opts.tool } };
    },
  };
}

module.exports = { create };
