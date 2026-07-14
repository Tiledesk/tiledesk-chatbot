const winston = require('../../utils/winston');

/**
 * Implementazione REAL dei servizi esterni: usa `@tiledesk/tiledesk-client` per le
 * operazioni sulla conversazione (le stesse del runtime V3) e `API_ENDPOINT` per
 * gli endpoint REST. Selezionata con env `V4_SERVICES_REAL=1`.
 *
 * NB: alcune chiamate (disponibilità orari/agenti, changeDepartment, clearTranscript,
 * leadUpdate, replaceBot) sono ancora marcate TODO finché non si conferma l'endpoint
 * locale; nel frattempo restano conservative (default sicuro) e non bloccano il flow.
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
    // Aggiunge i tag alla conversazione (`target:'request'`) o al lead (`target:'lead'`),
    // come il `DirAddTags` V3. Endpoint: PUT `${API}/${projectId}/requests/${requestId}/tag`
    // (body `[{tag,color}]`) o PUT `.../leads/${leadId}/tag` (body `[tag,…]`, lead._id
    // risolto via `getRequestById`). `pushToList` → POST `.../tags` per registrare ogni
    // tag nella tag-list del progetto. Non blocca il flow in caso di errore (solo log).
    async addTags(tags, target, pushToList) {
      const list = (Array.isArray(tags) ? tags : [tags])
        .map((t) => String(t == null ? '' : t).trim())
        .filter((t) => t.length > 0);
      if (!list.length) { winston.warn('(services:real) addTags: nessun tag → skip'); return { ok: false, error: 'no tags' }; }
      if (!API || !projectId) { winston.warn('(services:real) addTags: API/projectId mancanti → skip'); return { ok: false, error: 'missing API/projectId' }; }
      const tgt = target === 'lead' ? 'lead' : 'request';
      const COLOR = '#f0806f';
      const jwt = 'JWT ' + String(token || '').replace(/^(JWT |Bearer )/i, '');
      const headers = { 'Content-Type': 'application/json', Authorization: jwt };
      const httpUtils = require('../../utils/HttpUtils');
      const call = (reqOpts) => new Promise((res) => {
        httpUtils.request(reqOpts, (err, body, full) => {
          const status = (full && full.statusCode) || (err ? 500 : 200);
          res({ err, status, body });
        });
      });
      try {
        // pushToList: registra ogni tag nella tag-list del progetto (POST /tags).
        if (pushToList) {
          for (const tag of list) {
            await call({ url: `${API}/${projectId}/tags`, method: 'POST', headers, json: { tag, color: COLOR }, timeout: 20000 });
          }
        }

        if (tgt === 'request') {
          const payload = list.map((tag) => ({ tag, color: COLOR }));
          const r = await call({ url: `${API}/${projectId}/requests/${requestId}/tag`, method: 'PUT', headers, json: payload, timeout: 20000 });
          if (r.err || r.status >= 400) {
            winston.error('(services:real) addTags request tag error: HTTP ' + r.status);
            return { ok: false, error: 'requests/tag HTTP ' + r.status };
          }
          winston.verbose('(services:real) addTags → conversation ' + JSON.stringify(list));
          return { ok: true };
        }

        // target 'lead': risolve lead._id dalla request, poi PUT leads/{id}/tag.
        let leadId = null;
        try {
          const request = tdClient ? await tdClient.getRequestById(requestId) : null;
          leadId = request && request.lead && request.lead._id;
        } catch (e) { winston.error('(services:real) addTags getRequestById error: ', e); }
        if (!leadId) { winston.warn('(services:real) addTags: lead non trovato per la request → skip'); return { ok: false, error: 'lead not found' }; }
        const r = await call({ url: `${API}/${projectId}/leads/${leadId}/tag`, method: 'PUT', headers, json: list, timeout: 20000 });
        if (r.err || r.status >= 400) {
          winston.error('(services:real) addTags lead tag error: HTTP ' + r.status);
          return { ok: false, error: 'leads/tag HTTP ' + r.status };
        }
        winston.verbose('(services:real) addTags → lead ' + leadId + ' ' + JSON.stringify(list));
        return { ok: true };
      } catch (e) {
        winston.error('(services:real) addTags exception: ', e);
        return { ok: false, error: String(e) };
      }
    },
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
    // Invia un'email via il server-V4: POST `${API}/${projectId}/emails/internal/send`
    // (stesso endpoint/shape del `DirSendEmail` V3). I campi sono già fillati dal
    // nodo; `replyTo` (camelCase del nodo) → `replyto` (lowercase, atteso dal server).
    async sendEmail(opts) {
      const o = opts || {};
      if (!o.to || !o.subject || !o.text) {
        winston.warn('(services:real) sendEmail: parametri mancanti (to|subject|text) → skip');
        return { ok: false, error: 'missing to|subject|text' };
      }
      if (!tdClient) {
        winston.error('(services:real) sendEmail: TiledeskClient non inizializzato');
        return { ok: false, error: 'no client' };
      }
      const message = { subject: o.subject, text: o.text, to: o.to, replyto: o.replyTo || '', request_id: requestId };
      try {
        const echo = await tdClient.sendEmail(message);
        winston.verbose('(services:real) sendEmail → ' + o.to);
        return { ok: true, echo };
      } catch (err) {
        winston.error('(services:real) sendEmail error: ', err);
        return { ok: false, error: String(err) };
      }
    },
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
    // Ask KB — RAG "povero" (dev): recupera i contenuti del namespace via
    // GET /:projectId/kb/ (senza embedding/vector search) e li passa a /llm/ask
    // come CONTESTO. Sufficiente per KB piccole in dev (lo stack RAG amd64 non
    // gira qui); in prod il retrieval passa dal microservizio KB (/kb/qa).
    async askKb(opts) {
      const o = opts || {};
      if (!API || !projectId || !o.namespace) {
        winston.warn('(services:real) askKb: API/projectId/namespace mancanti → skip');
        return { ok: false, reply: null, source: null, error: 'missing API/projectId/namespace' };
      }
      const jwt = 'JWT ' + String(token || '').replace(/^(JWT |Bearer )/i, '');
      const httpUtils = require('../../utils/HttpUtils');
      const call = (reqOpts) => new Promise((res) => {
        httpUtils.request(reqOpts, (err, body, full) => {
          const status = (full && full.statusCode) || (err ? 500 : 200);
          res({ err, status, body });
        });
      });
      try {
        // 1) recupera i contenuti della KB (namespace) — nessun embedding/vettori
        const listUrl = `${API}/${projectId}/kb/?namespace=${encodeURIComponent(o.namespace)}&type=faq&limit=200`;
        const list = await call({ url: listUrl, method: 'GET', headers: { Authorization: jwt }, timeout: 20000 });
        if (list.err || list.status >= 400) {
          return { ok: false, reply: null, source: null, error: 'kb list HTTP ' + list.status };
        }
        const docs =
          (list.body && (list.body.kbs || list.body.data)) ||
          (Array.isArray(list.body) ? list.body : []);
        if (!docs.length) return { ok: true, reply: 'Non lo so.', source: null, error: null };
        const context = docs
          .map((d, i) => `[${i + 1}] ${String(d.content || (d.name ? d.name + '\n' + (d.source || '') : '') || '').trim()}`)
          .join('\n\n');
        // 2) risposta LLM ancorata al contesto (riusa lo shim /llm/ask, già attivo)
        const prompt = [
          String(o.context || '').trim(),
          'Rispondi alla DOMANDA usando ESCLUSIVAMENTE il CONTESTO della knowledge base qui sotto.',
          'Se la risposta non è nel contesto, rispondi esattamente: "Non lo so".',
          '',
          'CONTESTO:',
          context,
          '',
          'DOMANDA: ' + String(o.question || ''),
        ].join('\n');
        const askBody = {
          question: prompt,
          llm: o.llm || 'openai',
          model: o.model || 'gpt-4o-mini',
          temperature: o.temperature != null ? o.temperature : 0.2,
          max_tokens: o.maxTokens || 1000,
          request_id: requestId,
        };
        const ask = await call({ url: `${API}/${projectId}/llm/ask`, method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: jwt }, json: askBody, timeout: 60000 });
        if (ask.err || ask.status >= 400) {
          const e = (ask.body && (ask.body.error || ask.body.detail)) || 'HTTP ' + ask.status;
          winston.error('(services:real) askKb /llm/ask error: ' + JSON.stringify(e));
          return { ok: false, reply: null, source: null, error: typeof e === 'string' ? e : JSON.stringify(e) };
        }
        const answer = ask.body && (ask.body.answer != null ? ask.body.answer : ask.body.data && ask.body.data.answer);
        const source = (docs[0] && (docs[0].source || docs[0].name)) || null;
        winston.verbose('(services:real) askKb (RAG dev) docs=' + docs.length + ' → reply len ' + String(answer || '').length);
        return { ok: true, reply: answer != null ? answer : '', source, error: null };
      } catch (e) {
        winston.error('(services:real) askKb exception: ', e);
        return { ok: false, reply: null, source: null, error: String(e) };
      }
    },
    async gptAssistant(opts) { winston.verbose('(services:real) gptAssistant TODO'); return { ok: true, result: '', error: null }; },
    // Classifica il messaggio utente su UNO dei rami (`branches[]`) via LLM.
    // Presenta le categorie NUMERATE e chiede all'LLM di rispondere col numero
    // della migliore (o 0 = nessuna) → evita di dipendere dal match esatto delle
    // label hex. Riusa lo stesso endpoint di aiPrompt: POST `${API}/${projectId}/llm/ask`.
    async aiCondition(opts) {
      const o = opts || {};
      const branches = ((o.branches || o.intents) || []).filter((b) => b && b.id);
      if (!branches.length) return { ok: true, branchId: null, reply: '', error: null };
      if (!API || !projectId) {
        winston.warn('(services:real) aiCondition: API/projectId mancanti → skip');
        return { ok: false, branchId: null, error: 'missing API/projectId' };
      }
      const userText = String(o.question || '').trim();
      // Parità V3: il testo utente arriva via `{{lastUserText}}` nelle istruzioni
      // (già riempite dal nodo). Rete di sicurezza: se le istruzioni non contengono
      // già il messaggio (es. nodo generato senza la variabile), lo aggiungiamo in coda.
      let instructions = String(o.instructions || '').trim();
      if (userText && !instructions.includes(userText)) {
        instructions = (instructions ? instructions + '\n' : '') + 'User said: """' + userText + '"""';
      }
      const list = branches.map((b, i) => `${i + 1}. ${(b.criterion || b.label || '').trim()}`).join('\n');
      const prompt = [
        'You are a strict text classifier. Evaluate the categories IN ORDER, from top to bottom.',
        '',
        'Categories:',
        list,
        '',
        instructions,
        '',
        `If more than one category is satisfied, choose the FIRST one (top to bottom). Answer with ONLY the number (1-${branches.length}) of that category, or 0 if none is satisfied. No other words.`,
      ].join('\n');

      const body = {
        question: prompt,
        llm: o.llm,
        model: o.model,
        temperature: o.temperature != null ? o.temperature : 0,
        max_tokens: o.maxTokens,
        request_id: requestId,
      };
      if (o.context) body.context = o.context; // "Contesto di sistema" (parità V3: system_context)
      if (o.reasoning !== undefined) body.reasoning = o.reasoning; // #6: reasoning (come aiPrompt)
      if (o.reasoningLevel) body.reasoning_level = o.reasoningLevel;
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
                winston.error('(services:real) aiCondition error: ' + JSON.stringify(e));
                return res({ ok: false, branchId: null, error: typeof e === 'string' ? e : JSON.stringify(e) });
              }
              const answer = String((resbody && (resbody.answer != null ? resbody.answer : (resbody.data && resbody.data.answer))) || '');
              const m = answer.match(/\d+/);
              const n = m ? parseInt(m[0], 10) : 0;
              const chosen = n >= 1 && n <= branches.length ? branches[n - 1] : null;
              const branchId = chosen ? chosen.id : null;
              // assignReplyTo riceve la label del ramo scelto (o "fallback"), come V3 — non il numero interno.
              const reply = chosen ? (chosen.label || chosen.id) : 'fallback';
              winston.verbose('(services:real) aiCondition answer="' + answer.trim() + '" → n=' + n + ' branchId=' + branchId + ' reply=' + reply);
              return res({ ok: true, branchId, reply, error: null });
            },
          );
        });
      } catch (e) {
        winston.error('(services:real) aiCondition exception: ', e);
        return { ok: false, branchId: null, error: String(e) };
      }
    },
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
