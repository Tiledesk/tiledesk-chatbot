/**
 * Node `add_tags` — aggiunge `data.tags` alla conversazione o al lead (`data.target`).
 * Risolve i `{{var}}` in ogni tag, poi forward `direct`.
 */
async function execute(node, ctx) {
  const data = node.data || {};
  const tags = (data.tags || []).map((t) => ctx.fill(String(t != null ? t : ''))).filter((t) => t.length > 0);
  const target = data.target || 'request';
  if (tags.length > 0 && ctx.services) {
    await ctx.services.addTags(tags, target, ctx);
  }
  return { nextSlotKey: 'direct' };
}
module.exports = { execute };
