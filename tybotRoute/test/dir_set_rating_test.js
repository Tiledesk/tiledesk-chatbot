var assert = require('assert');
const { DirSetRating } = require('../tiledeskChatbotPlugs/directives/DirSetRating.js');
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

/** A DirSetRating whose API client records its calls; the conversation has `currentRating` */
function directive(tdcache, currentRating) {
  const dir = new DirSetRating({ projectId: "project", token: "JWT token", requestId: REQUEST_ID, API_ENDPOINT: "http://api", tdcache: tdcache });
  const calls = { get: 0, update: [], intents: [] };
  dir.intentDir = { execute(intentDirective, callback) { calls.intents.push(intentDirective.action.intentName); callback(); } };
  dir.tdClient = {
    async getRequestById() { calls.get++; return { request_id: REQUEST_ID, rating: currentRating }; },
    async updateRequestProperties(requestId, properties) { calls.update.push(properties); return {}; }
  };
  return { dir, calls };
}

/** Resolves with the `stop` the directive calls back with */
function run(dir, action) {
  return new Promise((resolve) => {
    dir.execute({ action: Object.assign({ _tdActionType: "set_rating", _tdActionId: "a1" }, action) }, resolve);
  });
}

const EXITS = { trueIntent: "#success", falseIntent: "#else", assignErrorTo: "rating_error" };

