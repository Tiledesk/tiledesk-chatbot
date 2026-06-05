const { evalOperation } = require('../expression-V4.js');

/**
 * Node `setattribute-v2` — calcola `data.operation` (operandi + operatori) e
 * assegna il risultato a `data.destination`. Poi forward `direct`.
 */
async function execute(node, ctx) {
  const data = node.data || {};
  const dest = ctx.fill(data.destination || '');
  if (dest && data.operation) {
    const vars = await ctx.variables.all();
    const value = evalOperation(data.operation, vars);
    await ctx.variables.set(dest, value);
  }
  return { nextSlotKey: 'direct', touchedVariables: true };
}

module.exports = { execute };
