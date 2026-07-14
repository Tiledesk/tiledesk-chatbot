/**
 * Test del nodo `add_tags`.
 *
 * Verifica che l'handler: risolva i `{{var}}` in ogni tag, scarti i vuoti, e inoltri
 * al servizio `(tags, target, pushToList)` — normalizzando `target` a `request`/`lead`
 * e `pushToList` a booleano. Senza tag validi NON chiama il servizio; forward `direct`.
 *
 * Esecuzione: `node tybotRoute/V4/test/add_tags-V4.test.js`
 */
const { makeCtx, ok, eq, run, summary } = require('./harness-V4.js');
const handler = require('../nodes/add_tags-V4.js');

// Servizio spia: registra l'ultima chiamata addTags.
function makeSpy() {
  const calls = [];
  return {
    calls,
    services: { async addTags(tags, target, pushToList) { calls.push({ tags, target, pushToList }); return { ok: true }; } },
  };
}

(async () => {
  await run('add_tags inoltra tags/target/pushToList al servizio', async () => {
    const spy = makeSpy();
    const ctx = makeCtx({ services: spy.services });
    const r = await handler.execute(
      { type: 'add_tags', data: { tags: ['vip', 'supporto'], target: 'lead', pushToList: true } },
      ctx,
    );
    eq(r.nextSlotKey, 'direct', 'forward direct');
    eq(spy.calls.length, 1, 'servizio chiamato una volta');
    eq(spy.calls[0].tags, ['vip', 'supporto'], 'tags passati');
    eq(spy.calls[0].target, 'lead', 'target passato');
    eq(spy.calls[0].pushToList, true, 'pushToList passato');
  });

  await run('add_tags risolve {{var}} e scarta i tag vuoti', async () => {
    const spy = makeSpy();
    const ctx = makeCtx({ services: spy.services, params: { plan: 'gold' } });
    await handler.execute(
      { type: 'add_tags', data: { tags: ['{{plan}}', '', '  ', 'lead'] } },
      ctx,
    );
    eq(spy.calls[0].tags, ['gold', 'lead'], 'interpolati + vuoti scartati');
    eq(spy.calls[0].target, 'request', 'target default = request');
    eq(spy.calls[0].pushToList, false, 'pushToList default = false');
  });

  await run('add_tags senza tag validi → nessuna chiamata, forward comunque', async () => {
    const spy = makeSpy();
    const ctx = makeCtx({ services: spy.services });
    const r = await handler.execute({ type: 'add_tags', data: { tags: ['', '   '] } }, ctx);
    eq(spy.calls.length, 0, 'servizio non chiamato');
    eq(r.nextSlotKey, 'direct', 'forward direct comunque');
  });

  await run('add_tags normalizza target sconosciuto a request', async () => {
    const spy = makeSpy();
    const ctx = makeCtx({ services: spy.services });
    await handler.execute({ type: 'add_tags', data: { tags: ['x'], target: 'bogus' } }, ctx);
    eq(spy.calls[0].target, 'request', 'target ignoto → request');
  });

  summary();
})();
