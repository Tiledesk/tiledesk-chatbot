/**
 * Node `capture_user_reply` — attende la risposta dell'utente e la assegna a
 * `data.assignResultTo` (default `lastUserText`), poi forward `direct`.
 *
 * Semantica V4 (parità V3 `DirCaptureUserReply`): il nodo lavora in DUE fasi
 * sullo stesso punto del grafo, sfruttando la primitiva di suspend/resume del
 * dispatcher (vedi `TiledeskChatbot-V4.js`):
 *  - 1ª esecuzione (turno in cui il flow arriva qui) → `{ stop, awaitInput }`:
 *    il turno si SOSPENDE e attende il prossimo messaggio utente;
 *  - resume (turno successivo: l'utente ha risposto, `ctx.resuming === true`)
 *    → cattura `ctx.message.text` in `assignResultTo` e prosegue `direct`.
 *
 * In V3 lo stesso effetto era ottenuto con `lockAction`/`currentLockedAction`
 * per-action; qui la sospensione è gestita una volta nel dispatcher e il nodo
 * deve solo dichiarare `awaitInput` e leggere `ctx.resuming`.
 */
async function execute(node, ctx) {
  // 1ª fase: nessun input ancora consumato → sospendi e attendi la risposta.
  if (!ctx || !ctx.resuming) {
    return { stop: true, awaitInput: true };
  }
  // Resume: l'utente ha risposto in questo turno → cattura e prosegui.
  const dest = (node.data && node.data.assignResultTo) || 'lastUserText';
  const text = (ctx.message && ctx.message.text) || '';
  await ctx.variables.set(dest, text);
  return { nextSlotKey: 'direct', touchedVariables: true };
}

module.exports = { execute };
