const { NodesDataSourceV4 } = require('../NodesDataSource-V4.js');

/**
 * Node `copilot` — entrypoint del flow per i bot di tipo copilot. Come `start`:
 * nessun output, naviga subito allo slot `direct` verso il primo nodo reale.
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
