/**
 * Test del fill JSON-safe (`Filler.fillJson`) e del suo uso nei nodi `webrequestv2`
 * e `web_response`.
 *
 * Requisito: le forme `{{ x }}`, `{{ x | json }}`, `"{{ x | json }}"`,
 * `{{ x.prop | json }}` (e un placeholder dentro una stringa più lunga) NON devono
 * mai rompere il `JSON.parse` dell'intero body — al massimo quel campo resta senza
 * valore (`null` / `""`). Comportamento UNIFICATO: quoted ≡ bare in posizione di valore.
 *
 * Esecuzione: `node tybotRoute/V4/test/filljson-V4.test.js`
 */
const { makeCache, makeCtx, ok, eq, run, summary } = require('./harness-V4.js');
const { Filler } = require('../../tiledeskChatbotPlugs/Filler.js');
const H = (t) => require('../nodes/' + t + '-V4.js');

const filler = new Filler();
/** fillJson + JSON.parse; ritorna `{ ok, value, raw }`. */
function parseFilled(tpl, params) {
  const raw = filler.fillJson(tpl, { ...params });
  try { return { ok: true, value: JSON.parse(raw), raw }; }
  catch (e) { return { ok: false, value: null, raw }; }
}

const PARAMS = {
  orderStatus: 200,
  orderResponse: { message: 'ciao "mondo"\nnewline', code: 7 },
  payload: { order_id: 'A1', name: 'Dario', nested: { x: 1 } },
};

