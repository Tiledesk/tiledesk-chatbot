/** Node `department` (change department) — sposta la conversazione su `data.depName`. */
async function execute(node, ctx) {
  const name = ctx.fill((node.data && node.data.depName) || '');
  if (name && ctx.services) await ctx.services.changeDepartment(name, ctx);
  return { nextSlotKey: 'direct' };
}
module.exports = { execute };
