const { NodesDataSourceV4 } = require('../NodesDataSource-V4.js');

/**
 * Node `webhook` — entrypoint del flow per i bot di tipo webhook (triggerato da
 * una richiesta HTTP). Come `start`: nessun output, naviga subito allo slot
 * `direct` verso il primo nodo reale (es. `web_response`).
 */
function execute(node) {
  return {
    messages: [],
    next: NodesDataSourceV4.directNext(node),
    stop: false,
    close: false,
    awaitingButtons: null,
  };
}

module.exports = { execute };
