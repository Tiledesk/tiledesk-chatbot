const { makeCtx, ok, eq, run, summary } = require('./harness-V4.js');
const H = (t) => require('../nodes/' + t + '-V4.js');

(async () => {
  // ── Fase 3: HTTP ───────────────────────────────────────────────────────────
  await run('webrequestv2 → success con assign + status', async () => {
    const ctx = makeCtx({ mock: { httpStatus: 200, httpBody: { name: 'Mario' } } });
    const r = await H('webrequestv2').execute({ data: { url: 'http://x/api', method: 'GET', assignResultTo: 'resp', assignStatusTo: 'st' } }, ctx);
    eq(r.nextSlotKey, 'success', 'success');
    eq(await ctx.variables.get('resp'), { name: 'Mario' }, 'assignResultTo = body');
    eq(await ctx.variables.get('st'), 200, 'assignStatusTo = 200');
  });
  await run('webrequestv2 → error con flowError', async () => {
    const ctx = makeCtx({ mock: { httpError: true, httpStatus: 500 } });
    const r = await H('webrequestv2').execute({ data: { url: 'http://x', method: 'POST', assignErrorTo: 'err' } }, ctx);
    eq(r.nextSlotKey, 'error', 'error');
    ok((await ctx.variables.get('err')) != null, 'assignErrorTo valorizzato');
    ok((await ctx.variables.get('flowError')) != null, 'flowError valorizzato');
  });
  await run('web_response → terminale (nessuno slot)', async () => {
    const r = await H('web_response').execute({ data: {} }, makeCtx());
    ok(!r.nextSlotKey && !r.next, 'nessuno slot → terminale');
  });
  await run('email / whatsapp_static / whatsapp_attribute → direct', async () => {
    const ctx = makeCtx();
    eq((await H('email').execute({ data: { to: 'a@b.it', text: 'hi' } }, ctx)).nextSlotKey, 'direct', 'email direct');
    eq((await H('whatsapp_static').execute({ data: { templateName: 't' } }, ctx)).nextSlotKey, 'direct', 'wa_static direct');
    eq((await H('whatsapp_attribute').execute({ data: { templateName: 't', attributeName: 'phone' } }, ctx)).nextSlotKey, 'direct', 'wa_attr direct');
    ok(ctx.services._calls.some((c) => c.startsWith('sendEmail')), 'sendEmail chiamato');
  });
  await run('send_whatsapp → success vs error', async () => {
    eq((await H('send_whatsapp').execute({ data: { templateName: 't' } }, makeCtx())).nextSlotKey, 'success', 'ok → success');
    eq((await H('send_whatsapp').execute({ data: { templateName: 't' } }, makeCtx({ mock: { whatsappError: true } }))).nextSlotKey, 'error', 'err → error');
  });

  // ── Fase 4: AI ─────────────────────────────────────────────────────────────
  await run('ai_prompt → success con assignReplyTo', async () => {
    const ctx = makeCtx({ mock: { aiReply: 'Risposta AI' } });
    const r = await H('ai_prompt').execute({ data: { question: 'Q', model: 'gpt', assignReplyTo: 'ans' } }, ctx);
    eq(r.nextSlotKey, 'success', 'success');
    eq(await ctx.variables.get('ans'), 'Risposta AI', 'assignReplyTo = risposta');
  });
  await run('ai_prompt → error', async () => {
    const r = await H('ai_prompt').execute({ data: { question: 'Q', assignReplyTo: 'ans' } }, makeCtx({ mock: { aiError: true } }));
    eq(r.nextSlotKey, 'error', 'error');
  });
  await run('askgptv2 → assign reply + source', async () => {
    const ctx = makeCtx({ mock: { aiReply: 'KB!' } });
    const r = await H('askgptv2').execute({ data: { question: 'Q', namespace: 'ns', assignReplyTo: 'a', assignSourceTo: 's' } }, ctx);
    eq(r.nextSlotKey, 'success', 'success');
    eq(await ctx.variables.get('a'), 'KB!', 'reply');
    ok((await ctx.variables.get('s')) != null, 'source');
  });
  await run('gpt_assistant → assign result', async () => {
    const ctx = makeCtx({ mock: { aiReply: 'Assist' } });
    const r = await H('gpt_assistant').execute({ data: { prompt: 'P', assistantId: 'as1', assignResultTo: 'res' } }, ctx);
    eq(r.nextSlotKey, 'success', 'success');
    eq(await ctx.variables.get('res'), 'Assist', 'result');
  });
  await run('ai_condition → slot intent_<id> / fallback', async () => {
    const intents = [{ id: 'abc123', label: 'Saluto' }, { id: 'def456', label: 'Acquisto' }];
    const ctxM = makeCtx({ mock: { matchIntentId: 'def456' } });
    eq((await H('ai_condition').execute({ data: { question: 'Q', intents } }, ctxM)).nextSlotKey, 'intent_def456', 'match → intent_def456');
    const ctxN = makeCtx({ mock: { matchIntentId: null } });
    // matchIntentId null ma il mock fallback al primo intent → intent_abc123
    ok(['intent_abc123', 'fallback'].includes((await H('ai_condition').execute({ data: { question: 'Q', intents } }, ctxN)).nextSlotKey), 'no match esplicito → primo/fallback');
    eq((await H('ai_condition').execute({ data: { question: 'Q', intents } }, makeCtx({ mock: { aiError: true } }))).nextSlotKey, 'error', 'errore → error');
  });
  await run('add_kb_content → direct', async () => {
    const ctx = makeCtx();
    eq((await H('add_kb_content').execute({ data: { namespace: 'ns', name: 'n', content: 'c' } }, ctx)).nextSlotKey, 'direct', 'direct');
  });

  summary();
})();
