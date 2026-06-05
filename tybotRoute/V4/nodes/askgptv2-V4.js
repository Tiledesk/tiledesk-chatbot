/**
 * Node `askgptv2` — RAG su una Knowledge Base (`data.namespace`). Assegna risposta e
 * sorgente. Slot `success` / `error`.
 */
async function execute(node, ctx) {
  const d = node.data || {};
  const res = await ctx.services.askKb({
    question: ctx.fill(d.question || ''),
    namespace: d.namespace, llm: d.llm, model: d.model,
    maxTokens: d.maxTokens, temperature: d.temperature, context: d.context, history: d.history,
  }, ctx);
  if (res.ok) {
    if (d.assignReplyTo) await ctx.variables.set(d.assignReplyTo, res.reply);
    if (d.assignSourceTo) await ctx.variables.set(d.assignSourceTo, res.source);
    return { nextSlotKey: 'success', touchedVariables: true };
  }
  await ctx.variables.set('flowError', res.error || 'askgptv2 error');
  return { nextSlotKey: 'error', touchedVariables: true };
}
module.exports = { execute };
