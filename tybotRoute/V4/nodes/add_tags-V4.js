/**
 * Node `add_tags` — aggiunge `data.tags` alla conversazione (`target:'request'`) o
 * al contatto (`target:'lead'`). Risolve i `{{var}}` in ogni tag (come il V3
 * `DirAddTags`), inoltra `target` e `pushToList` al servizio, poi forward `direct`.
 */
async function execute(node, ctx) {
  const data = node.data || {};
  const tags = (data.tags || []).map((t) => ctx.fill(String(t != null ? t : '')).trim()).filter((t) => t.length > 0);
  const target = data.target === 'lead' ? 'lead' : 'request';
  const pushToList = !!data.pushToList;
  if (tags.length > 0 && ctx.services) {
    await ctx.services.addTags(tags, target, pushToList);
  }
  return { nextSlotKey: 'direct' };
}
module.exports = { execute };
