const assert = require('assert');
const { MockBotsDataSource } = require('../engine/mock/MockBotsDataSource');
const Faq_kb = require('../models/faq_kb');

/**
 * V3 agents (15/10/2026): the version label and the connectors list are two fields of the bot,
 * `ds_version` and `connectors`, no longer inside `attributes`. The engine's model must know
 * them (a field the schema ignores never reaches the directives) and the data sources must
 * hand them over as they are.
 */
describe('V3 fields of the bot', () => {

  it('the engine model knows ds_version and connectors', () => {
    assert.ok(Faq_kb.schema.path('ds_version'), 'ds_version is missing from the schema');
    assert.ok(Faq_kb.schema.path('connectors'), 'connectors is missing from the schema');
    const bot = new Faq_kb({ name: 'v3', createdBy: 'u', ds_version: 'v3', connectors: { version: 1, items: [{ id: 'a/b/c', from: { intentId: 'a', actionId: 'b', slot: 'next' }, to: { intentId: 'c' }, kind: 'block' }] } });
    assert.strictEqual(bot.ds_version, 'v3');
    assert.strictEqual(bot.connectors.items.length, 1);
    assert.strictEqual(bot.toObject().connectors.items[0].id, 'a/b/c');
  });

  it('a bot without the fields stays as it was', () => {
    const bot = new Faq_kb({ name: 'v2', createdBy: 'u', attributes: { globals: [] } });
    const json = bot.toObject();
    assert.strictEqual(json.ds_version, undefined);
    assert.strictEqual(json.connectors, undefined);
    assert.deepStrictEqual(json.attributes, { globals: [] });
  });

  it('the mock data source hands the two fields over, and nothing for a bot without them', async () => {
    const connectors = { version: 1, items: [] };
    const ds = new MockBotsDataSource({ bots: {
      v3: { name: 'v3', language: 'en', ds_version: 'v3', connectors },
      v2: { name: 'v2', language: 'en' }
    } });
    const v3 = await ds.getBotByIdCache('v3', null);
    assert.strictEqual(v3.ds_version, 'v3');
    assert.deepStrictEqual(v3.connectors, connectors);
    const v2 = await ds.getBotByIdCache('v2', null);
    assert.strictEqual('ds_version' in v2, false);
    assert.strictEqual('connectors' in v2, false);
  });
});
