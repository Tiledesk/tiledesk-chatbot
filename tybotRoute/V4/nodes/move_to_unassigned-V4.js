/** Node `move_to_unassigned` — sposta la conversazione nella coda non assegnati, poi `direct`. */
async function execute(node, ctx) {
  if (ctx.services) await ctx.services.moveToUnassigned(ctx);
  return { nextSlotKey: 'direct' };
}
module.exports = { execute };
