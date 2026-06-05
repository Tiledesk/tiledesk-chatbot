/**
 * Node `gpt_assistant` — OpenAI Assistant API (`data.assistantId`). Assegna il
 * risultato a `data.assignResultTo`. Slot `success` / `error`.
 */
async function execute(node, ctx) {
  const d = node.data || {};
  const res = await ctx.services.gptAssistant({
    prompt: ctx.fill(d.prompt || ''),
    assistantId: d.assistantId,
    threadId: d.threadIdAttribute ? await ctx.variables.get(d.threadIdAttribute) : null,
  }, ctx);
  if (res.ok) {
    if (d.assignResultTo) await ctx.variables.set(d.assignResultTo, res.result);
    return { nextSlotKey: 'success', touchedVariables: true };
  }
  if (d.assignErrorTo) await ctx.variables.set(d.assignErrorTo, res.error);
  await ctx.variables.set('flowError', res.error || 'gpt_assistant error');
  return { nextSlotKey: 'error', touchedVariables: true };
}
module.exports = { execute };
