var assert = require('assert');
const { ConnectorsV3, OUTPUT_CATALOG } = require('../utils/ConnectorsV3');

/**
 * set_rating in a V3 bot: Design Studio V3 (3.2.4) marks the type store-owned, so its exits
 * (true = Success, false = else) live only in `bot.connectors`; DirSetRating reads
 * action.trueIntent / action.falseIntent, which the engine rewrites from the list.
 * Without the catalogue entry the rating is saved but the flow stops: no exit is ever taken.
 * get_rating has no exits of its own: the block exit carries it.
 */
describe('ConnectorsV3 - set_rating exits', function () {

  const START = 'start-id', A = 'a-id', B = 'b-id', C = 'c-id';
  const record = (id) => {
    const parts = id.split('/');
    return { id, from: { intentId: parts[0], actionId: parts[1], slot: 'x' }, to: { intentId: parts[parts.length - 1] }, kind: 'action' };
  };
  const botV3 = (items) => ({ _id: 'bot', ds_version: 'v3', connectors: { version: 1, updatedAt: '2026-11-12T00:00:00.000Z', items } });
  const type = 'set_rating';

  it('is in the catalogue with the true/false exits', () => {
    assert.deepStrictEqual(OUTPUT_CATALOG[type].map((o) => o.suffix + ':' + o.field), ['/true:trueIntent', '/false:falseIntent']);
  });

  it('get_rating has no exits of its own', () => {
    assert.strictEqual(OUTPUT_CATALOG['get_rating'], undefined);
  });

  it('V3: the exits are resolved from the list (action without trueIntent/falseIntent)', () => {
    const intent = { intent_id: START, actions: [{ _tdActionId: 'r', _tdActionType: type, rating: '4', saveTo: 'rating', assignErrorTo: 'rating_error' }] };
    ConnectorsV3.projectIntent(botV3([record(START + '/r/true/' + A), record(START + '/r/false/' + B)]), intent);
    assert.strictEqual(intent.actions[0].trueIntent, '#' + A);
    assert.strictEqual(intent.actions[0].falseIntent, '#' + B);
  });

  it('V3: empty fields are filled, a single connected exit leaves the other as it is', () => {
    const intent = { intent_id: START, actions: [{ _tdActionId: 'r', _tdActionType: type, trueIntent: '', falseIntent: '' }] };
    ConnectorsV3.projectIntent(botV3([record(START + '/r/false/' + B)]), intent);
    assert.strictEqual(intent.actions[0].trueIntent, '');
    assert.strictEqual(intent.actions[0].falseIntent, '#' + B);
  });

  it('V2 (no ds_version): trueIntent/falseIntent stay as they are', () => {
    const intent = { intent_id: START, actions: [{ _tdActionId: 'r', _tdActionType: type, trueIntent: '#' + C, falseIntent: '#' + A }] };
    const before = JSON.stringify(intent);
    assert.strictEqual(ConnectorsV3.projectIntent({ _id: 'bot', connectors: botV3([]).connectors }, intent), null);
    assert.strictEqual(JSON.stringify(intent), before);
  });
});
