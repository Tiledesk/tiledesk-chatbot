/**
 * Node `ai_prompt` — prompt LLM multi-provider. Assegna la risposta a
 * `data.assignReplyTo`. Slot `success` / `error`.
 */
async function execute(node, ctx) {
  const d = node.data || {};
  const res = await ctx.services.aiPrompt({
    question: ctx.fill(d.question || ''),
    llm: d.llm, model: d.model, maxTokens: d.maxTokens, temperature: d.temperature,
    context: d.context, history: d.history,
  }, ctx);
  if (res.ok) {
    if (d.assignReplyTo) await ctx.variables.set(d.assignReplyTo, res.reply);
    return { nextSlotKey: 'success', touchedVariables: true };
  }
  await ctx.variables.set('flowError', res.error || 'ai_prompt error');
  return { nextSlotKey: 'error', touchedVariables: true };
}
module.exports = { execute };
