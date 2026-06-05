const { evalGroups } = require('../expression-V4.js');

/**
 * Node `jsoncondition` — valuta `data.groups` (multi-gruppo con AND/OR).
 * Vero → slot `true`; falso → slot `false`.
 */
async function execute(node, ctx) {
  const groups = (node.data && node.data.groups) || [];
  const vars = await ctx.variables.all();
  return { nextSlotKey: evalGroups(groups, vars) ? 'true' : 'false' };
}

module.exports = { execute };
