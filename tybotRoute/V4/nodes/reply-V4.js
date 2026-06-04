const { NodesDataSourceV4 } = require('../NodesDataSource-V4.js');

/** Bottoni di un messaggio: array piatto (shape reale) o `{ui:[]}` (shape doc). */
function buttonsOf(message) {
  const b = message.buttons;
  if (Array.isArray(b)) return b;
  return b?.ui || [];
}

/**
 * awaitingButtons: per ogni bottone NON url con uno slot 'button'
 * (slot.id == button.id) → { value: label, nextNode } per instradare il click.
 */
function collectAwaitingButtons(messages, slotMap) {
  const out = [];
  for (const m of messages) {
    for (const btn of buttonsOf(m)) {
      if (btn.type === 'url') continue; // i link aprono l'URL, non instradano
      const target = slotMap[btn.id];
      if (target) {
        out.push({ value: btn.label != null ? btn.label : btn.value, nextNode: target });
      }
    }
  }
  return out;
}

/**
 * Node `reply` — invia i messaggi (`data.messages[]`) e poi prosegue o attende.
 *
 * - `next`: slot 'direct' se presente (forward automatico), altrimenti null
 *   (nodo con soli bottoni → si ferma e attende il click).
 * - `buttonSlotMap` { buttonId -> nextNode }: passato al sender per popolare il
 *   campo `action` dei bottoni 'action' (richiesto dal widget per emettere il click).
 */
function execute(node) {
  const messages = node.data?.messages || [];
  const next = NodesDataSourceV4.directNext(node);
  const slotMap = NodesDataSourceV4.buttonSlotMap(node);
  const awaitingButtons = collectAwaitingButtons(messages, slotMap);

  return {
    messages,
    next,
    stop: next === null,
    close: false,
    awaitingButtons: awaitingButtons.length > 0 ? awaitingButtons : null,
    buttonSlotMap: slotMap,
  };
}

module.exports = { execute };
