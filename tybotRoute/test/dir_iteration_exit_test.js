var assert = require('assert');
const { TiledeskChatbot } = require('../engine/TiledeskChatbot.js');
const { DirIteration } = require('../tiledeskChatbotPlugs/directives/DirIteration.js');

// The iteration leaves its block through the block's own exit when the list is
// done. A list that is empty, missing or not a list is a list that is already
// done: the flow must go on (callback(false)), not stop in silence.

const REQUEST_ID = "support-group-projectID-iterationexit";

function fakeCache() {
  const store = {};
  return {
    store,
    get: async (key) => store[key] || null,
    set: async (key, value) => { store[key] = value; },
    del: async (key) => { delete store[key]; }
  };
}

function directiveFor(action) {
  return { action: Object.assign({ _tdActionType: "iteration", _tdActionId: "iter-1" }, action) };
}

function newIteration(tdcache, parameters, executed) {
  const context = {
    tdcache,
    requestId: REQUEST_ID,
    reply: { attributes: {} },
    chatbot: { addParameter: async (key, value) => { parameters[key] = value; } }
  };
  const dir = new DirIteration(context);
  dir.intentDir = { execute: (directive, callback) => { executed.push(directive); callback(); } };
  return dir;
}

function run(dir, directive) {
  return new Promise((resolve) => dir.execute(directive, (stop) => resolve(stop)));
}

describe('Iteration leaves the block when there is nothing left to do', function () {

  let originalGetParameterStatic;
  let parameters;

  before(() => {
    originalGetParameterStatic = TiledeskChatbot.getParameterStatic;
  });

  after(() => {
    TiledeskChatbot.getParameterStatic = originalGetParameterStatic;
  });

  beforeEach(() => {
    parameters = {};
    TiledeskChatbot.getParameterStatic = async (_tdcache, _requestId, key) => parameters[key];
  });

  it('goes on when the iterable is missing', async () => {
    const executed = [];
    const stop = await run(newIteration(fakeCache(), parameters, executed),
      directiveFor({ iterable: "attachments", assignOutputTo: "attachment", goToIntent: "#body" }));
    assert.strictEqual(stop, false);
    assert.strictEqual(executed.length, 0);
  });

  it('goes on when the iterable is an empty list', async () => {
    parameters.attachments = [];
    const executed = [];
    const stop = await run(newIteration(fakeCache(), parameters, executed),
      directiveFor({ iterable: "attachments", assignOutputTo: "attachment", goToIntent: "#body" }));
    assert.strictEqual(stop, false);
    assert.strictEqual(executed.length, 0);
  });

  it('runs the body for the first element and stops the block until the branch comes back', async () => {
    parameters.attachments = [{ filename: "a.pdf" }, { filename: "b.pdf" }];
    const executed = [];
    const tdcache = fakeCache();
    const directive = directiveFor({ iterable: "attachments", assignOutputTo: "attachment", goToIntent: "#body" });

    const first = await run(newIteration(tdcache, parameters, executed), directive);
    assert.strictEqual(first, true);
    assert.deepStrictEqual(parameters.attachment, { filename: "a.pdf" });

    const second = await run(newIteration(tdcache, parameters, executed), directive);
    assert.strictEqual(second, true);
    assert.deepStrictEqual(parameters.attachment, { filename: "b.pdf" });

    const done = await run(newIteration(tdcache, parameters, executed), directive);
    assert.strictEqual(done, false, "when the list is done the flow goes on");
    assert.strictEqual(executed.length, 2);
  });

  it('goes on when no block is set for the elements', async () => {
    parameters.attachments = [{ filename: "a.pdf" }];
    const stop = await run(newIteration(fakeCache(), parameters, []),
      directiveFor({ iterable: "attachments", assignOutputTo: "attachment" }));
    assert.strictEqual(stop, false);
  });

  it('starts over instead of resuming a loop left unfinished on another list', async () => {
    const tdcache = fakeCache();
    const executed = [];
    const directive = directiveFor({ iterable: "attachments", assignOutputTo: "attachment", goToIntent: "#body" });

    // First email: the loop starts and its branch never leads back.
    parameters.attachments = [{ filename: "old-1.pdf" }, { filename: "old-2.pdf" }];
    await run(newIteration(tdcache, parameters, executed), directive);

    // Second email in the same conversation: a new list reaches the block.
    parameters.attachments = [{ filename: "new.pdf" }];
    const stop = await run(newIteration(tdcache, parameters, executed), directive);
    assert.strictEqual(stop, true);
    assert.deepStrictEqual(parameters.attachment, { filename: "new.pdf" });
  });

});
