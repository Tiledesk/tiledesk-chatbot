var assert = require('assert');
const { DirRemoveHuman } = require('../tiledeskChatbotPlugs/directives/DirRemoveHuman');

describe('DirRemoveHuman.normalizeScope', function () {
  it('defaults to invited and accepts only all_humans', () => {
    assert.strictEqual(DirRemoveHuman.normalizeScope(undefined), 'invited');
    assert.strictEqual(DirRemoveHuman.normalizeScope('all_humans'), 'all_humans');
    assert.strictEqual(DirRemoveHuman.normalizeScope('ALL'), 'invited');
  });
});

describe('DirRemoveHuman directive', function () {

  function buildDirective(overrides) {
    const params = {};
    const jumps = [];
    const logs = [];
    const dir = new DirRemoveHuman(Object.assign({
      projectId: 'p',
      token: 't',
      requestId: 'support-group-p-abc',
      API_ENDPOINT: 'http://localhost:1',
      chatbot: { addParameter: async (k, v) => { params[k] = v; } }
    }, overrides));
    const log = (m) => logs.push(String(m));
    dir.logger = { error: log, warn: log, native: log };
    dir.intentDir = { execute: (d, cb) => { jumps.push(d); cb(); } };
    return { dir, params, jumps, logs };
  }

  it('sets the variables and jumps to trueIntent on success', (done) => {
    const { dir, params, jumps } = buildDirective();
    dir.remove = async (body) => {
      assert.deepStrictEqual(body, { scope: 'all_humans' });
      return { removed: [{ id_user: 'u1', fullname: 'A' }] };
    };
    dir.execute({ action: { scope: 'all_humans', trueIntent: '#removed-id', falseIntent: '#rmerror-id' } }, (stop) => {
      try {
        assert.strictEqual(stop, true);
        assert.strictEqual(params.removed_humans_count, 1);
        assert.deepStrictEqual(params.removed_humans, [{ id_user: 'u1', fullname: 'A' }]);
        assert.strictEqual(jumps.length, 1);
        assert.strictEqual(jumps[0].action.intentName.startsWith('#removed-id'), true);
        done();
      } catch (err) { done(err); }
    });
  });

  it('sends errors to falseIntent without logging secrets', (done) => {
    const { dir, params, jumps, logs } = buildDirective();
    dir.remove = () => Promise.reject({
      message: 'x',
      config: { headers: { Authorization: 'JWT SECRET' } },
      response: { status: 422, data: { error: 'Remove human requires a conversation started by a webhook' } }
    });
    dir.execute({ action: { trueIntent: '#yes', falseIntent: '#no' } }, (stop) => {
      try {
        assert.strictEqual(stop, true);
        assert.strictEqual(jumps[0].action.intentName.startsWith('#no'), true);
        assert.strictEqual(params.flowError, '(Remove human) An error occurred: Remove human requires a conversation started by a webhook');
        assert.strictEqual(logs.join('\n').includes('SECRET'), false);
        done();
      } catch (err) { done(err); }
    });
  });

  it('does not call the server for automation runs', (done) => {
    const { dir, params, jumps } = buildDirective({ requestId: 'automation-request-p-abc' });
    dir.remove = async () => { assert.fail('remove must not be called'); };
    dir.execute({ action: { trueIntent: '#yes', falseIntent: '#no' } }, (stop) => {
      try {
        assert.strictEqual(stop, true);
        assert.strictEqual(params.flowError, '(Remove human) requires a conversation');
        assert.strictEqual(jumps.length, 1);
        done();
      } catch (err) { done(err); }
    });
  });

  it('calls back once with undefined when no branches are configured', (done) => {
    const { dir, jumps } = buildDirective();
    dir.remove = async () => ({ removed: [{ id_user: 'u1' }] });
    let calls = 0;
    let arg = 'unset';
    dir.execute({ action: {} }, (stop) => { calls++; arg = stop; });
    setTimeout(() => {
      try {
        assert.strictEqual(calls, 1);
        assert.strictEqual(arg, undefined);
        assert.strictEqual(jumps.length, 0);
        done();
      } catch (err) { done(err); }
    }, 20);
  });

  it('with only trueIntent, an error continues the block (callback without true)', (done) => {
    const { dir, params } = buildDirective();
    dir.remove = () => Promise.reject(new Error('boom'));
    dir.execute({ action: { trueIntent: '#yes' } }, (stop) => {
      try {
        assert.strictEqual(stop, undefined);
        assert.strictEqual(params.flowError, '(Remove human) An error occurred: boom');
        done();
      } catch (err) { done(err); }
    });
  });
});
