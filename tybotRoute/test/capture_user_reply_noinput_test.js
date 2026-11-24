var assert = require('assert');
const { DirCaptureUserReply } = require('../tiledeskChatbotPlugs/directives/DirCaptureUserReply');
const { TiledeskChatbotConst } = require('../engine/TiledeskChatbotConst');
const { ConnectorsV3, OUTPUT_CATALOG } = require('../utils/ConnectorsV3');

/**
 * Capture user reply: No input, as in the Advanced reply (DirReplyV2). Design Studio 3.3.2 saves
 * noInputIntent and noInputTimeout (ms) on the action; when the capture starts waiting and the user
 * does not reply in time, the flow goes to noInputIntent.
 */
describe('DirCaptureUserReply - No input', function () {

  const USER_INPUT = TiledeskChatbotConst.USER_INPUT;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** A chatbot that keeps the lock and the request parameters in memory. */
  const makeChatbot = () => {
    const params = {};
    const calls = [];
    let lockedAction = null;
    return {
      params, calls,
      setLocked: (id) => { lockedAction = id; },
      currentLockedAction: async () => lockedAction,
      lockIntent: async () => { calls.push('lockIntent'); },
      lockAction: async (requestId, actionId) => { lockedAction = actionId; calls.push('lockAction'); },
      unlockIntent: async () => { calls.push('unlockIntent'); },
      unlockAction: async () => { lockedAction = null; calls.push('unlockAction'); },
      addParameter: async (key, value) => { params[key] = value; },
      getParameter: async (key) => params[key],
    };
  };

  /** The directive, with its jumps recorded instead of posted. */
  const makeDir = (chatbot, text = 'hello') => {
    const dir = new DirCaptureUserReply({
      reply: { intent_id: 'block1' }, message: { text }, chatbot, requestId: 'req1', context: {}
    });
    const jumps = [];
    dir.intentDir = { execute: (directive, cb) => { jumps.push(directive.action.intentName); if (cb) cb(); } };
    return { dir, jumps };
  };

  const go = (dir, action) => new Promise((resolve) => dir.go(action, (stop) => resolve(stop)));

  it('no reply in time: unlocks and goes to noInputIntent', async () => {
    const chatbot = makeChatbot();
    const { dir, jumps } = makeDir(chatbot);
    const stop = await go(dir, { _tdActionId: 'a1', noInputIntent: '#noinput', noInputTimeout: 30 });
    assert.strictEqual(stop, true); // the block stops: waiting for the reply
    assert.ok(chatbot.params[USER_INPUT], 'the control variable is set while waiting');
    assert.deepStrictEqual(jumps, []);
    await wait(80);
    assert.deepStrictEqual(jumps, ['#noinput']);
    assert.deepStrictEqual(chatbot.calls, ['lockIntent', 'lockAction', 'unlockIntent', 'unlockAction']);
  });

  it('the user replies in time (USER_INPUT deleted by the message): no jump', async () => {
    const chatbot = makeChatbot();
    const { dir, jumps } = makeDir(chatbot);
    await go(dir, { _tdActionId: 'a1', noInputIntent: '#noinput', noInputTimeout: 30 });
    delete chatbot.params[USER_INPUT]; // what TiledeskChatbotUtil does on every user message
    await wait(80);
    assert.deepStrictEqual(jumps, []);
    assert.ok(!chatbot.calls.includes('unlockIntent'));
  });

  it('another action holds the lock when the timer fires: no jump', async () => {
    const chatbot = makeChatbot();
    const { dir, jumps } = makeDir(chatbot);
    await go(dir, { _tdActionId: 'a1', noInputIntent: '#noinput', noInputTimeout: 30 });
    chatbot.setLocked('another');
    await wait(80);
    assert.deepStrictEqual(jumps, []);
  });

  it('a newer wait replaced the control variable: the old timer does nothing', async () => {
    const chatbot = makeChatbot();
    const { dir, jumps } = makeDir(chatbot);
    await go(dir, { _tdActionId: 'a1', noInputIntent: '#noinput', noInputTimeout: 30 });
    chatbot.params[USER_INPUT] = 'a-newer-timer';
    await wait(80);
    assert.deepStrictEqual(jumps, []);
  });

  it('without noInputIntent, or with a timeout out of range, no timer at all', async () => {
    for (const action of [
      { _tdActionId: 'a1', noInputTimeout: 30 },
      { _tdActionId: 'a1', noInputIntent: '#noinput' },
      { _tdActionId: 'a1', noInputIntent: '#noinput', noInputTimeout: 0 },
      { _tdActionId: 'a1', noInputIntent: '#noinput', noInputTimeout: 7776000 },
    ]) {
      const chatbot = makeChatbot();
      const { dir, jumps } = makeDir(chatbot);
      const stop = await go(dir, action);
      assert.strictEqual(stop, true);
      assert.strictEqual(chatbot.params[USER_INPUT], undefined, JSON.stringify(action));
      await wait(50);
      assert.deepStrictEqual(jumps, [], JSON.stringify(action));
    }
  });

  it('the reply (second execution, own lock): saved and the flow goes on, as before', async () => {
    const chatbot = makeChatbot();
    chatbot.setLocked('a1');
    const { dir, jumps } = makeDir(chatbot, 'my answer');
    const stop = await go(dir, { _tdActionId: 'a1', noInputIntent: '#noinput', noInputTimeout: 30 });
    assert.strictEqual(stop, undefined); // continue the flow
    assert.deepStrictEqual(chatbot.calls, ['unlockIntent', 'unlockAction']);
    assert.strictEqual(chatbot.params[USER_INPUT], undefined); // no new timer
    await wait(50);
    assert.deepStrictEqual(jumps, []);
  });
});

describe('ConnectorsV3 - capture_user_reply No input', function () {

  const START = 'start-id', A = 'a-id', B = 'b-id';
  const record = (id) => {
    const parts = id.split('/');
    return { id, from: { intentId: parts[0], actionId: parts[1], slot: 'x' }, to: { intentId: parts[parts.length - 1] }, kind: 'action' };
  };
  const botV3 = (items) => ({ _id: 'bot', ds_version: 'v3', connectors: { version: 1, updatedAt: '2026-11-19T00:00:00.000Z', items } });

  it('is in the catalogue: goToIntent and /noInput', () => {
    assert.deepStrictEqual(OUTPUT_CATALOG['capture_user_reply'].map((o) => o.suffix + ':' + o.field), [':goToIntent', '/noInput:noInputIntent']);
  });

  it('V3: noInputIntent is filled from the list (the field is empty on the server)', () => {
    const intent = { intent_id: START, actions: [{ _tdActionId: 'c', _tdActionType: 'capture_user_reply', assignResultTo: 'x', noInputTimeout: 10000 }] };
    ConnectorsV3.projectIntent(botV3([record(START + '/c/' + A), record(START + '/c/noInput/' + B)]), intent);
    assert.strictEqual(intent.actions[0].goToIntent, '#' + A);
    assert.strictEqual(intent.actions[0].noInputIntent, '#' + B);
  });

  it('V3: without a No input record the field stays as it is', () => {
    const intent = { intent_id: START, actions: [{ _tdActionId: 'c', _tdActionType: 'capture_user_reply', noInputIntent: '' }] };
    ConnectorsV3.projectIntent(botV3([record(START + '/c/' + A)]), intent);
    assert.strictEqual(intent.actions[0].noInputIntent, '');
  });
});
