/**
 * Node `ai_condition` — classifica l'input su uno dei rami (`data.branches[]`)
 * via LLM. Instrada allo slot del ramo scelto **per `slot.id`** (key fissa
 * `branch`, come i bottoni della reply); nessun match → `fallback`; errore → `error`.
 *
 * Retro-compat: legge anche il vecchio `data.intents[]`, e — poiché instrada per
 * `slot.id` — funziona anche sui bot legacy con slot `intent_<id>` (stesso
 * `slot.id === branch.id`), senza bisogno di migrare i dati persistiti.
 */
async function execute(node, ctx) {
  const d = node.data || {};
  // Testo da classificare: `data.question` (se l'autore l'ha impostato, es.
  // `{{user_request}}`), altrimenti il messaggio utente del turno corrente —
  // che è ciò che `capture_user_reply` ha appena catturato prima di questo nodo.
  const question = ctx.fill(d.question || '') || (ctx.message && ctx.message.text) || '';
  const res = await ctx.services.aiCondition({
    question,
    instructions: ctx.fill(d.instructions || ''),
    context: ctx.fill(d.context || ''), // "Contesto di sistema" del pannello (parità V3: system_context)
    branches: d.branches || d.intents || [],
    llm: d.llm, model: d.model, maxTokens: d.maxTokens, temperature: d.temperature,
    reasoning: d.reasoning, reasoningLevel: d.reasoningLevel, // #6: passa il reasoning come l'ai_prompt
  }, ctx);
  if (!res.ok) {
    await ctx.variables.set('flowError', res.error || 'ai_condition error');
    return { nextSlotKey: 'error', touchedVariables: true };
  }
  if (d.assignReplyTo && res.reply != null) await ctx.variables.set(d.assignReplyTo, res.reply);
  const branchId = res.branchId != null ? res.branchId : res.intentId; // intentId = legacy
  if (branchId != null) return { nextSlotId: branchId, touchedVariables: !!d.assignReplyTo };
  return { nextSlotKey: 'fallback', touchedVariables: !!d.assignReplyTo };
}
module.exports = { execute };
