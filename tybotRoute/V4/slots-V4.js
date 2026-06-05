const { NodesDataSourceV4 } = require('./NodesDataSource-V4.js');

/**
 * Risoluzione dell'uscita di un nodo a partire dal risultato di un handler.
 *
 * Precedenza:
 *   1. `result.next`        → id di nodo esplicito (usato dai 5 handler storici);
 *   2. `result.nextSlotKey` → slot per key semantica (`true`/`false`/`else`/`success`/
 *                             `error`/`open`/`online`/`loop`/`fallback`/`intent_<id>`/`direct`);
 *   3. default              → slot `direct` (forward).
 *
 * Ritorna l'id del prossimo nodo (o null = ramo terminale / nessuna uscita).
 */
function chooseNext(node, result) {
  if (!result) return NodesDataSourceV4.directNext(node);
  if (result.next != null) return result.next;
  if (result.nextSlotKey != null) {
    return NodesDataSourceV4.nextBySlotKey(node, result.nextSlotKey);
  }
  return NodesDataSourceV4.directNext(node);
}

/**
 * Prima slot disponibile (nextNode non nullo) tra una lista ordinata di key.
 * Usata per instradare l'errore di un handler verso `error`/`false`/`fallback`.
 */
function firstSlot(node, keys) {
  for (const k of keys || []) {
    const target = NodesDataSourceV4.nextBySlotKey(node, k);
    if (target) return target;
  }
  return null;
}

module.exports = { chooseNext, firstSlot };
