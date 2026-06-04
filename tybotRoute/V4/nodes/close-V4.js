/**
 * Node `close` — chiude la conversazione. Nessun output, nessun forward.
 * Lo stato V4 verrà azzerato dall'orchestratore.
 */
function execute(_node) {
  return {
    messages: [],
    next: null,
    stop: true,
    close: true,
    awaitingButtons: null,
  };
}

module.exports = { execute };
