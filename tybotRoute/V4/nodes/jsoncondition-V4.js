const { evalConditionData } = require('../expression-V4.js');

/**
 * Node `jsoncondition` — valuta la condizione (multi-gruppo con AND/OR).
 * Preferisce `data.when` (safe, no-eval); fallback su `data.groups` (legacy).
 * Vero → slot `true`; falso → slot `false`.
 */
async function execute(node, ctx) {
  const vars = await ctx.variables.all();
  return { nextSlotKey: evalConditionData(node.data, vars) ? 'true' : 'false' };
}

module.exports = { execute };
