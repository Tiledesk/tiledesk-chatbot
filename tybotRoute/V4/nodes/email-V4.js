/** Node `email` — invia un'email (campi risolti via `{{var}}`), poi forward `direct`. */
async function execute(node, ctx) {
  const d = node.data || {};
  if (ctx.services) {
    await ctx.services.sendEmail({
      to: ctx.fill(d.to || ''),
      subject: ctx.fill(d.subject || ''),
      replyTo: ctx.fill(d.replyTo || ''),
      text: ctx.fill(d.text || ''),
    }, ctx);
  }
  return { nextSlotKey: 'direct' };
}
module.exports = { execute };
