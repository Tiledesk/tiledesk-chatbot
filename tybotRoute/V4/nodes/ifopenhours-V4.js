/**
 * Node `ifopenhours` — se il progetto è in orario di apertura → slot `open`,
 * altrimenti → slot `else`. La verifica è delegata al service (`isOpen`).
 */
async function execute(node, ctx) {
  let open = true;
  if (ctx.services) {
    try { open = await ctx.services.isOpen(ctx); }
    catch (err) { open = true; } // fail-open: in dubbio, considera aperto
  }
  return { nextSlotKey: open ? 'open' : 'else' };
}
module.exports = { execute };
