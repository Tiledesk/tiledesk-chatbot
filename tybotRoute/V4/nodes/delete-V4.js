/** Node `delete` (delete variable) — rimuove `data.variableName`, poi forward `direct`. */
async function execute(node, ctx) {
  const name = node.data && node.data.variableName;
  if (name) {
    await ctx.variables.delete(name);
  }
  return { nextSlotKey: 'direct', touchedVariables: true };
}

module.exports = { execute };
