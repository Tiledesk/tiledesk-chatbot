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

describe('Directive DirSetRating with a Request ID', function () {

  const WEBHOOK_ID = "automation-request-project-0123456789abcdef";
  const CLOSED_ID = "support-group-project-closed-conversation";

  function directiveOn(requestId, tdcache) {
    const dir = new DirSetRating({ projectId: "project", token: "JWT token", requestId: requestId, API_ENDPOINT: "http://api", tdcache: tdcache });
    const calls = { get: [], update: [], intents: [] };
    dir.intentDir = { execute(intentDirective, callback) { calls.intents.push(intentDirective.action.intentName); callback(); } };
    dir.tdClient = {
      async getRequestById(id) { calls.get.push(id); return { request_id: id }; },
      async updateRequestProperties(id, properties) { calls.update.push({ id, properties }); return {}; }
    };
    return { dir, calls };
  }

  it('in a webhook rates the conversation named by the Request ID', async () => {
    const tdcache = memoryCache();
    await TiledeskChatbot.addParameterStatic(tdcache, WEBHOOK_ID, "payload", { payload: { request_id: CLOSED_ID } });
    const { dir, calls } = directiveOn(WEBHOOK_ID, tdcache);
    const stop = await run(dir, Object.assign({ requestId: "{{payload.payload.request_id}}", rating: "4", ratingMessage: "Positive" }, EXITS));
    assert.deepStrictEqual(calls.get, [CLOSED_ID]);
    assert.deepStrictEqual(calls.update, [{ id: CLOSED_ID, properties: { rating: 4, rating_message: "Positive" } }]);
    assert.strictEqual(stop, true);
    assert.deepStrictEqual(calls.intents, ["#success"]);
  });

  it('in a conversation an empty Request ID rates the current conversation', async () => {
    for (const requestId of [undefined, "", "  "]) {
      const tdcache = memoryCache();
      const { dir, calls } = directiveOn(REQUEST_ID, tdcache);
      await run(dir, { requestId: requestId, rating: "5", forceUpdate: true });
      assert.deepStrictEqual(calls.update, [{ id: REQUEST_ID, properties: { rating: 5 } }], "requestId " + requestId);
    }
  });

  it('in a webhook without Request ID goes to the else exit and calls no API', async () => {
    const tdcache = memoryCache();
    const { dir, calls } = directiveOn(WEBHOOK_ID, tdcache);
    const stop = await run(dir, Object.assign({ rating: "3", forceUpdate: true }, EXITS));
    assert.deepStrictEqual(calls.get, []);
    assert.deepStrictEqual(calls.update, []);
    assert.strictEqual(stop, true);
    assert.deepStrictEqual(calls.intents, ["#else"]);
    assert.strictEqual(await TiledeskChatbot.getParameterStatic(tdcache, WEBHOOK_ID, "rating_error"), DirSetRating.NO_CONVERSATION_ERROR);
  });

  it('a Request ID that fills to empty or to a webhook run id is an error, never the current conversation', async () => {
    for (const requestId of ["{{missing}}", WEBHOOK_ID]) {
      const tdcache = memoryCache();
      const { dir, calls } = directiveOn(REQUEST_ID, tdcache);
      await run(dir, Object.assign({ requestId: requestId, rating: "3", forceUpdate: true }, EXITS));
      assert.deepStrictEqual(calls.update, [], "requestId " + requestId);
      assert.deepStrictEqual(calls.intents, ["#else"], "requestId " + requestId);
    }
  });
});

describe('Directive DirSetRating saving to the conversation attributes', function () {

  function directiveWith(tdcache, currentAttributes) {
    const dir = new DirSetRating({ projectId: "project", token: "JWT token", requestId: REQUEST_ID, API_ENDPOINT: "http://api", tdcache: tdcache });
    const calls = { get: 0, properties: [], attributes: [], intents: [] };
    dir.intentDir = { execute(intentDirective, callback) { calls.intents.push(intentDirective.action.intentName); callback(); } };
    dir.tdClient = {
      async getRequestById() { calls.get++; return { request_id: REQUEST_ID, rating: 2, attributes: currentAttributes }; },
      async updateRequestProperties(id, properties) { calls.properties.push(properties); return {}; },
      updateRequestAttributes(id, attributes, callback) { calls.attributes.push({ id, attributes }); callback(null, {}); }
    };
    return { dir, calls };
  }

  it('without saveTo it still saves rating and rating_message, never the attributes', async () => {
    const tdcache = memoryCache();
    const { dir, calls } = directiveWith(tdcache, {});
    await run(dir, { rating: "4", ratingMessage: "ok", forceUpdate: true });
    assert.deepStrictEqual(calls.properties, [{ rating: 4, rating_message: "ok" }]);
    assert.deepStrictEqual(calls.attributes, []);
  });

  it('saveTo attributes saves ai_rating and ai_sentiment and never touches rating', async () => {
    const tdcache = memoryCache();
    const { dir, calls } = directiveWith(tdcache, {});
    const stop = await run(dir, Object.assign({ saveTo: "attributes", rating: "5", ratingMessage: "Molto soddisfatto", forceUpdate: true }, EXITS));
    assert.deepStrictEqual(calls.attributes, [{ id: REQUEST_ID, attributes: { ai_rating: 5, ai_sentiment: "Molto soddisfatto" } }]);
    assert.deepStrictEqual(calls.properties, []);
    assert.strictEqual(stop, true);
    assert.deepStrictEqual(calls.intents, ["#success"]);
  });

  it('saveTo attributes ignores the user rating already given and an empty message is not sent', async () => {
    const tdcache = memoryCache();
    const { dir, calls } = directiveWith(tdcache, { other: "kept" });
    await run(dir, { saveTo: "attributes", rating: "3", ratingMessage: "" });
    assert.strictEqual(calls.get, 1);
    assert.deepStrictEqual(calls.attributes, [{ id: REQUEST_ID, attributes: { ai_rating: 3 } }]);
  });

  it('saveTo attributes with force update off keeps an ai_rating already saved', async () => {
    const tdcache = memoryCache();
    const { dir, calls } = directiveWith(tdcache, { ai_rating: 1 });
    const stop = await run(dir, Object.assign({ saveTo: "attributes", rating: "5" }, EXITS));
    assert.deepStrictEqual(calls.attributes, []);
    assert.strictEqual(stop, true);
    assert.deepStrictEqual(calls.intents, ["#success"]);
  });

  it('saveTo attributes: an API error goes to the else exit with the reason', async () => {
    const tdcache = memoryCache();
    const { dir, calls } = directiveWith(tdcache, {});
    dir.tdClient.updateRequestAttributes = (id, attributes, callback) => callback(new Error("boom"));
    const stop = await run(dir, Object.assign({ saveTo: "attributes", rating: "5", forceUpdate: true }, EXITS));
    assert.strictEqual(stop, true);
    assert.deepStrictEqual(calls.intents, ["#else"]);
    assert.strictEqual(await TiledeskChatbot.getParameterStatic(tdcache, REQUEST_ID, "rating_error"), "boom");
  });
});
