var assert = require('assert');
const winston = require('../utils/winston');
const { DirRemoveCurrentBot } = require('../tiledeskChatbotPlugs/directives/DirRemoveCurrentBot');

describe('DirRemoveCurrentBot directive', function () {
  const TOKEN = 'JWT secret-token-123';
  const levels = ['error', 'warn', 'info', 'verbose', 'debug'];
  let originals, logs;

  beforeEach(() => {
    logs = [];
    originals = {};
    levels.forEach((l) => {
      originals[l] = winston[l];
      winston[l] = (...args) => { logs.push(args.map((a) => { try { return typeof a === 'string' ? a : JSON.stringify(a); } catch (e) { return String(a); } }).join(' ')); };
    });
  });
  afterEach(() => { levels.forEach((l) => { winston[l] = originals[l]; }); });

  function build(request, opts) {
    opts = opts || {};
    const calls = { get: 0, del: [], patch: [] };
    const dir = new DirRemoveCurrentBot({ projectId: 'p', token: TOKEN, requestId: 'support-group-p-abc', API_ENDPOINT: 'http://localhost:1' });
    dir.tdClient.getRequestById = (id, cb) => { calls.get++; cb(opts.getErr || null, request); };
    dir.tdClient.deleteRequestParticipant = (id, pid, cb) => {
      calls.del.push([id, pid]);
      cb(opts.delErr || null);
    };
    dir.tdClient.updateRequestProperties = (id, props, cb) => { calls.patch.push([id, props]); cb(opts.patchErr || null); };
    return { dir, calls };
  }
  function run(dir, directive, check) {
    let n = 0;
    dir.execute(directive, () => {
      n++;
      setTimeout(() => { try { assert.strictEqual(n, 1, 'callback must run exactly once'); check(); } catch (e) { check.done(e); } }, 20);
    });
  }
  function t(name, request, opts, directive, assertions) {
    it(name, (done) => {
      const { dir, calls } = build(request, opts);
      const check = () => { assertions(calls); done(); };
      check.done = done;
      run(dir, directive, check);
    });
  }
  const act = { action: {} };

  t('bot plus human: deletes bot, no status patch',
    { participants: ['bot_b1', 'u1'], participantsBots: ['b1'] }, null, act,
    (c) => { assert.deepStrictEqual(c.del, [['support-group-p-abc', 'bot_b1']]); assert.strictEqual(c.patch.length, 0); });

  t('bot plus another bot: no status patch',
    { participants: ['bot_b1', 'bot_b2'], participantsBots: ['b1', 'b2'] }, null, act,
    (c) => { assert.strictEqual(c.del.length, 1); assert.strictEqual(c.patch.length, 0); });

  t('bot only: deletes bot and patches status 50',
    { participants: ['bot_b1'], participantsBots: ['b1'] }, null, act,
    (c) => { assert.strictEqual(c.del.length, 1); assert.deepStrictEqual(c.patch, [['support-group-p-abc', { status: 50 }]]); });

  t('inline text directive (parameter) behaves the same',
    { participants: ['bot_b1', 'u1'], participantsBots: ['b1'] }, null, { parameter: 'x' },
    (c) => { assert.strictEqual(c.del.length, 1); assert.strictEqual(c.patch.length, 0); });

  t('no bots: no calls besides get, callback once',
    { participants: ['u1'], participantsBots: [] }, null, act,
    (c) => { assert.strictEqual(c.del.length, 0); assert.strictEqual(c.patch.length, 0); });

  t('getRequestById error: callback once, nothing else',
    null, { getErr: new Error('boom') }, act,
    (c) => { assert.strictEqual(c.del.length, 0); assert.strictEqual(c.patch.length, 0); });

  t('DELETE error: callback once, no patch, no token in logs',
    { participants: ['bot_b1'], participantsBots: ['b1'] },
    { delErr: Object.assign(new Error('Request failed with status code 500'), { config: { headers: { Authorization: TOKEN } }, response: { status: 500, data: { success: false } } }) }, act,
    (c) => {
      assert.strictEqual(c.patch.length, 0);
      assert.ok(logs.length > 0, 'error should be logged');
      assert.ok(!logs.join('\n').includes('secret-token-123'), 'token leaked in logs');
    });

  t('PATCH error: callback once',
    { participants: ['bot_b1'], participantsBots: ['b1'] }, { patchErr: new Error('x') }, act,
    (c) => { assert.strictEqual(c.patch.length, 1); });

  t('invalid directive: callback once, no calls',
    { participants: ['bot_b1'], participantsBots: ['b1'] }, null, {},
    (c) => { assert.strictEqual(c.get, 0); assert.strictEqual(c.del.length, 0); });
});
