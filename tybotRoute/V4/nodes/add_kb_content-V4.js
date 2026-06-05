/**
 * Node `add_kb_content` — aggiunge contenuto a una Knowledge Base (`data.namespace`).
 * Risolve i `{{var}}` in name/content/source, poi forward `direct`.
 */
async function execute(node, ctx) {
  const d = node.data || {};
  if (ctx.services) {
    await ctx.services.addKbContent({
      namespace: d.namespace,
      type: d.type,
      name: ctx.fill(d.name || ''),
      content: ctx.fill(d.content || ''),
      source: ctx.fill(d.source || ''),
      tags: d.tags || [],
    }, ctx);
  }
  return { nextSlotKey: 'direct' };
}
module.exports = { execute };
