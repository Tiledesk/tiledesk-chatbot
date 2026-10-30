var assert = require('assert');
const { ConnectorsV3, OUTPUT_CATALOG } = require('../utils/ConnectorsV3');

/**
 * invite_human / remove_human in un agente V3: le uscite (true = invitato/rimosso, false = fallback)
 * stanno solo nella lista `bot.connectors`; DirInviteHuman / DirRemoveHuman leggono
 * action.trueIntent / action.falseIntent, che il motore riscrive dalla lista.
 */
describe('ConnectorsV3 - uscite HITL (invite_human, remove_human)', function () {

  const START = 'start-id', A = 'a-id', B = 'b-id', C = 'c-id';
  const record = (id) => {
    const parts = id.split('/');
    return { id, from: { intentId: parts[0], actionId: parts[1], slot: 'x' }, to: { intentId: parts[parts.length - 1] }, kind: 'action' };
  };
  const botV3 = (items) => ({ _id: 'bot', ds_version: 'v3', connectors: { version: 1, updatedAt: '2026-10-23T00:00:00.000Z', items } });

  for (const type of ['invite_human', 'remove_human']) {
    describe(type, () => {
      it('e\' nel catalogo con le uscite true/false', () => {
        assert.ok(OUTPUT_CATALOG[type], 'manca la voce ' + type);
      });

      it('V3: le uscite si risolvono dalla lista (action senza trueIntent/falseIntent)', () => {
        const intent = { intent_id: START, actions: [{ _tdActionId: 'h', _tdActionType: type }] };
        ConnectorsV3.projectIntent(botV3([record(START + '/h/true/' + A), record(START + '/h/false/' + B)].map((r) => r)), intent);
        assert.strictEqual(intent.actions[0].trueIntent, '#' + A);
        assert.strictEqual(intent.actions[0].falseIntent, '#' + B);
      });

      it('V3: i campi vuoti vengono riempiti, una sola uscita collegata lascia l\'altra com\'e\'', () => {
        const intent = { intent_id: START, actions: [{ _tdActionId: 'h', _tdActionType: type, trueIntent: '', falseIntent: '' }] };
        ConnectorsV3.projectIntent(botV3([record(START + '/h/false/' + B)]), intent);
        assert.strictEqual(intent.actions[0].trueIntent, '');
        assert.strictEqual(intent.actions[0].falseIntent, '#' + B);
      });

      it('V2 (senza ds_version): trueIntent/falseIntent restano come sono', () => {
        const intent = { intent_id: START, actions: [{ _tdActionId: 'h', _tdActionType: type, trueIntent: '#' + C, falseIntent: '#' + A }] };
        const before = JSON.stringify(intent);
        assert.strictEqual(ConnectorsV3.projectIntent({ _id: 'bot', connectors: botV3([]).connectors }, intent), null);
        assert.strictEqual(JSON.stringify(intent), before);
      });
    });
  }
});
