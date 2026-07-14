/**
 * Test d'INTEGRAZIONE del nodo `flow_log` attraverso il dispatcher `walk`.
 *
 * Verifica il path reale verso il pannello di test del DS: `walk` deve pubblicare
 * sul `Logger` del turno UNA riga `LOG: <messaggio>` AL LIVELLO scelto (così il
 * pannello mostra il tag del livello + il testo), e NON la riga generica
 * "[Flow Log] Executed". Un nodo non-flow_log continua invece a loggare "Executed".
 *
 * Il `Logger` reale è sostituito da un fake che registra le chiamate per livello.
 *
 * Esecuzione: `node tybotRoute/V4/test/flow_log-walk-V4.test.js`
 */
const { makeCtx, ok, eq, run, summary } = require('./harness-V4.js');
const { walk } = require('../TiledeskChatbot-V4.js');

// Fake del Logger del turno: registra { lvl, text } per ogni metodo.
function makeFlowlog() {
  const calls = [];
  const mk = (lvl) => (...a) => { calls.push({ lvl, text: a.join(' ') }); };
  return { calls, intent_id: null, native: mk('native'), debug: mk('debug'), info: mk('info'), warn: mk('warn'), error: mk('error') };
}

// Esegue `walk` su un singolo nodo con un flowlog fake e ritorna le chiamate.
async function runWalk(node, opts) {
  const ctx = makeCtx(opts || {});
  const flowlog = makeFlowlog();
  await walk({
    entryNode: node,
    nodes: [node],
    sender: ctx.sender,
    tdcache: ctx.tdcache,
    requestId: ctx.requestId,
    handlerCtx: ctx,
    flowlog,
    resuming: false,
  });
  return flowlog;
}

(async () => {
  await run('flow_log → riga LOG: al livello scelto, senza "Executed"', async () => {
    const node = { id: 'fl1', type: 'flow_log', data: { level: 'warn', log: 'ciao {{name}}' }, slots: [] };
    const flowlog = await runWalk(node, { params: { name: 'Mario' } });
    const logLine = flowlog.calls.find((c) => c.text.startsWith('LOG: '));
    ok(!!logLine, 'esiste una riga "LOG: …"');
    eq(logLine.lvl, 'warn', 'pubblicata al livello scelto (warn)');
    eq(logLine.text, 'LOG: ciao Mario', 'testo = "LOG: <messaggio interpolato>"');
    ok(!flowlog.calls.some((c) => c.text.includes('Executed')), 'niente riga "Executed" per flow_log');
  });

  await run('flow_log livello di default info', async () => {
    const node = { id: 'fl2', type: 'flow_log', data: { log: 'x' }, slots: [] };
    const flowlog = await runWalk(node);
    const logLine = flowlog.calls.find((c) => c.text.startsWith('LOG: '));
    eq(logLine.lvl, 'info', 'default → info');
  });

  await run('flow_log con log vuoto → nessuna riga LOG', async () => {
    const node = { id: 'fl3', type: 'flow_log', data: { level: 'info', log: '' }, slots: [] };
    const flowlog = await runWalk(node);
    ok(!flowlog.calls.some((c) => c.text.startsWith('LOG: ')), 'nessuna riga LOG con log vuoto');
  });

  await run('nodo non-flow_log logga ancora "[Label] Executed"', async () => {
    const node = { id: 'w1', type: 'wait', data: { millis: 0 }, slots: [] };
    const flowlog = await runWalk(node);
    ok(flowlog.calls.some((c) => c.text.indexOf('Executed') > -1), 'wait → riga "Executed" presente');
    ok(!flowlog.calls.some((c) => c.text.startsWith('LOG: ')), 'wait → nessuna riga LOG');
  });

  summary();
  // Il require di TiledeskChatbot-V4 innesca il warmup del Logger (publisher AMQP),
  // che lascia un handle aperto → forziamo l'uscita col codice di summary().
  process.exit(process.exitCode || 0);
})();
