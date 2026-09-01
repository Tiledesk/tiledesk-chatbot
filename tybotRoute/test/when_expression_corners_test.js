'use strict';

// TiledeskWhenExpression: the corners of the tokenizer, the parser and the
// evaluator that the `when` expressions written by bot authors reach but the
// happy-path file (when_expression_test.js) does not.
//
// This is a pure function -- an expression string and a variables object in, a
// value out -- so every test below asserts the VALUE, or the syntax error
// raised, for an expression a bot author can actually type.

const assert = require('assert');
const { TiledeskWhenExpression, WhenSyntaxError } = require('../expressions/TiledeskWhenExpression');

const evalIt = (expr, vars) => new TiledeskWhenExpression().evaluate(expr, vars);

describe('TiledeskWhenExpression, the corners', function () {

  describe('string literals and their escapes', function () {

    it('understands \\n, \\t and \\r inside a double-quoted literal', function () {
      assert.strictEqual(evalIt('"a\\nb"'), "a\nb");
      assert.strictEqual(evalIt('"a\\tb"'), "a\tb");
      assert.strictEqual(evalIt('"a\\rb"'), "a\rb");
    });

    it('understands an escaped backslash', function () {
      assert.strictEqual(evalIt('"a\\\\b"'), "a\\b");
    });

    it('understands an escaped quote of either kind', function () {
      assert.strictEqual(evalIt('"a\\"b"'), 'a"b');
      assert.strictEqual(evalIt("'a\\'b'"), "a'b");
      assert.strictEqual(evalIt('"a\\\'b"'), "a'b");
      assert.strictEqual(evalIt("'a\\\"b'"), 'a"b');
    });

    it('keeps an unknown escape as the character itself', function () {
      assert.strictEqual(evalIt('"a\\qb"'), "aqb",
        'an escape the tokenizer does not know must not swallow the character');
    });

    it('compares an escaped literal against a variable', function () {
      assert.strictEqual(evalIt('note == "line1\\nline2"', { note: "line1\nline2" }), true);
    });

    it('refuses an unterminated string literal', function () {
      assert.throws(() => evalIt('"never closed'), WhenSyntaxError);
      assert.throws(() => evalIt('"ends with an escape\\'), WhenSyntaxError);
    });
  });

  describe('number literals', function () {

    it('reads an exponent', function () {
      assert.strictEqual(evalIt('1e3'), 1000);
      assert.strictEqual(evalIt('1E3'), 1000);
    });

    it('reads a signed exponent', function () {
      assert.strictEqual(evalIt('2e+3'), 2000);
      assert.strictEqual(evalIt('2e-3'), 0.002);
    });

    it('compares an exponent literal', function () {
      assert.strictEqual(evalIt('n > 1e3', { n: 1001 }), true);
      assert.strictEqual(evalIt('n > 1e3', { n: 999 }), false);
    });
  });

  describe('the parser refusing malformed input', function () {

    it('names the token it expected and the one it found', function () {
      assert.throws(() => evalIt('(a == 1'), (e) => {
        assert.ok(e instanceof WhenSyntaxError);
        assert.match(e.message, /Expected '\)'/);
        return true;
      });
    });

    it('refuses a trailing token after a complete expression', function () {
      assert.throws(() => evalIt('a == 1 b'), (e) => {
        assert.ok(e instanceof WhenSyntaxError);
        assert.match(e.message, /Unexpected token 'b'/);
        return true;
      });
    });

    it('refuses a missing property name after a dot', function () {
      assert.throws(() => evalIt('a.'), WhenSyntaxError);
      assert.throws(() => evalIt('a?.'), WhenSyntaxError);
    });

    it('evaluateAsBoolean answers null rather than throwing on any of them', function () {
      const when = new TiledeskWhenExpression();
      assert.strictEqual(when.evaluateAsBoolean('(a == 1', {}), null);
      assert.strictEqual(when.evaluateAsBoolean('a == 1 b', {}), null);
    });
  });

  describe('optional chaining into an index', function () {

    it('reads the element when the object is there', function () {
      assert.strictEqual(evalIt('items?.[0]', { items: ["first", "second"] }), "first");
      assert.strictEqual(evalIt('items?.[1] == "second"', { items: ["first", "second"] }), true);
    });

    it('answers undefined instead of throwing when the object is not', function () {
      assert.strictEqual(evalIt('items?.[0]', {}), undefined);
      assert.strictEqual(evalIt('items?.[0]', { items: null }), undefined);
    });

    it('takes the index from an expression', function () {
      assert.strictEqual(evalIt('items?.[i + 1]', { items: ["a", "b", "c"], i: 1 }), "c");
    });
  });

  describe('the arithmetic operators', function () {

    it('adds two numbers and concatenates anything else', function () {
      assert.strictEqual(evalIt('a + b', { a: 2, b: 3 }), 5);
      assert.strictEqual(evalIt('a + b', { a: "2", b: "3" }), 5, 'numeric strings still add');
      assert.strictEqual(evalIt('a + b', { a: "Hello ", b: "world" }), "Hello world");
      assert.strictEqual(evalIt('a + b', { a: "order-", b: 7 }), "order-7");
    });

    it('negates and unary-plus a value', function () {
      assert.strictEqual(evalIt('-a', { a: 3 }), -3);
      assert.strictEqual(evalIt('+a', { a: "3" }), 3, 'unary plus coerces to a number');
      assert.strictEqual(evalIt('-a > -5', { a: 3 }), true);
    });
  });

  describe('isEmpty on the types that are not a collection', function () {

    it('is false for a number and true for the empty collections', function () {
      assert.strictEqual(evalIt('isEmpty(n)', { n: 0 }), false,
        'zero is a value, not an empty collection');
      assert.strictEqual(evalIt('isEmpty(n)', { n: 42 }), false);
      assert.strictEqual(evalIt('isEmpty(b)', { b: true }), false);
      assert.strictEqual(evalIt('isEmpty(s)', { s: "" }), true);
      assert.strictEqual(evalIt('isEmpty(a)', { a: [] }), true);
      assert.strictEqual(evalIt('isEmpty(o)', { o: {} }), true);
      assert.strictEqual(evalIt('isEmpty(o)', { o: { k: 1 } }), false);
    });
  });
});
