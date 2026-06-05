/** Node `send_whatsapp` — invia un template WhatsApp con esito: slot `success`/`error`. */
async function execute(node, ctx) {
  const d = node.data || {};
  const res = ctx.services
    ? await ctx.services.sendWhatsapp({ templateName: d.templateName, phoneNumberId: d.phoneNumberId, receivers: d.receivers || [] }, ctx)
    : { ok: true };
  if (!res.ok) await ctx.variables.set('flowError', res.error || 'whatsapp error');
  return { nextSlotKey: res.ok ? 'success' : 'error', touchedVariables: !res.ok };
}
module.exports = { execute };
