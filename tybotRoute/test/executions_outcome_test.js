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
  it('failure exit wins when one value matches several fields', function () {
    const r = mapOutcome({ action: { trueIntent: '#a', falseIntent: '#a' }, jumpedTo: '/#a', error: null });
    assert.deepStrictEqual(r, { outcome: 'failure_condition', exit_taken: 'false' });
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
