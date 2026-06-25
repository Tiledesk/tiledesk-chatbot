const { evalConditionData } = require('../expression-V4.js');

/**
 * Node `condition` — valuta la condizione sulle variabili di conversazione.
 * Preferisce `data.when` (safe, no-eval); fallback su `data.groups` (legacy).
 * Vero → slot `true`; falso → slot `else`.
 */
async function execute(node, ctx) {
  const vars = await ctx.variables.all();
  return { nextSlotKey: evalConditionData(node.data, vars) ? 'true' : 'else' };
}

module.exports = { execute };
