/** Node `agent` — passa la conversazione a un operatore umano, poi forward `direct`. */
async function execute(node, ctx) {
  if (ctx.services) await ctx.services.transferToAgent(ctx);
  return { nextSlotKey: 'direct' };
}
module.exports = { execute };
