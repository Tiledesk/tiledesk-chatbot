'use strict';

const assert = require('assert');
const { mapOutcome } = require('../executions/OutcomeMapper');

describe('executions: OutcomeMapper', function () {
  const web = { _tdActionType: 'webrequestv2', trueIntent: '#t1', falseIntent: '#f1' };

  it('false exit -> failure_condition / false', function () {
    assert.deepStrictEqual(mapOutcome({ action: web, jumpedTo: '/#f1', error: null }), { outcome: 'failure_condition', exit_taken: 'false' });
  });
  it('true exit -> success / true', function () {
    assert.deepStrictEqual(mapOutcome({ action: web, jumpedTo: '/#t1', error: null }), { outcome: 'success', exit_taken: 'true' });
  });
  it('noMatchIntent -> failure_condition', function () {
    const r = mapOutcome({ action: { noMatchIntent: '#n' }, jumpedTo: '/#n', error: null });
    assert.deepStrictEqual(r, { outcome: 'failure_condition', exit_taken: 'noMatch' });
  });
  it('fallbackIntent -> success', function () {
    const r = mapOutcome({ action: { fallbackIntent: '#fb' }, jumpedTo: '/#fb', error: null });
    assert.deepStrictEqual(r, { outcome: 'success', exit_taken: 'fallback' });
  });
  it('matches ignoring JSON params suffix', function () {
    const r = mapOutcome({ action: { falseIntent: '#abc' }, jumpedTo: '/#abc{"x":1}', error: null });
    assert.deepStrictEqual(r, { outcome: 'failure_condition', exit_taken: 'false' });
  });
  it('no jump -> success / null', function () {
    assert.deepStrictEqual(mapOutcome({ action: web, jumpedTo: null, error: null }), { outcome: 'success', exit_taken: null });
  });
  it('error wins', function () {
    assert.deepStrictEqual(mapOutcome({ action: web, jumpedTo: '/#f1', error: new Error('x') }), { outcome: 'error', exit_taken: null });
  });
  it('unmatched jump -> success / jump', function () {
    assert.deepStrictEqual(mapOutcome({ action: web, jumpedTo: '/other', error: null }), { outcome: 'success', exit_taken: 'jump' });
  });
  it('no signal, a failure and a success exit on the same target -> success / ambiguous (never failure_condition)', function () {
    const r = mapOutcome({ action: { trueIntent: '#a', falseIntent: '#a' }, jumpedTo: '/#a', error: null });
    assert.deepStrictEqual(r, { outcome: 'success', exit_taken: 'ambiguous' });
    const r2 = mapOutcome({ action: { errorIntent: '#a', fallbackIntent: '#a{"x":1}' }, jumpedTo: '/#a', error: null });
    assert.deepStrictEqual(r2, { outcome: 'success', exit_taken: 'ambiguous' });
  });

  describe('pure conditions: false is a normal outcome (success / false)', function () {
    for (const type of ['condition', 'jsoncondition', 'jsoncondition2', 'ifonlineagents', 'ifonlineagentsv2', 'ifopenhours']) {
      it(`${type}: false with the same target and with a different target -> success / false`, function () {
        const same = { trueIntent: '#a', falseIntent: '#a' };
        assert.deepStrictEqual(mapOutcome({ action: same, jumpedTo: '/#a', exit: 'falseIntent', type }), { outcome: 'success', exit_taken: 'false' });
        const diff = { trueIntent: '#t', falseIntent: '#f' };
        assert.deepStrictEqual(mapOutcome({ action: diff, jumpedTo: '/#f', exit: 'falseIntent', type }), { outcome: 'success', exit_taken: 'false' });
        assert.deepStrictEqual(mapOutcome({ action: diff, jumpedTo: '/#f', type }), { outcome: 'success', exit_taken: 'false' }, 'no signal');
        assert.deepStrictEqual(mapOutcome({ action: diff, jumpedTo: null, exit: 'falseIntent', type }), { outcome: 'success', exit_taken: 'false' }, 'no block connected');
      });
    }
    it('the type falls back to action._tdActionType, case-insensitively', function () {
      const r = mapOutcome({ action: { _tdActionType: 'JSONCondition', falseIntent: '#f' }, jumpedTo: '/#f' });
      assert.deepStrictEqual(r, { outcome: 'success', exit_taken: 'false' });
    });
    it('webrequestv2 false is still failure_condition (signal, no signal, same target)', function () {
      const type = 'webrequestv2';
      assert.deepStrictEqual(mapOutcome({ action: web, jumpedTo: '/#f1', exit: 'falseIntent', type }), { outcome: 'failure_condition', exit_taken: 'false' });
      assert.deepStrictEqual(mapOutcome({ action: web, jumpedTo: '/#f1', type }), { outcome: 'failure_condition', exit_taken: 'false' });
      assert.deepStrictEqual(mapOutcome({ action: { trueIntent: '#a', falseIntent: '#a' }, jumpedTo: '/#a', exit: 'falseIntent', type }), { outcome: 'failure_condition', exit_taken: 'false' });
    });
    it('other failure exits stay failures on a condition type', function () {
      assert.deepStrictEqual(mapOutcome({ action: { errorIntent: '#e' }, jumpedTo: '/#e', exit: 'errorIntent', type: 'condition' }), { outcome: 'failure_condition', exit_taken: 'error' });
    });
  });

  describe('the exit the directive noted (WriteTap.noteExit)', function () {
    const same = { _tdActionType: 'webrequestv2', trueIntent: '#same', falseIntent: '#same' };
    it('same-target exits, true result -> success / true', function () {
      assert.deepStrictEqual(mapOutcome({ action: same, jumpedTo: '/#same', exit: 'trueIntent' }), { outcome: 'success', exit_taken: 'true' });
    });
    it('same-target exits, false result -> failure_condition / false', function () {
      assert.deepStrictEqual(mapOutcome({ action: same, jumpedTo: '/#same', exit: 'falseIntent' }), { outcome: 'failure_condition', exit_taken: 'false' });
    });
    it('different targets: the signal agrees with target matching', function () {
      assert.deepStrictEqual(mapOutcome({ action: web, jumpedTo: '/#t1', exit: 'trueIntent' }), { outcome: 'success', exit_taken: 'true' });
      assert.deepStrictEqual(mapOutcome({ action: web, jumpedTo: '/#f1', exit: 'falseIntent' }), { outcome: 'failure_condition', exit_taken: 'false' });
    });
    it('the signal stands without a jump (no block connected to the exit taken)', function () {
      assert.deepStrictEqual(mapOutcome({ action: { trueIntent: '#t' }, jumpedTo: null, exit: 'falseIntent' }), { outcome: 'failure_condition', exit_taken: 'false' });
    });
    it('other exits: noMatch fails, fallback / jump succeed', function () {
      assert.deepStrictEqual(mapOutcome({ action: { noMatchIntent: '#a' }, jumpedTo: '/#a', exit: 'noMatchIntent' }), { outcome: 'failure_condition', exit_taken: 'noMatch' });
      assert.deepStrictEqual(mapOutcome({ action: { errorIntent: '#a', fallbackIntent: '#a' }, jumpedTo: '/#a', exit: 'fallbackIntent' }), { outcome: 'success', exit_taken: 'fallback' });
      assert.deepStrictEqual(mapOutcome({ action: { noMatchIntent: '#a' }, jumpedTo: '/#a', exit: 'jump' }), { outcome: 'success', exit_taken: 'jump' });
    });
    it('an error still wins over the signal', function () {
      assert.deepStrictEqual(mapOutcome({ action: same, jumpedTo: '/#same', exit: 'trueIntent', error: new Error('x') }), { outcome: 'error', exit_taken: null });
    });
    it('a non-string signal is ignored (target matching)', function () {
      assert.deepStrictEqual(mapOutcome({ action: web, jumpedTo: '/#f1', exit: 5 }), { outcome: 'failure_condition', exit_taken: 'false' });
    });
  });
  it('first field in order wins within the same kind', function () {
    const r = mapOutcome({ action: { noInputIntent: '#a', falseIntent: '#a' }, jumpedTo: '#a', error: null });
    assert.strictEqual(r.exit_taken, 'false');
  });
  it('ignores empty exits, null action, never throws', function () {
    assert.deepStrictEqual(mapOutcome({ action: { falseIntent: '' }, jumpedTo: '', error: null }), { outcome: 'success', exit_taken: null });
    assert.deepStrictEqual(mapOutcome({ action: null, jumpedTo: '/x', error: null }), { outcome: 'success', exit_taken: 'jump' });
    assert.deepStrictEqual(mapOutcome({ action: { falseIntent: 5 }, jumpedTo: '/x', error: null }), { outcome: 'success', exit_taken: 'jump' });
    assert.deepStrictEqual(mapOutcome(undefined), { outcome: 'success', exit_taken: null });
  });
});
