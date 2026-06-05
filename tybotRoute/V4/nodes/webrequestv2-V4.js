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

  let body = null;
  if (data.bodyType === 'json' && data.jsonBody) {
    const filled = ctx.fill(data.jsonBody);
    try { body = JSON.parse(filled); } catch (e) { body = filled; }
  } else if (Array.isArray(data.formData) && data.formData.length > 0) {
    body = {};
    for (const f of data.formData) body[f.key] = ctx.fill(String(f.value != null ? f.value : ''));
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
