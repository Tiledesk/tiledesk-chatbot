const assert = require('assert');
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');

// Filters on reply messages (`_tdJSONCondition`), as the design studio saves them.
// A filter edited in the current design studio carries `version: 2` and `when`, the formula
// that evaluateMessageFilter reads; an older one has only the `conditions` tree. The formulas
// below are the ones the design studio writes for each operator of the condition menu.

const condition = (operator, value) => ({
  type: 'condition', operand1: 'x', operator, operand2: { type: 'const', value: value == null ? '' : value }
});
const v2Filter = (when, operator, value) => ({
  type: 'expression', version: 2, conditions: [condition(operator, value)], when
});
const evaluate = (filter, variables) => TiledeskChatbotUtil.evaluateMessageFilter(filter, variables);

// [operator, value, formula written by the design studio, variables => true, variables => false]
const OPERATORS = [
  ['exists',                   null,          'exists(x)',                     { x: 'a' },             { x: null }],
  ['doesNotExist',             null,          '!exists(x)',                    {},                     { x: 'a' }],
  ['isEmpty',                  null,          'isEmpty(x)',                    { x: '' },              { x: 'a' }],
  ['isNotEmpty',               null,          '!isEmpty(x)',                   { x: 'a' },             { x: '' }],
  ['isNull',                   null,          'isNull(x)',                     { x: null },            { x: 'a' }],
  ['isUndefined',              null,          'isUndefined(x)',                {},                     { x: 'a' }],
  ['equalAsStrings',           'abc',         'x == "abc"',                    { x: 'abc' },           { x: 'abd' }],
  ['notEqualAsStrings',        'abc',         'x != "abc"',                    { x: 'abd' },           { x: 'abc' }],
  ['contains',                 'lo w',        'contains(x, "lo w")',           { x: 'hello world' },   { x: 'zz' }],
  ['notContains',              'zz',          '!contains(x, "zz")',            { x: 'hello' },         { x: 'zz top' }],
  ['startsWith',               'he',          'startsWith(x, "he")',           { x: 'hello' },         { x: 'oh' }],
  ['notStartsWith',            'he',          '!startsWith(x, "he")',          { x: 'oh' },            { x: 'hello' }],
  ['endsWith',                 'lo',          'endsWith(x, "lo")',             { x: 'hello' },         { x: 'lox' }],
  ['notEndsWith',              'lo',          '!endsWith(x, "lo")',            { x: 'lox' },           { x: 'hello' }],
  ['matches',                  '^\\d+$',      'matches(x, "^\\\\d+$")',        { x: '123' },           { x: '12a' }],
  ['notMatches',               '^\\d+$',      '!matches(x, "^\\\\d+$")',       { x: '12a' },           { x: '123' }],
  ['equalAsNumbers',           '10',          'x == 10',                       { x: '10' },            { x: '11' }],
  ['notEqualAsNumbers',        '10',          'x != 10',                       { x: '11' },            { x: '10' }],
  ['greaterThan',              '9',           'x > 9',                         { x: '10' },            { x: '8' }],
  ['greaterThanOrEqual',       '10',          'x >= 10',                       { x: '10' },            { x: '9' }],
  ['lessThan',                 '10',          'x < 10',                        { x: '9' },             { x: '11' }],
  ['lessThanOrEqual',          '10',          'x <= 10',                       { x: '10' },            { x: '11' }],
  ['isTrue',                   null,          'x == true',                     { x: true },            { x: false }],
  ['isFalse',                  null,          'x == false',                    { x: false },           { x: true }],
  ['equalAsDate',              '2026-01-01',  'dateEqual(x, "2026-01-01")',    { x: '2026-01-01' },    { x: '2026-01-02' }],
  ['notEqualAsDate',           '2026-01-01',  '!dateEqual(x, "2026-01-01")',   { x: '2026-01-02' },    { x: '2026-01-01' }],
  ['isAfter',                  '2026-01-01',  'isAfter(x, "2026-01-01")',      { x: '2026-02-01' },    { x: '2025-12-01' }],
  ['isBefore',                 '2026-01-01',  'isBefore(x, "2026-01-01")',     { x: '2025-12-01' },    { x: '2026-02-01' }],
  ['isAfterOrEqual',           '2026-01-01',  'isAfterOrEqual(x, "2026-01-01")',  { x: '2026-01-01' }, { x: '2025-12-01' }],
  ['isBeforeOrEqual',          '2026-01-01',  'isBeforeOrEqual(x, "2026-01-01")', { x: '2026-01-01' }, { x: '2026-02-01' }],
  ['arrayContains',            'a',           'arrayContains(x, "a")',         { x: ['a', 'b'] },      { x: ['c'] }],
  ['arrayNotContains',         'a',           '!arrayContains(x, "a")',        { x: ['c'] },           { x: ['a'] }],
  ['lengthEqualTo',            '2',           'length(x) == 2',                { x: ['a', 'b'] },      { x: ['a'] }],
  ['lengthNotEqualTo',         '2',           'length(x) != 2',                { x: ['a'] },           { x: ['a', 'b'] }],
  ['lengthGreaterThan',        '1',           'length(x) > 1',                 { x: ['a', 'b'] },      { x: ['a'] }],
  ['lengthLessThan',           '2',           'length(x) < 2',                 { x: ['a'] },           { x: ['a', 'b'] }],
  ['lengthGreaterThanOrEqual', '2',           'length(x) >= 2',                { x: ['a', 'b'] },      { x: ['a'] }],
  ['lengthLessThanOrEqual',    '1',           'length(x) <= 1',                { x: ['a'] },           { x: ['a', 'b'] }],
];

