/**
 * Node `web_response` — imposta la risposta HTTP per il canale webhook. È un nodo
 * TERMINALE (nessuno slot di uscita). Sul canale widget è un no-op terminale.
 */
async function execute() {
  return {}; // nessuno slot → il walk termina il ramo
}

module.exports = { execute };
