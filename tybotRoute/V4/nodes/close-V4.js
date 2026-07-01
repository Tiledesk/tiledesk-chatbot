/**
 * Node `close` — chiude la conversazione. Nessun output, nessun forward.
 *
 * Oltre ad azzerare lo stato V4 (lo fa l'orchestratore su `close: true`), chiude
 * la richiesta lato server via `services.closeRequest` (come il `DirClose` V3):
 * è ciò che porta la conversazione allo stato "closed" e fa comparire la
 * **valutazione servizio** nel web widget. Senza questa chiamata il bot azzerava
 * solo il proprio stato interno e la conversazione restava aperta (niente rating).
 */
async function execute(_node, ctx) {
  if (ctx?.services?.closeRequest) {
    await ctx.services.closeRequest(ctx);
  }
  return {
    messages: [],
    next: null,
    stop: true,
    close: true,
    awaitingButtons: null,
  };
}

module.exports = { execute };
