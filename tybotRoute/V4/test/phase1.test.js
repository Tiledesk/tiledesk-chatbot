const { makeCtx, ok, eq, run, summary } = require('./harness-V4.js');
const H = (t) => require('../nodes/' + t + '-V4.js');

(async () => {
  await run('wait → forward direct', async () => {
    const r = await H('wait').execute({ data: { millis: 0 } }, makeCtx());
    eq(r.nextSlotKey, 'direct', 'wait ritorna nextSlotKey direct');
  });

  await run('delete → rimuove variabile', async () => {
    const ctx = makeCtx();
    await ctx.variables.set('userEmail', 'a@b.it');
    const r = await H('delete').execute({ data: { variableName: 'userEmail' } }, ctx);
    eq(await ctx.variables.get('userEmail'), null, 'variabile rimossa');
    ok(r.touchedVariables === true, 'touchedVariables true');
  });

  await run('capture_user_reply → 1ª fase: si ferma e attende (nessuna cattura)', async () => {
    const ctx = makeCtx({ message: { text: 'Mario Rossi' } });
    const r = await H('capture_user_reply').execute({ data: { assignResultTo: 'nome' } }, ctx);
    ok(r.stop === true && r.awaitInput === true, 'attende input (stop + awaitInput)');
    eq(await ctx.variables.get('nome'), null, 'niente catturato durante l\'attesa');
  });

  await run('capture_user_reply → resume: cattura il testo utente', async () => {
    const ctx = makeCtx({ message: { text: 'Mario Rossi' } });
    ctx.resuming = true; // il dispatcher segnala "questo è l'input atteso"
    const r = await H('capture_user_reply').execute({ data: { assignResultTo: 'nome' } }, ctx);
    eq(await ctx.variables.get('nome'), 'Mario Rossi', 'testo catturato in nome');
    eq(r.nextSlotKey, 'direct', 'prosegue direct dopo la cattura');
  });

  await run('setattribute-v2 → somma numerica', async () => {
    const ctx = makeCtx();
    await H('setattribute-v2').execute({ data: { destination: 'score',
      operation: { operands: [{ value: '5', isVariable: false }, { value: '3', isVariable: false }], operators: ['addAsNumber'] } } }, ctx);
    eq(await ctx.variables.get('score'), 8, '5 + 3 = 8');
  });

  await run('setattribute-v2 → usa variabile esistente', async () => {
    const ctx = makeCtx();
    await ctx.variables.set('punti', 10);
    await H('setattribute-v2').execute({ data: { destination: 'punti',
      operation: { operands: [{ value: 'punti', isVariable: true }, { value: '7', isVariable: false }], operators: ['addAsNumber'] } } }, ctx);
    eq(await ctx.variables.get('punti'), 17, '10 + 7 = 17');
  });

  await run('condition → ramo true vs else', async () => {
    const groups = [{ type: 'expression', conditions: [
      { type: 'condition', operand1: 'score', operator: 'greaterThan', operand2: { type: 'const', value: '10' } },
    ] }];
    const ctxT = makeCtx(); await ctxT.variables.set('score', 15);
    eq((await H('condition').execute({ data: { groups } }, ctxT)).nextSlotKey, 'true', 'score 15 > 10 → true');
    const ctxF = makeCtx(); await ctxF.variables.set('score', 5);
    eq((await H('condition').execute({ data: { groups } }, ctxF)).nextSlotKey, 'else', 'score 5 → else');
  });

  await run('jsoncondition → ramo true vs false', async () => {
    const groups = [{ type: 'expression', conditions: [
      { type: 'condition', operand1: 'age', operator: 'greaterThanOrEqual', operand2: { type: 'const', value: '18' } },
    ] }];
    const ctxT = makeCtx(); await ctxT.variables.set('age', 20);
    eq((await H('jsoncondition').execute({ data: { groups } }, ctxT)).nextSlotKey, 'true', 'age 20 >= 18 → true');
    const ctxF = makeCtx(); await ctxF.variables.set('age', 16);
    eq((await H('jsoncondition').execute({ data: { groups } }, ctxF)).nextSlotKey, 'false', 'age 16 → false');
  });

  await run('randomreply → invia uno dei messaggi', async () => {
    const ctx = makeCtx();
    const node = { slots: [], data: { messages: [{ text: 'Ciao!' }, { text: 'Salve!' }, { text: 'Benvenuto!' }] } };
    const r = H('randomreply').execute(node);
    ok(r.messages && r.messages.length === 1, 'un solo messaggio scelto');
    ok(['Ciao!', 'Salve!', 'Benvenuto!'].includes(r.messages[0].text), 'il messaggio è uno dei tre');
  });

  await run('connect_block / hmessage / flow_log / leadupdate / replacebotv3 → forward direct senza crash', async () => {
    const ctx = makeCtx({ message: { text: 'x' } });
    eq((await H('connect_block').execute({ data: {} }, ctx)).nextSlotKey, 'direct', 'connect_block direct');
    eq((await H('hmessage').execute({ data: { text: 'dbg {{chatbot_name}}' } }, ctx)).nextSlotKey, 'direct', 'hmessage direct');
    eq((await H('flow_log').execute({ data: { level: 'warn', log: 'step' } }, ctx)).nextSlotKey, 'direct', 'flow_log direct');
    eq((await H('leadupdate').execute({ data: { update: { email: '{{chatbot_id}}' } } }, ctx)).nextSlotKey, 'direct', 'leadupdate direct');
    eq((await H('replacebotv3').execute({ data: { botId: 'b2', useSlug: false, blockName: '' } }, ctx)).nextSlotKey, 'direct', 'replacebotv3 direct');
  });

  await run('iteration → loop su 3 item poi terminale; vuoto → fallback', async () => {
    const ctx = makeCtx();
    await ctx.variables.set('orders', ['a', 'b', 'c']);
    const node = { id: 'iter1', data: { iterable: 'orders', assignOutputTo: 'cur' } };
    let r = await require('../nodes/iteration-V4.js').execute(node, ctx);
    eq(r.nextSlotKey, 'loop', 'item 1 → loop');
    eq(await ctx.variables.get('cur'), 'a', 'cur = a');
    r = await require('../nodes/iteration-V4.js').execute(node, ctx);
    eq(await ctx.variables.get('cur'), 'b', 'cur = b');
    r = await require('../nodes/iteration-V4.js').execute(node, ctx);
    eq(await ctx.variables.get('cur'), 'c', 'cur = c');
    r = await require('../nodes/iteration-V4.js').execute(node, ctx);
    eq(r.nextSlotKey, 'done', 'completata → done (terminale)');
    // empty iterable
    const ctx2 = makeCtx();
    await ctx2.variables.set('orders', []);
    const r2 = await require('../nodes/iteration-V4.js').execute({ id: 'iter2', data: { iterable: 'orders' } }, ctx2);
    eq(r2.nextSlotKey, 'fallback', 'lista vuota → fallback');
  });

  summary();
})();
