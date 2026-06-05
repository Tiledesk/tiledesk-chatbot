/**
 * Node `capture_user_reply` — assegna il testo dell'utente del turno corrente a
 * `data.assignResultTo` (default `lastUserText`), poi forward `direct`.
 *
 * Semantica V4: il nodo che precede il capture (reply/replyv2) si ferma e attende
 * l'input; il capture cattura quel testo (`ctx.message.text`) e prosegue.
 */
async function execute(node, ctx) {
  const dest = (node.data && node.data.assignResultTo) || 'lastUserText';
  const text = (ctx.message && ctx.message.text) || '';
  await ctx.variables.set(dest, text);
  return { nextSlotKey: 'direct', touchedVariables: true };
}

module.exports = { execute };