(async () => {

  await run('fillJson → esempio utente (status/response/payload bare)', async () => {
    const r = parseFilled(
      '{ "status": {{orderStatus}}, "response": {{ orderResponse.message | json }}, "payload": {{ payload | json }} }',
      PARAMS
    );
    ok(r.ok, 'JSON valido');
    eq(r.value.status, 200, 'status → numero 200');
    eq(r.value.response, 'ciao "mondo"\nnewline', 'response → stringa (json filter)');
    eq(r.value.payload, PARAMS.payload, 'payload → oggetto');
  });

  await run('fillJson → le 4 forme unificate NON rompono il body', async () => {
    // 1) {{ payload | json }}  2) "{{ payload | json }}"  3) {{ payload }}  4) "{{ payload }}"
    for (const tpl of [
      '{ "a": {{ payload | json }} }',
      '{ "a": "{{ payload | json }}" }',
      '{ "a": {{ payload }} }',
      '{ "a": "{{ payload }}" }',
    ]) {
      const r = parseFilled(tpl, PARAMS);
      ok(r.ok, 'JSON valido: ' + tpl);
      eq(r.value.a, PARAMS.payload, 'a → oggetto payload: ' + tpl);
    }
  });

  await run('fillJson → property con | json e senza', async () => {
    eq(parseFilled('{ "a": {{ payload.name | json }} }', PARAMS).value.a, 'Dario', 'name | json → "Dario"');
    eq(parseFilled('{ "a": {{ payload.name }} }', PARAMS).value.a, 'Dario', 'name bare → "Dario"');
    eq(parseFilled('{ "a": {{ orderStatus }} }', PARAMS).value.a, 200, 'orderStatus → numero');
  });

  await run('fillJson → valore mancante → null (valore) / "" (in stringa), mai errore', async () => {
    const r = parseFilled('{ "m1": {{ nope | json }}, "m2": {{ nope }}, "m3": "{{ nope }}", "m4": "pre {{ nope }} post" }', PARAMS);
    ok(r.ok, 'JSON valido');
    eq(r.value.m1, null, 'nope | json → null');
    eq(r.value.m2, null, 'nope bare → null');
    eq(r.value.m3, null, 'nope sole-quoted → null (unificato ≡ bare)');
    eq(r.value.m4, 'pre  post', 'nope dentro stringa più lunga → ""');
  });

  await run('fillJson → placeholder dentro una stringa più lunga (embedded)', async () => {
    const r = parseFilled(
      '{ "greet": "Hello {{ payload.name }}!", "obj": "x {{ payload }} y", "msg": "say: {{ orderResponse.message }}" }',
      PARAMS
    );
    ok(r.ok, 'JSON valido (virgolette/newline escaped)');
    eq(r.value.greet, 'Hello Dario!', 'embedded string');
    eq(r.value.obj, 'x [object Object] y', 'oggetto senza json in stringa → [object Object]');
    eq(r.value.msg, 'say: ciao "mondo"\nnewline', 'stringa con " e newline non spezza il body');
  });

  await run('fillJson → oggetto annidato con | json', async () => {
    const r = parseFilled('{ "r": {{ orderResponse | json }} }', PARAMS);
    ok(r.ok, 'JSON valido');
    eq(r.value.r, PARAMS.orderResponse, 'oggetto annidato preservato');
  });

  // ── Integrazione nodi ──────────────────────────────────────────────────────
  await run('webrequestv2 → jsonBody con {{payload}} → body tipizzato (mock echo)', async () => {
    const ctx = makeCtx({ params: PARAMS }); // mock http ri-echeggia req.body in .echo
    const node = { data: {
      url: 'http://x/api', method: 'POST', bodyType: 'json',
      jsonBody: '{ "id": {{ payload.order_id }}, "who": "{{ payload.name }}", "full": {{ payload }} }',
      assignResultTo: 'resp',
    } };
    const r = await H('webrequestv2').execute(node, ctx);
    eq(r.nextSlotKey, 'success', 'success');
    eq((await ctx.variables.get('resp')).echo, { id: 'A1', who: 'Dario', full: PARAMS.payload }, 'body JSON-safe tipizzato');
  });

  await run('webrequestv2 → jsonBody con oggetto bare non rompe la request', async () => {
    const ctx = makeCtx({ params: PARAMS });
    const node = { data: {
      url: 'http://x/api', method: 'POST', bodyType: 'json',
      jsonBody: '{ "p": {{ payload }}, "missing": {{ nope }} }',
      assignResultTo: 'resp',
    } };
    const r = await H('webrequestv2').execute(node, ctx);
    eq(r.nextSlotKey, 'success', 'success (non va in error per JSON rotto)');
    eq((await ctx.variables.get('resp')).echo, { p: PARAMS.payload, missing: null }, 'body valido: oggetto + null');
  });

  await run('web_response → payload con placeholder pubblicato come JSON valido', async () => {
    const published = [];
    const cache = makeCache();
    cache.publish = (topic, msg) => published.push({ topic, msg });
    const ctx = makeCtx({ cache, params: PARAMS });
    const node = { data: {
      status: '{{ orderStatus }}', bodyType: 'json',
      payload: '{ "ok": true, "data": {{ payload | json }}, "note": "{{ payload.name }}" }',
    } };
    await H('web_response').execute(node, ctx);
    ok(published.length === 1, 'pubblicato una volta');
    const sent = JSON.parse(published[0].msg);
    eq(sent.status, 200, 'status → 200 (da {{orderStatus}})');
    eq(sent.payload, { ok: true, data: PARAMS.payload, note: 'Dario' }, 'payload JSON valido e tipizzato');
  });

  await run('web_response → payload malformato prima del rework → ora non rompe', async () => {
    const published = [];
    const cache = makeCache();
    cache.publish = (topic, msg) => published.push({ topic, msg });
    const ctx = makeCtx({ cache, params: PARAMS });
    // "{{ payload | json }}" tra virgolette: prima produceva JSON rotto → body vuoto.
    const node = { data: {
      status: '200', bodyType: 'json',
      payload: '{ "data": "{{ payload | json }}" }',
    } };
    await H('web_response').execute(node, ctx);
    const sent = JSON.parse(published[0].msg);
    eq(sent.payload, { data: PARAMS.payload }, 'quoted json → oggetto (unificato), non body vuoto');
  });

  summary();
})();
