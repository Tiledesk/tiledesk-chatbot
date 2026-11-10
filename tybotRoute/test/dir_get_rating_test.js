var assert = require('assert');
const { DirGetRating } = require('../tiledeskChatbotPlugs/directives/DirGetRating.js');
const { TiledeskChatbot } = require('../engine/TiledeskChatbot.js');

const REQUEST_ID = "support-group-project-rating-test";

/** In-memory stand-in for the redis cache: only the hash methods the parameters use */
function memoryCache() {
  const hashes = {};
  return {
    async hset(key, field, value) { (hashes[key] = hashes[key] || {})[field] = value; },
    async hget(key, field) { return hashes[key]?.[field] ?? null; },
    async hgetall(key) { return hashes[key] || null; },
    async hdel(key, field) { if (hashes[key]) delete hashes[key][field]; }
  };
}

function directive(tdcache, request) {
  const dir = new DirGetRating({ projectId: "project", token: "JWT token", requestId: REQUEST_ID, API_ENDPOINT: "http://api", tdcache: tdcache });
  dir.tdClient = { async getRequestById() { return request; } };
  return dir;
}

function run(dir, action) {
  return new Promise((resolve) => {
    dir.execute({ action: Object.assign({ _tdActionType: "get_rating", _tdActionId: "a1" }, action) }, resolve);
  });
}

const get = (tdcache, name) => TiledeskChatbot.getParameterStatic(tdcache, REQUEST_ID, name);

describe('Directive DirGetRating', function () {

  it('saves the rating and its message in the two variables', async () => {
    const tdcache = memoryCache();
    const dir = directive(tdcache, { request_id: REQUEST_ID, rating: 4, rating_message: "Tutto ok" });
    await run(dir, { assignRatingTo: "rating_value", assignRatingMessageTo: "rating_message" });
    assert.strictEqual(await get(tdcache, "rating_value"), 4);
    assert.strictEqual(await get(tdcache, "rating_message"), "Tutto ok");
  });

  it('uses the renamed variables', async () => {
    const tdcache = memoryCache();
    const dir = directive(tdcache, { rating: 2, rating_message: "lento" });
    await run(dir, { assignRatingTo: "voto", assignRatingMessageTo: "commento" });
    assert.strictEqual(await get(tdcache, "voto"), 2);
    assert.strictEqual(await get(tdcache, "commento"), "lento");
  });

  it('without a rating removes the variables left by an older read', async () => {
    const tdcache = memoryCache();
    await TiledeskChatbot.addParameterStatic(tdcache, REQUEST_ID, "rating_value", 5);
    await TiledeskChatbot.addParameterStatic(tdcache, REQUEST_ID, "rating_message", "old");
    const dir = directive(tdcache, { request_id: REQUEST_ID });
    await run(dir, { assignRatingTo: "rating_value", assignRatingMessageTo: "rating_message" });
    assert.strictEqual(await get(tdcache, "rating_value"), null);
    assert.strictEqual(await get(tdcache, "rating_message"), null);
  });

  it('skips a variable without a name', async () => {
    const tdcache = memoryCache();
    const dir = directive(tdcache, { rating: 3, rating_message: "ok" });
    await run(dir, { assignRatingTo: "rating_value", assignRatingMessageTo: "" });
    assert.strictEqual(await get(tdcache, "rating_value"), 3);
    const all = await TiledeskChatbot.allParametersStatic(tdcache, REQUEST_ID);
    assert.deepStrictEqual(Object.keys(all), ["rating_value"]);
  });

  it('an API error sets flowError and calls back', async () => {
    const tdcache = memoryCache();
    const dir = directive(tdcache, null);
    dir.tdClient.getRequestById = async () => { throw new Error("boom"); };
    await run(dir, { assignRatingTo: "rating_value", assignRatingMessageTo: "rating_message" });
    assert.strictEqual(await get(tdcache, "flowError"), "Get rating Error: boom");
    assert.strictEqual(await get(tdcache, "rating_value"), null);
  });
});