describe('Directive DirSetRating', function () {

  it('sets a fixed rating when the conversation has none', async () => {
    const tdcache = memoryCache();
    const { dir, calls } = directive(tdcache, undefined);
    await run(dir, { rating: "4", forceUpdate: false });
    assert.strictEqual(calls.get, 1);
    assert.deepStrictEqual(calls.update, [{ rating: 4 }]);
  });

  it('fills the rating from a variable', async () => {
    const tdcache = memoryCache();
    await TiledeskChatbot.addParameterStatic(tdcache, REQUEST_ID, "voto", "5");
    const { dir, calls } = directive(tdcache, undefined);
    await run(dir, { rating: "{{voto}}", forceUpdate: true });
    assert.deepStrictEqual(calls.update, [{ rating: 5 }]);
  });

  it('a value out of 1-5 is not saved and sets flowError', async () => {
    for (const value of ["0", "6", "3.5", "abc", "", "{{missing}}"]) {
      const tdcache = memoryCache();
      const { dir, calls } = directive(tdcache, undefined);
      await run(dir, { rating: value, forceUpdate: true });
      assert.deepStrictEqual(calls.update, [], "value " + value);
      const flowError = await TiledeskChatbot.getParameterStatic(tdcache, REQUEST_ID, "flowError");
      assert.ok(flowError && flowError.startsWith("Set rating Error"), "value " + value);
    }
  });

  it('force update off keeps a rating already given', async () => {
    const tdcache = memoryCache();
    const { dir, calls } = directive(tdcache, 2);
    await run(dir, { rating: "4", forceUpdate: false });
    assert.strictEqual(calls.get, 1);
    assert.deepStrictEqual(calls.update, []);
  });

  it('a missing forceUpdate behaves as off', async () => {
    const tdcache = memoryCache();
    const { dir, calls } = directive(tdcache, 2);
    await run(dir, { rating: "4" });
    assert.deepStrictEqual(calls.update, []);
  });

  it('force update on overwrites without reading the conversation', async () => {
    const tdcache = memoryCache();
    const { dir, calls } = directive(tdcache, 2);
    await run(dir, { rating: "4", forceUpdate: true });
    assert.strictEqual(calls.get, 0);
    assert.deepStrictEqual(calls.update, [{ rating: 4 }]);
  });

  it('an API error sets flowError and calls back once', async () => {
    const tdcache = memoryCache();
    const { dir } = directive(tdcache, undefined);
    dir.tdClient.updateRequestProperties = async () => { throw new Error("boom"); };
    let callbacks = 0;
    await new Promise((resolve) => {
      dir.execute({ action: { _tdActionType: "set_rating", rating: "3", forceUpdate: true } }, () => { callbacks++; resolve(); });
    });
    assert.strictEqual(callbacks, 1);
    const flowError = await TiledeskChatbot.getParameterStatic(tdcache, REQUEST_ID, "flowError");
    assert.strictEqual(flowError, "Set rating Error: boom");
  });

  it('sends the filled rating message as rating_message', async () => {
    const tdcache = memoryCache();
    await TiledeskChatbot.addParameterStatic(tdcache, REQUEST_ID, "nome", "Mario");
    const { dir, calls } = directive(tdcache, undefined);
    await run(dir, { rating: "5", ratingMessage: "  Grazie {{nome}}  ", forceUpdate: true });
    assert.deepStrictEqual(calls.update, [{ rating: 5, rating_message: "Grazie Mario" }]);
  });

  it('an empty rating message is not sent', async () => {
    for (const ratingMessage of [undefined, null, "", "   ", "{{missing}}"]) {
      const tdcache = memoryCache();
      const { dir, calls } = directive(tdcache, undefined);
      await run(dir, { rating: "3", ratingMessage: ratingMessage, forceUpdate: true });
      assert.deepStrictEqual(calls.update, [{ rating: 3 }], "message " + ratingMessage);
    }
  });

  it('a saved rating goes to the Success exit, stops the block and removes an older error', async () => {
    const tdcache = memoryCache();
    await TiledeskChatbot.addParameterStatic(tdcache, REQUEST_ID, "rating_error", "old error");
    const { dir, calls } = directive(tdcache, undefined);
    const stop = await run(dir, Object.assign({ rating: "4", forceUpdate: true }, EXITS));
    assert.strictEqual(stop, true);
    assert.deepStrictEqual(calls.intents, ["#success"]);
    assert.strictEqual(await TiledeskChatbot.getParameterStatic(tdcache, REQUEST_ID, "rating_error"), null);
  });

  it('a rating kept because already given goes to the Success exit', async () => {
    const tdcache = memoryCache();
    const { dir, calls } = directive(tdcache, 2);
    const stop = await run(dir, Object.assign({ rating: "4", forceUpdate: false }, EXITS));
    assert.deepStrictEqual(calls.update, []);
    assert.strictEqual(stop, true);
    assert.deepStrictEqual(calls.intents, ["#success"]);
  });

  it('an invalid rating goes to the else exit with the reason in assignErrorTo', async () => {
    const tdcache = memoryCache();
    const { dir, calls } = directive(tdcache, undefined);
    const stop = await run(dir, Object.assign({ rating: "9", forceUpdate: true }, EXITS));
    assert.deepStrictEqual(calls.update, []);
    assert.strictEqual(stop, true);
    assert.deepStrictEqual(calls.intents, ["#else"]);
    assert.strictEqual(await TiledeskChatbot.getParameterStatic(tdcache, REQUEST_ID, "rating_error"), "invalid rating '9', it must be an integer from 1 to 5");
  });

  it('an API error goes to the else exit with the reason in assignErrorTo', async () => {
    const tdcache = memoryCache();
    const { dir, calls } = directive(tdcache, undefined);
    dir.tdClient.updateRequestProperties = async () => { throw new Error("boom"); };
    const stop = await run(dir, Object.assign({ rating: "3", forceUpdate: true }, EXITS));
    assert.strictEqual(stop, true);
    assert.deepStrictEqual(calls.intents, ["#else"]);
    assert.strictEqual(await TiledeskChatbot.getParameterStatic(tdcache, REQUEST_ID, "rating_error"), "boom");
    assert.strictEqual(await TiledeskChatbot.getParameterStatic(tdcache, REQUEST_ID, "flowError"), "Set rating Error: boom");
  });

  it('without connected exits the flow goes on', async () => {
    const tdcache = memoryCache();
    const { dir, calls } = directive(tdcache, undefined);
    assert.ok(!(await run(dir, { rating: "4", forceUpdate: true })));
    assert.ok(!(await run(dir, { rating: "x", forceUpdate: true })));
    assert.deepStrictEqual(calls.intents, []);
  });

  it('parseRating accepts only the integers 1-5', () => {
    assert.strictEqual(DirSetRating.parseRating("1"), 1);
    assert.strictEqual(DirSetRating.parseRating(" 5 "), 5);
    assert.strictEqual(DirSetRating.parseRating(3), 3);
    assert.strictEqual(DirSetRating.parseRating("05"), null);
    assert.strictEqual(DirSetRating.parseRating(null), null);
  });
});
