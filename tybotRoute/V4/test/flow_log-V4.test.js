/**
 * Test del nodo `flow_log`.
 *
 * Requisito (regressione): l'handler NON deve limitarsi a loggare su winston, ma
 * ritornare un descrittore `flowLog: { level, text }` — è ciò che `walk` pubblica
 * sul Logger del turno (→ rabbitmq → pannello di test del DS). Senza, nel log del
 * DS non compariva nulla.
 *
 * Esecuzione: `node tybotRoute/V4/test/flow_log-V4.test.js`
 */
const { makeCtx, ok, eq, run, summary } = require('./harness-V4.js');
const handler = require('../nodes/flow_log-V4.js');

(async () => {
  await run('flow_log ritorna il descrittore flowLog + forward direct', async () => {
    const ctx = makeCtx();
    const r = await handler.execute({ type: 'flow_log', data: { level: 'info', log: 'ciao' } }, ctx);
    eq(r.nextSlotKey, 'direct', 'forward sullo slot direct');
    ok(r.flowLog && typeof r.flowLog === 'object', 'ritorna flowLog');
    eq(r.flowLog.text, 'ciao', 'flowLog.text = log');
    eq(r.flowLog.level, 'info', 'flowLog.level = info');
  });

  await run('flow_log risolve i {{var}} nel testo', async () => {
    const ctx = makeCtx({ params: { name: 'Mario' } });
    const r = await handler.execute({ type: 'flow_log', data: { level: 'native', log: 'Nuovo utente: {{name}}' } }, ctx);
    eq(r.flowLog.text, 'Nuovo utente: Mario', 'testo interpolato');
    eq(r.flowLog.level, 'native', 'livello valido passa (native)');
  });

  await run('flow_log: livello mancante o invalido → default info', async () => {
    const ctx = makeCtx();
    const r1 = await handler.execute({ type: 'flow_log', data: { log: 'x' } }, ctx);
    eq(r1.flowLog.level, 'info', 'level mancante → info');
    const r2 = await handler.execute({ type: 'flow_log', data: { level: 'bogus', log: 'x' } }, ctx);
    eq(r2.flowLog.level, 'info', 'level invalido → info');
  });

  await run('flow_log: log vuoto → text vuoto (walk non pubblica)', async () => {
    const ctx = makeCtx();
    const r = await handler.execute({ type: 'flow_log', data: { level: 'info' } }, ctx);
    eq(r.flowLog.text, '', 'text vuoto quando log assente');
    eq(r.nextSlotKey, 'direct', 'forward comunque');
  });

  summary();
})();
