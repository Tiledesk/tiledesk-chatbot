const winston = require('../../utils/winston');

/**
 * Node `web_response` — invia la risposta HTTP al chiamante del webhook.
 *
 * Pubblica `{ status, payload }` sul topic `/webhooks/${requestId}`: è lo stesso
 * su cui attende il path **sync** del webhook (`tybotRoute/index.js` block route),
 * che poi fa `res.status(status).send(payload)`. Replica ciò che faceva la
 * directive V3 `DirWebResponse` (il walk V4 non passa dalle directive).
 *
 * Nodo TERMINALE: nessuno slot di uscita. Sul canale widget (o nei test, dove il
 * cache mock non espone `publish`) è un no-op terminale.
 */
async function execute(node, ctx) {
  const data = (node && node.data) || {};

  // Status: stringa (codice HTTP o `{{var}}`) → numero per `res.status`; default 200.
  const filledStatus = ctx.fill(String(data.status != null ? data.status : '200'));
  const statusNum = parseInt(filledStatus, 10);
  const status = Number.isFinite(statusNum) ? statusNum : 200;

  // Body: solo con bodyType 'json' e payload non vuoto → oggetto JSON; altrimenti
  // null (body vuoto). I `{{var}}` nel payload sono risolti prima del parse.
  let payload = null;
  if (data.payload && data.bodyType === 'json') {
    // Fill JSON-safe: un {{...}} malformato non rompe l'intero body (→ body vuoto),
    // al massimo quel campo resta senza valore.
    const fillJson = typeof ctx.fillJson === 'function' ? ctx.fillJson.bind(ctx) : ctx.fill;
    const filled = fillJson(data.payload);
    try {
      payload = JSON.parse(filled);
    } catch (e) {
      winston.error('(web_response-V4) payload JSON non valido, invio body vuoto: ' + filled);
      payload = null;
    }
  }

  const topic = `/webhooks/${ctx.requestId}`;
  if (ctx.tdcache && typeof ctx.tdcache.publish === 'function') {
    try {
      ctx.tdcache.publish(topic, JSON.stringify({ status, payload }));
      winston.verbose('(web_response-V4) risposta pubblicata su ' + topic + ' (status ' + status + ')');
    } catch (e) {
      winston.error('(web_response-V4) publish error: ', e);
    }
  } else {
    winston.verbose('(web_response-V4) nessun tdcache.publish (canale non-webhook) → no-op');
  }

  return {}; // terminale: nessuno slot → il walk chiude il ramo
}

module.exports = { execute };
