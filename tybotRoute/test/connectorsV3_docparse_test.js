var assert = require('assert');
const { ConnectorsV3, OUTPUT_CATALOG } = require('../utils/ConnectorsV3');

/**
 * docparse_extract in a V3 bot: Design Studio V3 (3.0.20) marks the type store-owned, so its exits
 * (true = text extracted, false = failure) live only in `bot.connectors`; DirDocparseExtract reads
 * action.trueIntent / action.falseIntent, which the engine rewrites from the list.
 */
describe('ConnectorsV3 - docparse_extract exits', function () {

  const START = 'start-id', A = 'a-id', B = 'b-id', C = 'c-id';
  const record = (id) => {
    const parts = id.split('/');
    return { id, from: { intentId: parts[0], actionId: parts[1], slot: 'x' }, to: { intentId: parts[parts.length - 1] }, kind: 'action' };
  };
  const botV3 = (items) => ({ _id: 'bot', ds_version: 'v3', connectors: { version: 1, updatedAt: '2026-10-26T00:00:00.000Z', items } });
  const type = 'docparse_extract';

  it('is in the catalogue with the true/false exits', () => {
    assert.deepStrictEqual(OUTPUT_CATALOG[type].map((o) => o.suffix + ':' + o.field), ['/true:trueIntent', '/false:falseIntent']);
  });

  it('V3: the exits are resolved from the list (action without trueIntent/falseIntent)', () => {
    const intent = { intent_id: START, actions: [{ _tdActionId: 'd', _tdActionType: type, url: '{{doc_url}}', assignReplyTo: 'extracted_text' }] };
    ConnectorsV3.projectIntent(botV3([record(START + '/d/true/' + A), record(START + '/d/false/' + B)]), intent);
    assert.strictEqual(intent.actions[0].trueIntent, '#' + A);
    assert.strictEqual(intent.actions[0].falseIntent, '#' + B);
  });

  it('V3: empty fields are filled, a single connected exit leaves the other as it is', () => {
    const intent = { intent_id: START, actions: [{ _tdActionId: 'd', _tdActionType: type, trueIntent: '', falseIntent: '' }] };
    ConnectorsV3.projectIntent(botV3([record(START + '/d/true/' + A)]), intent);
    assert.strictEqual(intent.actions[0].trueIntent, '#' + A);
    assert.strictEqual(intent.actions[0].falseIntent, '');
  });

  it('V2 (no ds_version): trueIntent/falseIntent stay as they are', () => {
    const intent = { intent_id: START, actions: [{ _tdActionId: 'd', _tdActionType: type, trueIntent: '#' + C, falseIntent: '#' + A }] };
    const before = JSON.stringify(intent);
    assert.strictEqual(ConnectorsV3.projectIntent({ _id: 'bot', connectors: botV3([]).connectors }, intent), null);
    assert.strictEqual(JSON.stringify(intent), before);
  });
});
