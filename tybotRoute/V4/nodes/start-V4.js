const { NodesDataSourceV4 } = require('../NodesDataSource-V4.js');

/**
 * Node `start` — entrypoint del flow (su `\start`).
 * Nessun output: naviga subito allo slot `direct`.
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
