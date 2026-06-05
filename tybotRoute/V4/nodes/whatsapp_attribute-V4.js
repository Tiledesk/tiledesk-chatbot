/** Node `whatsapp_attribute` — invia un template WhatsApp al numero in `data.attributeName`. */
async function execute(node, ctx) {
  const d = node.data || {};
  const phone = await ctx.variables.get(d.attributeName);
  if (ctx.services) {
    await ctx.services.sendWhatsapp({ templateName: d.templateName, phoneNumberId: d.phoneNumberId, receivers: [{ phone }] }, ctx);
  }
  return { nextSlotKey: 'direct' };
}
module.exports = { execute };
