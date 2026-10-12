var assert = require('assert');
const { ConnectorsV3 } = require('../utils/ConnectorsV3');

/**
 * Gli agenti V3 tengono i collegamenti nella lista `bot.attributes.connectors`: prima di eseguire
 * un blocco, il motore riscrive da li' i campi di destinazione delle action. Un bot V2, o un V3
 * senza lista, non viene toccato.
 */
describe('ConnectorsV3 - le destinazioni dei blocchi V3 dalla lista del bot', function () {

  const START = 'start-id', A = 'a-id', B = 'b-id', C = 'c-id';
  const lista = (items) => ({ version: 1, updatedAt: '2026-10-12T00:00:00.000Z', items });
  const record = (id, kind = 'action') => {
    const parts = id.split('/');
    return { id, from: { intentId: parts[0], actionId: parts[1], slot: 'x' }, to: { intentId: parts[parts.length - 1] }, kind };
  };
  const botV3 = (items) => ({ _id: 'bot', attributes: { dsVersion: 'v3', connectors: lista(items) } });

  const blocco = () => ({
    intent_id: START,
    actions: [
      { _tdActionId: 'tf', _tdActionType: 'ai_prompt', trueIntent: '', falseIntent: '#' + C },
      { _tdActionId: 'cb', _tdActionType: 'connect_block', intentName: '' },
      { _tdActionId: 'multi', _tdActionType: 'jsonconditionmulti', cases: [{ _tdCaseId: 'c1', intent: '' }, { _tdCaseId: 'c2', intent: '#' + A }], elseIntent: '' },
      { _tdActionId: 'ai', _tdActionType: 'ai_condition', intents: [{ label: 'yes', conditionIntentId: '' }], fallbackIntent: '', errorIntent: '' },
      { _tdActionId: 'r1', _tdActionType: 'reply', attributes: { commands: [{ type: 'wait' }, { type: 'message', message: { attributes: { attachment: { buttons: [
        { uid: 'b1', type: 'action', value: 'Go' },                                  // ripulito: si riempie dalla lista
        { uid: 'b2', type: 'action', value: 'Params' },                              // idem, con la coda {...} dal record
        { uid: 'b3', type: 'action', value: 'Old', action: '#' + C },                // senza record: torna di testo
        { uid: 'b4', type: 'text', value: 'Solo testo' },                            // resta com'e'
        { uid: 'b5', type: 'url', value: 'Sito', link: 'https://x', action: '#' + C }, // url: mai toccato
        { uid: 'b6', type: 'action', value: 'Keep', action: '#' + A + '{"q":2}' },   // lista senza coda: la sua resta
      ] } } } }] } },
      { _tdActionId: 'r2', _tdActionType: 'replyv2', noInputIntent: '', noMatchIntent: '' },
      { _tdActionId: 'cap', _tdActionType: 'capture_user_reply', goToIntent: '' },
      { _tdActionId: 'it', _tdActionType: 'iteration', goToIntent: '', fallbackIntent: '' },
      { _tdActionId: 'legacy', _tdActionType: 'intent', intentName: 'Nome di blocco' },
      { _tdActionId: 'voice', _tdActionType: 'dtmf_menu', attributes: { commands: [{ type: 'message' }, { type: 'message', settings: {} }] } },
      { _tdActionType: 'intent', intentName: '' },   // senza _tdActionId: non puo' stare nella lista
    ],
    attributes: { nextBlockAction: { _tdActionType: 'intent', _tdActionId: 'n', intentName: '' } },
  });

  it('un bot V2 (senza dsVersion) non viene toccato, lista o non lista', () => {
    const intent = blocco();
    const before = JSON.stringify(intent);
    assert.strictEqual(ConnectorsV3.projectIntent({ _id: 'bot', attributes: { connectors: lista([record(START + '/n/' + A, 'block')]) } }, intent), null);
    assert.strictEqual(ConnectorsV3.projectIntent({ _id: 'bot' }, intent), null);
    assert.strictEqual(ConnectorsV3.projectIntent(null, intent), null);
    assert.strictEqual(JSON.stringify(intent), before);
    assert.strictEqual(ConnectorsV3.usesCollection({ _id: 'bot', attributes: { connectors: lista([]) } }), false);
  });

  it('un bot V3 senza lista (mai aperto nel Design Studio nuovo) non viene toccato', () => {
    const intent = blocco();
    const before = JSON.stringify(intent);
    assert.strictEqual(ConnectorsV3.projectIntent({ _id: 'bot', attributes: { dsVersion: 'v3' } }, intent), null);
    assert.strictEqual(ConnectorsV3.projectIntent({ _id: 'bot', attributes: { dsVersion: 'v3', connectors: { version: 99, items: [] } } }, intent), null);
    assert.strictEqual(JSON.stringify(intent), before);
    assert.strictEqual(ConnectorsV3.usesCollection({ _id: 'bot', attributes: { dsVersion: 'V3 ' } }), false);
  });

  it('un bot V3 con la lista: ogni uscita del catalogo viene riscritta dalla lista, bottoni compresi', () => {
    const bot = botV3([
      record(START + '/n/' + A, 'block'),
      record(START + '/tf/true/' + B),
      // tf/false: non in lista -> si svuota
      record(START + '/cb/' + C),
      record(START + '/multi/case/c1/' + A, 'case'),
      // multi/case/c2: non in lista -> si svuota
      record(START + '/multi/else/' + B),
      record(START + '/ai/yes/true/' + C, 'branch'),
      record(START + '/ai/fallback/' + A),
      record(START + '/r1/noInput/' + B),
      record(START + '/r1/b1/' + B, 'button'),
      { ...record(START + '/r1/b2/' + C, 'button'), props: { params: '{"k":1}' } },
      record(START + '/r1/b6/' + A, 'button'),
      record(START + '/r2/noMatch/' + C),
      record(START + '/cap/' + A),
      record(START + '/it/goto/' + B),
      record(START + '/it/fallback/' + C),
      record(START + '/voice/noInput/' + A),
    ]);
    assert.strictEqual(ConnectorsV3.usesCollection(bot), true);
    const intent = blocco();
    const rewritten = ConnectorsV3.projectIntent(bot, intent);
    assert.strictEqual(intent.attributes.nextBlockAction.intentName, '#' + A);
    assert.deepStrictEqual([intent.actions[0].trueIntent, intent.actions[0].falseIntent], ['#' + B, '']);
    assert.strictEqual(intent.actions[1].intentName, '#' + C);
    assert.deepStrictEqual(intent.actions[2].cases.map(c => c.intent), ['#' + A, '']);
    assert.strictEqual(intent.actions[2].elseIntent, '#' + B);
    assert.strictEqual(intent.actions[3].intents[0].conditionIntentId, '#' + C);
    assert.deepStrictEqual([intent.actions[3].fallbackIntent, intent.actions[3].errorIntent], ['#' + A, '']);
    // la reply v1: i bottoni si riempiono dalla lista (coda compresa), `settings.noInputIntent` nasce dalla lista
    const buttons = intent.actions[4].attributes.commands[1].message.attributes.attachment.buttons;
    assert.deepStrictEqual(buttons.map(b => [b.type, b.action]), [
      ['action', '#' + B], ['action', '#' + C + '{"k":1}'], ['text', ''], ['text', undefined], ['url', '#' + C], ['action', '#' + A + '{"q":2}'],
    ]);
    assert.strictEqual(intent.actions[4].settings.noInputIntent, '#' + B);
    assert.strictEqual(intent.actions[4].settings.noMatchIntent, undefined);
    assert.deepStrictEqual([intent.actions[5].noInputIntent, intent.actions[5].noMatchIntent], ['', '#' + C]);
    assert.strictEqual(intent.actions[6].goToIntent, '#' + A);
    assert.deepStrictEqual([intent.actions[7].goToIntent, intent.actions[7].fallbackIntent], ['#' + B, '#' + C]);
    // un nome di blocco dei flussi vecchi non si tocca
    assert.strictEqual(intent.actions[8].intentName, 'Nome di blocco');
    // voice: `settings` della action e l'ultimo comando condividono l'uscita (stesso id dell'ancora, come nel Design Studio)
    assert.strictEqual(intent.actions[9].settings.noInputIntent, '#' + A);
    assert.strictEqual(intent.actions[9].attributes.commands[1].settings.noInputIntent, '#' + A);
    assert.strictEqual(intent.actions[9].attributes.commands[1].settings.noMatchIntent, undefined);
    assert.strictEqual(intent.actions[9].attributes.commands[0].settings, undefined);
    // senza _tdActionId: intatta
    assert.strictEqual(intent.actions[10].intentName, '');
    assert.strictEqual(rewritten, 19);   // 16 di prima + b1, b2 riempiti e b3 tornato di testo
    // un secondo passaggio non cambia piu' nulla
    assert.strictEqual(ConnectorsV3.projectIntent(bot, intent), 0);
  });

  it('un blocco senza pallino, o un record malformato, non fanno cadere nulla', () => {
    const bot = botV3([{ id: 'nope' }, null, { id: START + '/n/' + A, to: {} }, record(START + '/cb/' + B)]);
    const intent = { intent_id: START, actions: [{ _tdActionId: 'cb', _tdActionType: 'connect_block' }, null], attributes: {} };
    assert.strictEqual(ConnectorsV3.projectIntent(bot, intent), 1);
    assert.strictEqual(intent.actions[0].intentName, '#' + B);
    assert.strictEqual(ConnectorsV3.projectIntent(bot, { actions: [] }), null);
  });
});
