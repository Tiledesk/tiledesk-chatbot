/**
 * Test del nodo `composio_tool`.
 *
 * Verifica che l'handler: risolva i `{{var}}` in OGNI valore di `arguments` (le
 * chiavi restano letterali) e li inoltri a `services.composioExecute`; su successo
 * valorizzi `assignResultTo` (se definito, serializzando in JSON un `data` oggetto)
 * e forward `success`; su errore del servizio valorizzi `assignErrorTo` (se
 * definito) + `flowError` e forward `error`; con `toolkit`/`tool` mancanti vada in
 * `error` SENZA chiamare il servizio; senza `assignResultTo`/`assignErrorTo` non
 * crashi e non scriva variabili extra.
 *
 * Esecuzione: `node tybotRoute/V4/test/composio_tool-V4.test.js`
 */
const { makeCtx, ok, eq, run, summary } = require('./harness-V4.js');
const handler = require('../nodes/composio_tool-V4.js');

// Servizio spia: registra l'ultima chiamata composioExecute e ritorna una risposta configurabile.
function makeSpy(response) {
  const calls = [];
  return {
    calls,
    services: {
      async composioExecute(opts) {
        calls.push(opts);
        return response || { ok: true, data: { ok: true } };
      },
    },
  };
}

(async () => {
  await run('composio_tool → successo: chiama composioExecute con arguments interpolati e assegna data serializzato JSON', async () => {
    const spy = makeSpy({ ok: true, data: { spreadsheetId: 'sheet-abc', created: true } });
    const ctx = makeCtx({ services: spy.services, params: { user_name: 'Mario', user_email: 'mario@x.it' } });
    const r = await handler.execute(
      {
        data: {
          toolkit: 'googlesheets',
          tool: 'TILEDESK_SHEETS_APPEND_ROW',
          arguments: { spreadsheetTitle: 'Iscrizioni', values: '{{user_name}},{{user_email}}' },
          assignResultTo: 'sheet_result',
        },
      },
      ctx,
    );
    eq(r.nextSlotKey, 'success', 'forward success');
    eq(spy.calls.length, 1, 'composioExecute chiamato una volta');
    eq(spy.calls[0].toolkit, 'googlesheets', 'toolkit passato');
    eq(spy.calls[0].tool, 'TILEDESK_SHEETS_APPEND_ROW', 'tool passato');
    eq(spy.calls[0].arguments.spreadsheetTitle, 'Iscrizioni', 'chiave arguments letterale, valore invariato (nessun placeholder)');
    eq(spy.calls[0].arguments.values, 'Mario,mario@x.it', 'valore arguments interpolato');
    eq(
      await ctx.variables.get('sheet_result'),
      JSON.stringify({ spreadsheetId: 'sheet-abc', created: true }),
      'assignResultTo valorizzato con il data serializzato JSON',
    );
  });

  await run('composio_tool → errore dal servizio: slot error + assignErrorTo + flowError', async () => {
    const spy = makeSpy({ ok: false, error: 'not_connected' });
    const ctx = makeCtx({ services: spy.services, params: {} });
    const r = await handler.execute(
      {
        data: {
          toolkit: 'googlesheets',
          tool: 'TILEDESK_SHEETS_APPEND_ROW',
          arguments: { spreadsheetTitle: 'Foglio', values: 'x' },
          assignErrorTo: 'sheet_error',
        },
      },
      ctx,
    );
    eq(r.nextSlotKey, 'error', 'forward error');
    eq(await ctx.variables.get('sheet_error'), 'not_connected', 'assignErrorTo valorizzato con l\'errore del servizio');
    eq(await ctx.variables.get('flowError'), 'not_connected', 'flowError valorizzato');
  });

  await run('composio_tool → errore dal servizio senza messaggio: flowError con fallback generico', async () => {
    const spy = makeSpy({ ok: false });
    const ctx = makeCtx({ services: spy.services });
    const r = await handler.execute(
      { data: { toolkit: 'googlesheets', tool: 'TILEDESK_SHEETS_APPEND_ROW', arguments: {} } },
      ctx,
    );
    eq(r.nextSlotKey, 'error', 'forward error');
    eq(await ctx.variables.get('flowError'), 'composio_tool error', 'flowError con messaggio di default');
  });

  await run('composio_tool → toolkit mancante: error senza chiamare il servizio', async () => {
    const spy = makeSpy();
    const ctx = makeCtx({ services: spy.services });
    const r = await handler.execute(
      { data: { tool: 'TILEDESK_SHEETS_APPEND_ROW', arguments: {}, assignErrorTo: 'err' } },
      ctx,
    );
    eq(r.nextSlotKey, 'error', 'forward error');
    eq(spy.calls.length, 0, 'composioExecute NON chiamato');
    ok((await ctx.variables.get('flowError')).length > 0, 'flowError valorizzato');
    ok((await ctx.variables.get('err')).length > 0, 'assignErrorTo valorizzato anche in validazione');
  });

  await run('composio_tool → tool mancante: error senza chiamare il servizio', async () => {
    const spy = makeSpy();
    const ctx = makeCtx({ services: spy.services });
    const r = await handler.execute({ data: { toolkit: 'googlesheets', arguments: {} } }, ctx);
    eq(r.nextSlotKey, 'error', 'forward error');
    eq(spy.calls.length, 0, 'composioExecute NON chiamato');
  });

  await run('composio_tool → successo senza assignResultTo: nessun crash, nessuna variabile scritta', async () => {
    const spy = makeSpy({ ok: true, data: { id: 'xyz' } });
    const ctx = makeCtx({ services: spy.services });
    const r = await handler.execute(
      { data: { toolkit: 'googlesheets', tool: 'TILEDESK_SHEETS_APPEND_ROW', arguments: {} } },
      ctx,
    );
    eq(r.nextSlotKey, 'success', 'forward success');
    const all = await ctx.variables.all();
    eq(Object.keys(all).length, 0, 'nessuna variabile scritta in assoluto');
  });

  await run('composio_tool → errore senza assignErrorTo: nessun crash, solo flowError scritta', async () => {
    const spy = makeSpy({ ok: false, error: 'boom' });
    const ctx = makeCtx({ services: spy.services });
    const r = await handler.execute(
      { data: { toolkit: 'googlesheets', tool: 'TILEDESK_SHEETS_APPEND_ROW', arguments: {} } },
      ctx,
    );
    eq(r.nextSlotKey, 'error', 'forward error');
    const all = await ctx.variables.all();
    eq(Object.keys(all), ['flowError'], 'solo flowError scritta, nessun assignErrorTo');
  });

  await run('composio_tool → integrazione con mock-services reale (composioError)', async () => {
    const ctx = makeCtx({ mock: { composioError: true } });
    const r = await handler.execute(
      {
        data: {
          toolkit: 'googlesheets',
          tool: 'TILEDESK_SHEETS_APPEND_ROW',
          arguments: { spreadsheetTitle: 'Foglio' },
          assignErrorTo: 'err',
        },
      },
      ctx,
    );
    eq(r.nextSlotKey, 'error', 'forward error con mock-services condiviso');
    eq(await ctx.variables.get('err'), 'mock composio error', 'assignErrorTo dal mock condiviso');
  });

  await run('composio_tool → integrazione con mock-services reale (success)', async () => {
    const ctx = makeCtx();
    const r = await handler.execute(
      {
        data: {
          toolkit: 'googlesheets',
          tool: 'TILEDESK_SHEETS_APPEND_ROW',
          arguments: { spreadsheetTitle: 'Foglio' },
          assignResultTo: 'sheet_result',
        },
      },
      ctx,
    );
    eq(r.nextSlotKey, 'success', 'forward success con mock-services condiviso');
    eq(
      await ctx.variables.get('sheet_result'),
      JSON.stringify({ mock: true, tool: 'TILEDESK_SHEETS_APPEND_ROW' }),
      'data dal mock condiviso, serializzato JSON',
    );
  });

  await run('composio_tool ← alias legacy google_sheets: il dispatcher traduce lo shape e delega a composio_tool', async () => {
    const { walk } = require('../TiledeskChatbot-V4.js');
    const spy = makeSpy({ ok: true, data: { spreadsheetId: 'sheet-legacy', created: false } });
    const node = {
      id: 'gs1',
      type: 'google_sheets',
      data: {
        spreadsheetTitle: 'Iscrizioni {{user_name}}',
        headers: ['Nome', 'Email'],
        values: ['{{user_name}}', '{{user_email}}'],
        assignSpreadsheetIdTo: 'sheetId',
      },
      slots: [],
    };
    const ctx = makeCtx({ services: spy.services, params: { user_name: 'Mario', user_email: 'mario@x.it' } });
    await walk({
      entryNode: node,
      nodes: [node],
      sender: ctx.sender,
      tdcache: ctx.tdcache,
      requestId: ctx.requestId,
      handlerCtx: ctx,
      flowlog: null,
      resuming: false,
    });
    eq(spy.calls.length, 1, 'composioExecute chiamato una volta tramite l\'alias google_sheets');
    eq(spy.calls[0].toolkit, 'googlesheets', 'toolkit tradotto a googlesheets');
    eq(spy.calls[0].tool, 'TILEDESK_SHEETS_APPEND_ROW', 'tool tradotto a TILEDESK_SHEETS_APPEND_ROW');
    eq(spy.calls[0].arguments.spreadsheetTitle, 'Iscrizioni Mario', 'spreadsheetTitle tradotto e interpolato');
    eq(spy.calls[0].arguments.values, 'Mario,mario@x.it', 'values[] → CSV interpolato');
    eq(spy.calls[0].arguments.headers, 'Nome,Email', 'headers[] → CSV');
    eq(
      await ctx.variables.get('sheetId'),
      JSON.stringify({ spreadsheetId: 'sheet-legacy', created: false }),
      'assignSpreadsheetIdTo (legacy) → assignResultTo, valorizzato con il data serializzato JSON',
    );
  });

  summary();
  // Il require di TiledeskChatbot-V4 innesca il warmup del Logger (publisher AMQP),
  // che lascia un handle aperto → forziamo l'uscita col codice di summary().
  process.exit(process.exitCode || 0);
})();
