/**
 * Node `composio_tool` — action generica: esegue un tool Composio (`toolkit`/`tool`,
 * es. il virtual tool `TILEDESK_SHEETS_APPEND_ROW` di googlesheets) con `arguments`
 * arbitrari. Sostituisce il precedente `google_sheets` (specifico per Sheets) con
 * un unico handler valido per qualunque toolkit/tool esposto dal server. Slot
 * `success` / `error`.
 */
async function execute(node, ctx) {
  const d = node.data || {};
  const toolkit = String(d.toolkit || '').trim();
  const tool = String(d.tool || '').trim();

  if (!toolkit || !tool) {
    const msg = 'composio_tool: toolkit/tool mancanti';
    await ctx.variables.set('flowError', msg);
    if (d.assignErrorTo) await ctx.variables.set(d.assignErrorTo, msg);
    return { nextSlotKey: 'error', touchedVariables: true };
  }

  const args = {};
  for (const key of Object.keys(d.arguments || {})) {
    const raw = d.arguments[key];
    args[key] = ctx.fill(String(raw != null ? raw : ''));
  }

  const res = await ctx.services.composioExecute({ toolkit, tool, arguments: args });
  if (res.ok) {
    if (d.assignResultTo) {
      const value = res.data && typeof res.data === 'object' ? JSON.stringify(res.data) : res.data;
      await ctx.variables.set(d.assignResultTo, value);
    }
    return { nextSlotKey: 'success', touchedVariables: true };
  }

  if (d.assignErrorTo) await ctx.variables.set(d.assignErrorTo, res.error);
  await ctx.variables.set('flowError', res.error || 'composio_tool error');
  return { nextSlotKey: 'error', touchedVariables: true };
}

module.exports = { execute };
