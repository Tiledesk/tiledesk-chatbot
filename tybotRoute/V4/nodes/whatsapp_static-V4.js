/** Node `whatsapp_static` — invia un template WhatsApp a una lista statica, poi `direct`. */
async function execute(node, ctx) {
  const d = node.data || {};
  if (ctx.services) {
    await ctx.services.sendWhatsapp({ templateName: d.templateName, phoneNumberId: d.phoneNumberId, receivers: d.receivers || [] }, ctx);
  }
  return { nextSlotKey: 'direct' };
}
module.exports = { execute };
