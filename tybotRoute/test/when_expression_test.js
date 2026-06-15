const assert = require('assert');
const { TiledeskWhenExpression, WhenSyntaxError, WhenEvalError } = require('../TiledeskWhenExpression');

// Real expression taken from the new `when` field of a jsoncondition action.
const WHEN = '(lastUserText == 1 || user_city == 2) || (user_country != "ita" && lastUserText >= 1) && (!startsWith(lastUserText, "dar"))';

describe('TiledeskWhenExpression', () => {

  const evalIt = (expr, vars) => new TiledeskWhenExpression().evaluate(expr, vars);

  describe('comparison & logical operators', () => {
    it('equals as number (==)', () => {
      assert.strictEqual(evalIt('score == 10', { score: 10 }), true);
      assert.strictEqual(evalIt('score == 10', { score: "10" }), true); // numeric coercion
      assert.strictEqual(evalIt('score == 10', { score: 5 }), false);
    });
    it('not equals as string (!=)', () => {
      assert.strictEqual(evalIt('country != "ita"', { country: "usa" }), true);
      assert.strictEqual(evalIt('country != "ita"', { country: "ita" }), false);
    });
    it('relational operators', () => {
      assert.strictEqual(evalIt('n >= 1', { n: 1 }), true);
      assert.strictEqual(evalIt('n > 1', { n: 1 }), false);
      assert.strictEqual(evalIt('n <= 1', { n: 0 }), true);
      assert.strictEqual(evalIt('n < 1', { n: 2 }), false);
    });
    it('logical && / || / ! with short-circuit and precedence', () => {
      assert.strictEqual(evalIt('a && b', { a: true, b: false }), false);
      assert.strictEqual(evalIt('a || b', { a: false, b: true }), true);
      assert.strictEqual(evalIt('!a', { a: false }), true);
      // a || b && c  ===  a || (b && c)
      assert.strictEqual(evalIt('a || b && c', { a: true, b: false, c: false }), true);
    });
  });

  describe('whitelisted functions', () => {
    it('startsWith / notStartsWith', () => {
      assert.strictEqual(evalIt('startsWith(s, "dar")', { s: "dario" }), true);
      assert.strictEqual(evalIt('!startsWith(s, "dar")', { s: "dario" }), false);
      assert.strictEqual(evalIt('!startsWith(s, "dar")', { s: "mario" }), true);
    });
    it('contains / endsWith / isEmpty', () => {
      assert.strictEqual(evalIt('contains(s, "ar")', { s: "dario" }), true);
      assert.strictEqual(evalIt('endsWith(s, "IO")', { s: "dario" }), true);
      assert.strictEqual(evalIt('isEmpty(s)', { s: "" }), true);
      assert.strictEqual(evalIt('isEmpty(s)', { s: "x" }), false);
    });
  });

  describe('member access', () => {
    it('dot and computed access', () => {
      assert.strictEqual(evalIt('person.name == "ann"', { person: { name: "ann" } }), true);
      assert.strictEqual(evalIt('people[0].name == "ann"', { people: [{ name: "ann" }] }), true);
    });
    it('optional chaining on missing object', () => {
      assert.strictEqual(evalIt('person?.age', { }), undefined);
    });
  });

  describe('real-world `when` expression', () => {
    it('true when first group matches (lastUserText == 1)', () => {
      assert.strictEqual(evalIt(WHEN, { lastUserText: 1 }), true);
    });
    it('false when no group matches', () => {
      assert.strictEqual(evalIt(WHEN, { lastUserText: "x", user_city: 5, user_country: "ita" }), false);
    });
    it('true via second branch (country!=ita && >=1 && !startsWith dar)', () => {
      assert.strictEqual(evalIt(WHEN, { lastUserText: 5, user_city: 0, user_country: "usa" }), true);
    });
    it('false when text starts with "dar"', () => {
      assert.strictEqual(evalIt(WHEN, { lastUserText: "dario", user_country: "usa" }), false);
    });
  });

  describe('security: no host access, no arbitrary code', () => {
    const te = new TiledeskWhenExpression();
    it('identifiers resolve only against variables (no globals)', () => {
      assert.strictEqual(te.evaluate('process', {}), undefined);
      assert.strictEqual(te.evaluate('globalThis', {}), undefined);
      assert.strictEqual(te.evaluate('constructor', {}), undefined);
    });
    it('blocks dangerous property keys', () => {
      assert.strictEqual(te.evaluate('a.constructor', { a: {} }), undefined);
      assert.strictEqual(te.evaluate('a.__proto__', { a: {} }), undefined);
    });
    it('rejects non-whitelisted function calls', () => {
      assert.throws(() => te.evaluate('evil()', {}), WhenEvalError);
      assert.throws(() => te.evaluate('a.toString()', { a: "x" }), WhenEvalError);
    });
    it('rejects assignment and unknown syntax', () => {
      assert.throws(() => te.evaluate('a = 1', {}), WhenSyntaxError);
      assert.throws(() => te.evaluate('a; b', {}), WhenSyntaxError);
      assert.throws(() => te.evaluate('function(){}', {}), WhenSyntaxError);
    });
    it('rejects oversized expressions', () => {
      const long = 'a == ' + '1'.repeat(20000);
      assert.throws(() => te.evaluate(long, {}), WhenSyntaxError);
    });
  });

  describe('error handling', () => {
    it('evaluateAsBoolean returns null on parse error', () => {
      assert.strictEqual(new TiledeskWhenExpression().evaluateAsBoolean('a = =', {}), null);
    });
    it('evaluateAsBoolean coerces truthy/falsy', () => {
      assert.strictEqual(new TiledeskWhenExpression().evaluateAsBoolean('1 == 1', {}), true);
      assert.strictEqual(new TiledeskWhenExpression().evaluateAsBoolean('1 == 2', {}), false);
    });
  });

});
