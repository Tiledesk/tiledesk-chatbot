const { makeCtx, ok, eq, run, summary } = require('./harness-V4.js');
const H = (t) => require('../nodes/' + t + '-V4.js');

(async () => {
  await run('agent → direct + transferToAgent', async () => {
    const ctx = makeCtx();
    eq((await H('agent').execute({ data: {} }, ctx)).nextSlotKey, 'direct', 'forward direct');
    ok(ctx.services._calls.includes('transferToAgent'), 'service transferToAgent chiamato');
  });

  await run('close → close:true + closeRequest (valutazione servizio nel widget)', async () => {
    const ctx = makeCtx();
    const r = await H('close').execute({ data: {} }, ctx);
    ok(r.close === true && r.stop === true, 'result close+stop');
    ok(ctx.services._calls.includes('closeRequest'), 'service closeRequest chiamato (chiude la richiesta lato server)');
  });

  await run('department → direct + changeDepartment(nome risolto)', async () => {
    const ctx = makeCtx({ params: { dep: 'Sales' } });
    eq((await H('department').execute({ data: { depName: '{{dep}}' } }, ctx)).nextSlotKey, 'direct', 'direct');
    ok(ctx.services._calls.includes('changeDepartment:Sales'), 'changeDepartment con nome risolto');
  });

  await run('move_to_unassigned / clear_transcript → direct', async () => {
    const ctx = makeCtx();
    eq((await H('move_to_unassigned').execute({ data: {} }, ctx)).nextSlotKey, 'direct', 'unassigned direct');
    eq((await H('clear_transcript').execute({ data: {} }, ctx)).nextSlotKey, 'direct', 'clear_transcript direct');
    ok(ctx.services._calls.includes('moveToUnassigned') && ctx.services._calls.includes('clearTranscript'), 'service chiamati');
  });

  await run('add_tags → direct + addTags(tag risolti)', async () => {
    const ctx = makeCtx({ params: { plan: 'gold' } });
    eq((await H('add_tags').execute({ data: { tags: ['vip', '{{plan}}'], target: 'request' } }, ctx)).nextSlotKey, 'direct', 'direct');
    ok(ctx.services._calls.some((c) => c.startsWith('addTags:["vip","gold"]:request')), 'addTags con tag risolti');
  });

  await run('ifopenhours → open vs else', async () => {
    eq((await H('ifopenhours').execute({ data: {} }, makeCtx({ mock: { isOpen: true } }))).nextSlotKey, 'open', 'aperto → open');
    eq((await H('ifopenhours').execute({ data: {} }, makeCtx({ mock: { isOpen: false } }))).nextSlotKey, 'else', 'chiuso → else');
  });

  await run('ifonlineagentsv2 → online vs else', async () => {
    eq((await H('ifonlineagentsv2').execute({ data: {} }, makeCtx({ mock: { onlineAgents: true } }))).nextSlotKey, 'online', 'agenti → online');
    eq((await H('ifonlineagentsv2').execute({ data: {} }, makeCtx({ mock: { onlineAgents: false } }))).nextSlotKey, 'else', 'nessun agente → else');
  });

  summary();
})();
