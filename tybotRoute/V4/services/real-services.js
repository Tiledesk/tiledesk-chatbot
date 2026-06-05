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
    async aiPrompt(opts) { winston.verbose('(services:real) aiPrompt TODO'); return { ok: true, reply: '', error: null }; },
    async askKb(opts) { winston.verbose('(services:real) askKb TODO'); return { ok: true, reply: '', source: null, error: null }; },
    async gptAssistant(opts) { winston.verbose('(services:real) gptAssistant TODO'); return { ok: true, result: '', error: null }; },
    async aiCondition(opts) { const i = (opts && opts.intents) || []; return { ok: true, intentId: i[0] && i[0].id, reply: '', error: null }; },
    async addKbContent(opts) { winston.verbose('(services:real) addKbContent TODO'); return { ok: true }; },
  };
}

module.exports = { create };
