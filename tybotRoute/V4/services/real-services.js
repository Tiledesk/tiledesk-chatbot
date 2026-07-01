const winston = require('../../utils/winston');

/**
 * Implementazione REAL dei servizi esterni: usa `@tiledesk/tiledesk-client` per le
 * operazioni sulla conversazione (le stesse del runtime V3) e `API_ENDPOINT` per
 * gli endpoint REST. Selezionata con env `V4_SERVICES_REAL=1`.
 *
 * NB: alcune chiamate (disponibilità orari/agenti, addTags, clearTranscript) sono
 * marcate TODO finché non si conferma l'endpoint locale; nel frattempo restano
 * conservative (default sicuro) e non bloccano il flow.
 */
function create(opts) {
  opts = opts || {};
  const { projectId, requestId, token } = opts;
  const API = opts.apiEndpoint || process.env.API_ENDPOINT || process.env.API_URL;
  let tdClient = null;
  try {
    const { TiledeskClient } = require('@tiledesk/tiledesk-client');
    tdClient = new TiledeskClient({ projectId, token, APIURL: API, APIKEY: '___' });
  } catch (err) {
    winston.error('(services:real) init TiledeskClient: ', err);
  }
  const cb = (fn) => new Promise((res) => { try { fn((err) => res(!err)); } catch (e) { res(false); } });

  return {
    async isOpen() { winston.verbose('(services:real) isOpen → TODO endpoint, default true'); return true; },
    async onlineAgents() { winston.verbose('(services:real) onlineAgents → TODO endpoint, default true'); return true; },
    async transferToAgent() { if (tdClient) await cb((c) => tdClient.moveToAgent(requestId, c)); },
    async moveToUnassigned() { if (tdClient) await cb((c) => tdClient.updateRequestParticipants(requestId, [], c)); },
    // Chiude la conversazione lato server (status closed) — come il `DirClose`
    // V3: è ciò che fa comparire la "valutazione servizio" nel web widget.
    async closeRequest() { if (tdClient) await cb((c) => tdClient.closeRequest(requestId, c)); },
    async changeDepartment(name) { winston.verbose('(services:real) changeDepartment TODO: ' + name); },
    async clearTranscript() { winston.verbose('(services:real) clearTranscript TODO'); },
    async addTags(tags) { winston.verbose('(services:real) addTags TODO: ' + JSON.stringify(tags)); },
    async leadUpdate(update) { winston.verbose('(services:real) leadUpdate TODO: ' + JSON.stringify(update)); },
    async replaceBot(o) { winston.verbose('(services:real) replaceBot TODO: ' + JSON.stringify(o)); },
    // HTTP — implementato (riusa HttpUtils/axios del runtime V3).
    async http(req) {
      try {
        const httpUtils = require('../../utils/HttpUtils');
        return await new Promise((res) => {
          httpUtils.request(
            { url: req.url, method: req.method || 'GET', headers: req.headers || {}, json: req.body, timeout: req.timeoutMs || 20000 },
            (err, resbody, fullres) => {
              const status = (fullres && fullres.statusCode) || (err ? 500 : 200);
              if (err) res({ ok: false, status, body: resbody || null, error: String(err) });
              else res({ ok: status < 400, status, body: resbody, error: status >= 400 ? ('HTTP ' + status) : null });
            }
          );
        });
      } catch (e) {
        return { ok: false, status: 0, body: null, error: String(e) };
      }
    },
    async sendEmail(opts) { winston.verbose('(services:real) sendEmail TODO: ' + (opts && opts.to)); return { ok: true }; },
    async sendWhatsapp(opts) { winston.verbose('(services:real) sendWhatsapp TODO'); return { ok: true, error: null }; },
    // Esegue un prompt LLM via il server-V4: POST `${API}/${projectId}/llm/ask`
    // (risolve provider/chiave + quota, poi proxy all'AI microservice). Mappa
    // i campi camelCase del nodo allo shape atteso dal server (snake_case).
    async aiPrompt(opts) {
      const o = opts || {};
      if (!API || !projectId) {
        winston.warn('(services:real) aiPrompt: API/projectId mancanti → skip');
        return { ok: false, reply: null, error: 'missing API/projectId' };
      }
      const body = {
        question: o.question || '',
        llm: o.llm,
        model: o.model,
        temperature: o.temperature,
        max_tokens: o.maxTokens,
        request_id: requestId,
      };
      if (o.context) body.context = o.context;
      if (o.reasoning !== undefined) body.reasoning = o.reasoning;
      if (o.reasoningLevel) body.reasoning_level = o.reasoningLevel;
      if (o.chatHistoryDict) body.chat_history_dict = o.chatHistoryDict; // Fase history
      if (o.servers) body.servers = o.servers; // Fase MCP
      const jwt = 'JWT ' + String(token || '').replace(/^(JWT |Bearer )/i, '');
      const url = `${API}/${projectId}/llm/ask`;
      try {
        const httpUtils = require('../../utils/HttpUtils');
        return await new Promise((res) => {
          httpUtils.request(
            { url, method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': jwt }, json: body, timeout: 60000 },
            (err, resbody, fullres) => {
              const status = (fullres && fullres.statusCode) || (err ? 500 : 200);
              if (err || status >= 400) {
                const e = (resbody && (resbody.error || resbody.detail)) || String(err || ('HTTP ' + status));
                winston.error('(services:real) aiPrompt error: ' + JSON.stringify(e));
                res({ ok: false, reply: null, error: typeof e === 'string' ? e : JSON.stringify(e) });
              } else {
                const answer = resbody && (resbody.answer != null ? resbody.answer : (resbody.data && resbody.data.answer));
                res({ ok: true, reply: answer != null ? answer : '', error: null });
              }
            },
          );
        });
      } catch (e) {
        winston.error('(services:real) aiPrompt exception: ', e);
        return { ok: false, reply: null, error: String(e) };
      }
    },
    async askKb(opts) { winston.verbose('(services:real) askKb TODO'); return { ok: true, reply: '', source: null, error: null }; },
    async gptAssistant(opts) { winston.verbose('(services:real) gptAssistant TODO'); return { ok: true, result: '', error: null }; },
    async aiCondition(opts) { const i = (opts && opts.intents) || []; return { ok: true, intentId: i[0] && i[0].id, reply: '', error: null }; },
    // Aggiunge una FAQ alla KB selezionata: POST `${API}/${projectId}/kb/`.
    // Mapping allo shape del backend (come l'import FAQ V3, routes/kb.js):
    //   name = question, source = question, content = question + "\n" + answer,
    //   type = 'faq', + namespace e tags opzionali.
    async addKbContent(opts) {
      const o = opts || {};
      const q = o.question || '';
      const a = o.answer || '';
      if (!API || !projectId || !o.namespace) {
        winston.warn('(services:real) addKbContent: API/projectId/namespace mancanti → skip');
        return { ok: false, error: 'missing params' };
      }
      const body = { namespace: o.namespace, type: 'faq', name: q, source: q, content: q + '\n' + a };
      if (Array.isArray(o.tags) && o.tags.length > 0) body.tags = o.tags;
      const jwt = 'JWT ' + String(token || '').replace(/^(JWT |Bearer )/i, '');
      const url = `${API}/${projectId}/kb/`;
      try {
        const httpUtils = require('../../utils/HttpUtils');
        return await new Promise((res) => {
          httpUtils.request(
            { url, method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': jwt }, json: body, timeout: 20000 },
            (err, resbody, fullres) => {
              const status = (fullres && fullres.statusCode) || (err ? 500 : 200);
              if (err || status >= 400) {
                winston.error('(services:real) addKbContent error: ' + (err || ('HTTP ' + status)));
                res({ ok: false, status, error: String(err || ('HTTP ' + status)) });
              } else {
                winston.verbose('(services:real) addKbContent ok (' + status + ') ns=' + o.namespace);
                res({ ok: true, status, body: resbody });
              }
            },
          );
        });
      } catch (e) {
        winston.error('(services:real) addKbContent exception: ', e);
        return { ok: false, status: 0, error: String(e) };
      }
    },
  };
}

module.exports = { create };
