/**
 * Node `add_kb_content` — aggiunge una **FAQ** (question + answer + tag) a una
 * Knowledge Base (`data.namespace`). Risolve i `{{var}}` in question/answer, poi
 * forward `direct`. Il mapping allo shape del backend KB (name/source/content)
 * è in `real-services.addKbContent` (riuso della logica V3).
 */
async function execute(node, ctx) {
  const d = node.data || {};
  if (ctx.services?.addKbContent) {
    await ctx.services.addKbContent({
      namespace: d.namespace,
      type: 'faq',
      question: ctx.fill(d.question || ''),
      answer: ctx.fill(d.answer || ''),
      tags: Array.isArray(d.tags) ? d.tags : [],
    }, ctx);
  }
  return { nextSlotKey: 'direct' };
}
module.exports = { execute };
