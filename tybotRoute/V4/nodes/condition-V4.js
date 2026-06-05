const { evalGroups } = require('../expression-V4.js');

/**
 * Node `condition` — valuta `data.groups` sulle variabili di conversazione.
 * Vero → slot `true`; falso → slot `else`.
 */
async function execute(node, ctx) {
  const groups = (node.data && node.data.groups) || [];
  const vars = await ctx.variables.all();
  return { nextSlotKey: evalGroups(groups, vars) ? 'true' : 'else' };
}

module.exports = { execute };
