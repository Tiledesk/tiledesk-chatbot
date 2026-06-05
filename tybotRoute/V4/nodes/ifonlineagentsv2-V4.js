/**
 * Node `ifonlineagentsv2` — se ci sono agenti online (per il dipartimento/opzione
 * configurati) → slot `online`, altrimenti → slot `else`. Verifica via service.
 */
async function execute(node, ctx) {
  const data = node.data || {};
  let online = false;
  if (ctx.services) {
    try {
      online = await ctx.services.onlineAgents({
        option: data.selectedOption,
        departmentId: data.selectedDepartmentId,
        ignoreOperatingHours: data.ignoreOperatingHours,
      }, ctx);
    } catch (err) { online = false; }
  }
  return { nextSlotKey: online ? 'online' : 'else' };
}
module.exports = { execute };
