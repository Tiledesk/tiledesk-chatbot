const { NodesDataSourceV4 } = require('../NodesDataSource-V4.js');

/**
 * Node `defaultFallback` — eseguito quando l'input utente non è riconosciuto.
 *
 * Nello shape reale ha `data: null` e uno slot `direct` (es. → close).
 * Se in futuro avrà `data.messages`, vengono inviati. Poi naviga allo slot `direct`.
 */
function execute(node) {
  const messages = (node.data && node.data.messages) || [];
  const next = NodesDataSourceV4.directNext(node);
  return {
    messages,
    next,
    stop: next == null,
    close: false,
    awaitingButtons: null,
  };
}

module.exports = { execute };
