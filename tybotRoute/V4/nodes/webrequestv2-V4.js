/**
 * Node `webrequestv2` — chiamata HTTP. Risolve url/headers/body, chiama il service
 * `http`, assegna risultato/status/errore alle variabili. Slot `success` / `error`.
 */
async function execute(node, ctx) {
  const data = node.data || {};
  const url = ctx.fill(data.url || '');
  const method = (data.method || 'GET').toUpperCase();
  const headers = {};
  for (const k of Object.keys(data.headers || {})) headers[k] = ctx.fill(String(data.headers[k]));

  // Fill JSON-safe: ogni {{...}} → token JSON valido, così una singola
  // interpolazione (es. `{{ payload }}` oggetto, `"{{ x | json }}"`) non rompe il
  // parse dell'intero body — al massimo quel campo resta senza valore.
  const fillJson = typeof ctx.fillJson === 'function' ? ctx.fillJson.bind(ctx) : ctx.fill;

  let body = null;
  if (data.bodyType === 'json' && data.jsonBody) {
    const filled = fillJson(data.jsonBody);
    try { body = JSON.parse(filled); } catch (e) { body = filled; }
  } else if (data.bodyType === 'form-data' && Array.isArray(data.formData)) {
    // Costruisce l'oggetto form-data dai soli campi abilitati con nome e valore
    // (parità con DirWebRequestV2 V3). La chiave è `f.name` — il modello DS è
    // `{ name, value, type, enabled }` (NON `key`). Il tipo 'URL' (upload file via
    // stream nel V3) non è ancora replicato: il valore è inviato come stringa.
    // Gated su bodyType === 'form-data' così una formData residua con altro
    // bodyType non produce un body indesiderato.
    body = {};
    for (const f of data.formData) {
      if (!f || !f.enabled || !f.name) continue;
      const value = ctx.fill(String(f.value != null ? f.value : ''));
      if (!value) continue;
      body[f.name] = value;
    }
  }

  const res = await ctx.services.http({ url, method, headers, body, timeoutMs: data.timeoutMs });
  if (data.assignStatusTo) await ctx.variables.set(data.assignStatusTo, res.status);
  if (res.ok) {
    if (data.assignResultTo) await ctx.variables.set(data.assignResultTo, res.body);
    return { nextSlotKey: 'success', touchedVariables: true };
  }
  if (data.assignErrorTo) await ctx.variables.set(data.assignErrorTo, res.error);
  await ctx.variables.set('flowError', res.error);
  return { nextSlotKey: 'error', touchedVariables: true };
}

module.exports = { execute };
