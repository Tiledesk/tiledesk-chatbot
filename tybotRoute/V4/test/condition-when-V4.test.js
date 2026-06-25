/**
 * Test del path expression V4 con campo `when` safe (TiledeskWhenExpression) e
 * fallback retrocompatibile sui `groups` legacy.
 *
 * Copre:
 *  - `expression-V4`: evalWhen (safe), evalConditionData (preferenza when / fallback groups);
 *  - nodi `condition` / `jsoncondition`: scelta dello slot a partire da `data.when`
 *    oppure, in sua assenza, da `data.groups`.
 *
 * Esecuzione: `node tybotRoute/V4/test/condition-when-V4.test.js`
 */
const { makeCtx, ok, eq, run, summary } = require('./harness-V4.js');
const { evalWhen, evalConditionData } = require('../expression-V4.js');
const conditionNode = require('../nodes/condition-V4.js');
const jsonConditionNode = require('../nodes/jsoncondition-V4.js');

// gruppo legacy che valuta `city == 'Roma'` (equalAsStrings)
const groupsCityRoma = [
  {
    type: 'expression',
    conditions: [
      { type: 'condition', operand1: 'city', operator: 'equalAsStrings', operand2: { type: 'const', value: 'Roma' } },
    ],
  },
];
// gruppo legacy che valuta `city == 'Nowhere'` (sempre falso per city=Roma)
const groupsCityNowhere = [
  {
    type: 'expression',
    conditions: [
      { type: 'condition', operand1: 'city', operator: 'equalAsStrings', operand2: { type: 'const', value: 'Nowhere' } },
    ],
  },
];

async function ctxWith(vars) {
  const ctx = makeCtx();
  for (const [k, v] of Object.entries(vars)) await ctx.variables.set(k, v);
  return ctx;
}

(async () => {
  await run('evalWhen — grammatica safe (no-eval)', async () => {
    eq(evalWhen('city == "Roma"', { city: 'Roma' }), true, 'text == true');
    eq(evalWhen('city == "Roma"', { city: 'Milano' }), false, 'text == false');
    eq(evalWhen('age > 18', { age: '20' }), true, 'relazionale numerico (coercizione stringa)');
    eq(evalWhen('startsWith(s, "dar")', { s: 'dario' }), true, 'funzione whitelisted startsWith');
    eq(evalWhen('!isEmpty(s)', { s: 'x' }), true, 'negazione + isEmpty');
  });

  await run('evalWhen — fail-safe → false', async () => {
    eq(evalWhen('constructor.constructor("return 1")()', {}), false, 'call non-whitelisted → false');
    eq(evalWhen('a +', {}), false, 'sintassi invalida → false');
    eq(evalWhen('x == 1', {}), false, 'variabile mancante → false');
  });

  await run('evalConditionData — preferenza when, fallback groups', async () => {
    // when presente: vince sul groups (anche se groups direbbe il contrario)
    eq(evalConditionData({ when: 'city == "Roma"', groups: groupsCityNowhere }, { city: 'Roma' }), true,
      'when=true prevale su groups=false');
    eq(evalConditionData({ when: 'city == "Nowhere"', groups: groupsCityRoma }, { city: 'Roma' }), false,
      'when=false prevale su groups=true');
    // when assente/vuoto: fallback al legacy groups
    eq(evalConditionData({ groups: groupsCityRoma }, { city: 'Roma' }), true, 'no when → groups (true)');
    eq(evalConditionData({ when: '   ', groups: groupsCityRoma }, { city: 'Roma' }), true, 'when whitespace → groups');
    eq(evalConditionData({ groups: groupsCityNowhere }, { city: 'Roma' }), false, 'no when → groups (false)');
  });

  await run('node condition → slot true/else via when', async () => {
    const r1 = await conditionNode.execute({ data: { when: 'city == "Roma"' } }, await ctxWith({ city: 'Roma' }));
    eq(r1.nextSlotKey, 'true', 'when true → true');
    const r2 = await conditionNode.execute({ data: { when: 'city == "Roma"' } }, await ctxWith({ city: 'Milano' }));
    eq(r2.nextSlotKey, 'else', 'when false → else');
    // fallback groups (nessun when)
    const r3 = await conditionNode.execute({ data: { groups: groupsCityRoma } }, await ctxWith({ city: 'Roma' }));
    eq(r3.nextSlotKey, 'true', 'no when → groups true → true');
  });

  await run('node jsoncondition → slot true/false via when', async () => {
    const r1 = await jsonConditionNode.execute({ data: { when: '(city == "Roma") || (city == "Milano")' } }, await ctxWith({ city: 'Milano' }));
    eq(r1.nextSlotKey, 'true', 'when (gruppi con ||) true → true');
    const r2 = await jsonConditionNode.execute({ data: { when: '(city == "Roma") || (city == "Milano")' } }, await ctxWith({ city: 'Napoli' }));
    eq(r2.nextSlotKey, 'false', 'when false → false');
    const r3 = await jsonConditionNode.execute({ data: { groups: groupsCityNowhere } }, await ctxWith({ city: 'Roma' }));
    eq(r3.nextSlotKey, 'false', 'no when → groups false → false');
  });

  summary();
})();
