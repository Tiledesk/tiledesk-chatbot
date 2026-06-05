/**
 * Node `ai_condition` — classifica l'input su uno degli intent (`data.intents[]`)
 * via LLM. Slot dinamico `intent_<id>` dell'intent scelto; nessun match → `fallback`;
 * errore → `error`.
 */
async function execute(node, ctx) {
  const d = node.data || {};
  const res = await ctx.services.aiCondition({
    question: ctx.fill(d.question || ''),
    instructions: ctx.fill(d.instructions || ''),
    intents: d.intents || [],
    llm: d.llm, model: d.model, maxTokens: d.maxTokens, temperature: d.temperature,
  }, ctx);
  if (!res.ok) {
    await ctx.variables.set('flowError', res.error || 'ai_condition error');
    return { nextSlotKey: 'error', touchedVariables: true };
  }
  if (d.assignReplyTo && res.reply != null) await ctx.variables.set(d.assignReplyTo, res.reply);
  if (res.intentId) return { nextSlotKey: 'intent_' + res.intentId, touchedVariables: !!d.assignReplyTo };
  return { nextSlotKey: 'fallback', touchedVariables: !!d.assignReplyTo };
}
module.exports = { execute };
