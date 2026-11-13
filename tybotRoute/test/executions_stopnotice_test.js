'use strict';

const assert = require('assert');
const StopNotice = require('../executions/StopNotice');

/** A Redis stand-in for the two calls notify makes. */
function fakeClient({ policy = {}, failPolicy = false } = {}) {
  const keys = new Map();
  return {
    keys,
    hmGet: async (key, fields) => {
      if (failPolicy) throw new Error('down');
      return fields.map((f) => (policy[f] === undefined ? null : policy[f]));
    },
    set: async (key, value, opts) => {
      if (opts && opts.NX && keys.has(key)) return null;
      keys.set(key, value);
      return 'OK';
    }
  };
}

describe('executions: StopNotice', function () {
  beforeEach(() => StopNotice._clearCacheForTests());

  const run = (client, message = {}, idProject = 'p1') => {
    const sent = [];
    return StopNotice.notify({ client, idProject, executionId: 'e1', message, send: async (t) => { sent.push(t); } })
      .then((r) => ({ r, sent }));
  };

  it('default: on, the default text by the conversation language, once per stop', async function () {
    const c = fakeClient();
    assert.deepStrictEqual(await run(c, { request: { language: 'it-IT' } }), { r: 'sent', sent: [StopNotice.DEFAULTS.it] });
    assert.deepStrictEqual(await run(c, { request: { language: 'it-IT' } }), { r: 'already', sent: [] });
    assert.strictEqual(c.keys.get('exec:e1:notice'), '1');
  });
  it('unknown or other languages fall back to English; the user language attribute counts too', async function () {
    assert.strictEqual(StopNotice.textFor(null, 'fr'), StopNotice.DEFAULTS.en);
    assert.strictEqual(StopNotice.textFor(null, null), StopNotice.DEFAULTS.en);
    assert.strictEqual(StopNotice.languageOf({ attributes: { userLang: 'IT' } }), 'it');
  });
  it('the project text wins over the default; blank means default', async function () {
    assert.deepStrictEqual((await run(fakeClient({ policy: { stop_notice_text: ' Torno subito ' } }))).sent, ['Torno subito']);
    StopNotice._clearCacheForTests();
    assert.deepStrictEqual((await run(fakeClient({ policy: { stop_notice_text: '' } }), {}, 'p2')).sent, [StopNotice.DEFAULTS.en]);
  });
  it('turned off: nothing sent, no marker', async function () {
    const c = fakeClient({ policy: { stop_notice: 'false' } });
    assert.deepStrictEqual(await run(c), { r: 'off', sent: [] });
    assert.strictEqual(c.keys.size, 0);
  });
  it('a policy read error: still on, default text', async function () {
    assert.deepStrictEqual(await run(fakeClient({ failPolicy: true })), { r: 'sent', sent: [StopNotice.DEFAULTS.en] });
  });
  it('a send error resolves failed and never throws', async function () {
    const r = await StopNotice.notify({ client: fakeClient(), idProject: 'p1', executionId: 'e2', message: {}, send: async () => { throw new Error('api down'); } });
    assert.strictEqual(r, 'failed');
  });
  it('the notice is a plain text message, marked', function () {
    assert.deepStrictEqual(StopNotice.noticeMessage('x'), { text: 'x', type: 'text', attributes: { execution_notice: 'stopped' } });
  });
});