describe('Reply filters (_tdJSONCondition)', () => {

  describe('every operator of the condition menu, in the `when` form', () => {
    for (const [operator, value, when, varsTrue, varsFalse] of OPERATORS) {
      it(`${operator}: ${when}`, () => {
        const filter = v2Filter(when, operator, value);
        assert.strictEqual(evaluate(filter, varsTrue), true);
        assert.strictEqual(evaluate(filter, varsFalse), false);
      });
    }
  });

  describe('existence', () => {
    it('a variable set to null does not exist', () => {
      assert.strictEqual(evaluate(v2Filter('exists(x)', 'exists'), { x: null }), false);
      assert.strictEqual(evaluate(v2Filter('!exists(x)', 'doesNotExist'), { x: null }), true);
    });
    it('the form written before `exists` keeps its meaning: null is defined', () => {
      assert.strictEqual(evaluate(v2Filter('!isUndefined(x)', 'exists'), { x: null }), true);
    });
  });

  describe('ignore uppercase and lowercase', () => {
    it('both sides lowered by the design studio', () => {
      const filter = v2Filter('contains(lowerCase(x), lowerCase("mario"))', 'contains', 'mario');
      assert.strictEqual(evaluate(filter, { x: 'MARIO ROSSI' }), true);
      assert.strictEqual(evaluate(filter, { x: 'LUIGI' }), false);
    });
  });

  describe('filters saved before `when`', () => {
    it('are still evaluated on the conditions tree', () => {
      const legacy = { type: 'expression', conditions: [condition('equalAsStrings', 'a')] };
      assert.strictEqual(evaluate(legacy, { x: 'a' }), true);
      assert.strictEqual(evaluate(legacy, { x: 'b' }), false);
    });
    it('`when` wins over the tree when both are there', () => {
      const filter = v2Filter('x == "b"', 'equalAsStrings', 'a');
      assert.strictEqual(evaluate(filter, { x: 'b' }), true);
    });
  });

  describe('a filter that cannot be evaluated', () => {
    it('does not hide its message', () => {
      const unknownOperator = { type: 'expression', conditions: [condition('notContains', 'zz')] };
      assert.notStrictEqual(evaluate(unknownOperator, { x: 'a' }), false);
      assert.notStrictEqual(evaluate(v2Filter('unknownFunction(x)', 'contains', 'a'), { x: 'a' }), false);
    });
  });

  describe('filterOnVariables', () => {
    const reply = () => ({
      attributes: {
        commands: [
          { type: 'message', message: { type: 'text', text: 'shown', _tdJSONCondition: v2Filter('exists(x)', 'exists') } },
          { type: 'wait', time: 500 },
          { type: 'message', message: { type: 'text', text: 'hidden', _tdJSONCondition: v2Filter('!exists(x)', 'doesNotExist') } },
          { type: 'wait', time: 500 },
          { type: 'message', message: { type: 'text', text: 'broken filter', _tdJSONCondition: { type: 'expression', conditions: [condition('isTrue')] } } },
          { type: 'wait', time: 500 },
          { type: 'message', message: { type: 'text', text: 'no filter' } },
        ]
      }
    });

    it('drops the messages whose filter is false, with the wait before them, and keeps the rest', () => {
      const message = reply();
      TiledeskChatbotUtil.filterOnVariables(message, { x: 'a' });
      const texts = message.attributes.commands.filter(c => c.type === 'message').map(c => c.message.text);
      assert.deepStrictEqual(texts, ['shown', 'broken filter', 'no filter']);
      assert.strictEqual(message.attributes.commands.length, 5);
      assert.strictEqual(message.text, 'shown\n\nbroken filter\n\nno filter');
    });
  });
});
