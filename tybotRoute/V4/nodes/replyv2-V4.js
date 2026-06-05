const reply = require('./reply-V4.js');

// Limiti del timeout no_input (come il V3: 0 < t < 90 giorni).
const MAX_NOINPUT_MS = 7776000;

/**
 * Node `replyv2` (Reply avanzato) — come `reply` (messaggi + bottoni) MA con due
 * uscite extra negli `slots`:
 *  - `no_match` → l'input utente non combacia con nessun bottone in attesa;
 *  - `no_input` → l'utente non risponde entro `data.noInputTimeout` ms.
 *
 * Il routing dei bottoni connessi vive negli slot `button` (gestito da reply.execute
 * → awaitingButtons). Il nodo attende SEMPRE input (stop), niente forward `direct`.
 */
function execute(node) {
  const base = reply.execute(node); // messages, awaitingButtons, buttonSlotMap, ...
  const slots = (node && node.slots) || [];
  const noMatchSlot = slots.find((s) => s.key === 'no_match');
  const noInputSlot = slots.find((s) => s.key === 'no_input');
  const timeoutMs = (node.data && node.data.noInputTimeout) || 0;

  const noInput =
    noInputSlot && noInputSlot.nextNode && timeoutMs > 0 && timeoutMs < MAX_NOINPUT_MS
      ? { nodeId: noInputSlot.nextNode, timeoutMs }
      : null;

  return {
    ...base,
    next: null,   // replyv2 attende sempre input
    stop: true,
    noMatchNode: noMatchSlot ? noMatchSlot.nextNode || null : null,
    noInput,
  };
}

module.exports = { execute };
