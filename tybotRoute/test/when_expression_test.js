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
    it('contains / endsWith / isEmpty (case-sensitive)', () => {
      assert.strictEqual(evalIt('contains(s, "ar")', { s: "dario" }), true);
      assert.strictEqual(evalIt('endsWith(s, "io")', { s: "dario" }), true);
      assert.strictEqual(evalIt('endsWith(s, "IO")', { s: "dario" }), false); // case-sensitive
      assert.strictEqual(evalIt('isEmpty(s)', { s: "" }), true);
      assert.strictEqual(evalIt('isEmpty(s)', { s: "x" }), false);
    });
  });

  // ---- Full JSON-condition grammar coverage (docs/json-condition-when-grammar.md) ----

  describe('text operators (case-sensitive)', () => {
    it('== / != as text', () => {
      assert.strictEqual(evalIt('user.city == "Roma"', { user: { city: "Roma" } }), true);
      assert.strictEqual(evalIt('user.city == "roma"', { user: { city: "Roma" } }), false); // case-sensitive
      assert.strictEqual(evalIt('user.city != "Roma"', { user: { city: "Milano" } }), true);
    });
    it('contains / startsWith / endsWith and negations', () => {
      assert.strictEqual(evalIt('contains(msg, "hi")', { msg: "hi there" }), true);
      assert.strictEqual(evalIt('!contains(msg, "hi")', { msg: "bye" }), true);
      assert.strictEqual(evalIt('startsWith(lang, "it")', { lang: "it-IT" }), true);
      assert.strictEqual(evalIt('!startsWith(lang, "it")', { lang: "en" }), true);
      assert.strictEqual(evalIt('endsWith(file, ".pdf")', { file: "doc.pdf" }), true);
      assert.strictEqual(evalIt('!endsWith(file, ".pdf")', { file: "doc.txt" }), true);
    });
    it('matches regex and negation', () => {
      assert.strictEqual(evalIt('matches(email, "^.+@.+$")', { email: "a@b.it" }), true);
      assert.strictEqual(evalIt('matches(email, "^.+@.+$")', { email: "nope" }), false);
      assert.strictEqual(evalIt('!matches(email, "^.+@.+$")', { email: "nope" }), true);
      assert.strictEqual(evalIt('matches(s, "[")', { s: "x" }), false); // invalid regex -> false
    });
  });

  describe('number operators (operand type drives coercion)', () => {
    it('== / != as number with string coercion', () => {
      assert.strictEqual(evalIt('ai_reply.name == 11', { ai_reply: { name: "11" } }), true);
      assert.strictEqual(evalIt('count != 0', { count: 5 }), true);
      assert.strictEqual(evalIt('count != 0', { count: 0 }), false);
    });
    it('relational operators are numeric-only, NaN -> false', () => {
      assert.strictEqual(evalIt('age > 18', { age: "20" }), true);
      assert.strictEqual(evalIt('age >= 18', { age: 18 }), true);
      assert.strictEqual(evalIt('score < 100', { score: 99 }), true);
      assert.strictEqual(evalIt('score <= 100', { score: 100 }), true);
      assert.strictEqual(evalIt('age > 18', { age: "abc" }), false); // NaN -> false
    });
    it('text == vs number == are distinguished by the right operand', () => {
      assert.strictEqual(evalIt('code == "007"', { code: 7 }), false); // text compare
      assert.strictEqual(evalIt('code == 7', { code: "007" }), true);  // number compare
    });
    it('type strictness on numeric operators (no JS coercion leak) -> false', () => {
      // arrays/objects are not numbers: numeric == and relational must be false,
      // not coerced (Number([])===0, Number([3])===3 must NOT leak through).
      assert.strictEqual(evalIt('x <= 5', { x: [] }), false);
      assert.strictEqual(evalIt('x <= 5', { x: [3] }), false);
      assert.strictEqual(evalIt('x == 0', { x: [] }), false);
      assert.strictEqual(evalIt('x == 3', { x: [3] }), false);
      assert.strictEqual(evalIt('x > 0', { x: { a: 1 } }), false);
      // regression: length() returns a real number and still compares numerically
      assert.strictEqual(evalIt('length(tags) >= 1', { tags: ["a"] }), true);
    });
  });

  describe('boolean operators (is true / is false)', () => {
    it('x == true', () => {
      assert.strictEqual(evalIt('flag == true', { flag: true }), true);
      assert.strictEqual(evalIt('flag == true', { flag: "true" }), true);
      assert.strictEqual(evalIt('flag == true', { flag: false }), false);
    });
    it('x == false', () => {
      assert.strictEqual(evalIt('flag == false', { flag: false }), true);
      assert.strictEqual(evalIt('flag == false', { flag: "false" }), true);
      assert.strictEqual(evalIt('flag == false', { flag: true }), false);
    });
  });

  describe('existence / emptiness', () => {
    it('exists / isUndefined / isNull', () => {
      assert.strictEqual(evalIt('!isUndefined(x)', { x: 0 }), true);       // exists
      assert.strictEqual(evalIt('isUndefined(x)', {}), true);             // missing
      assert.strictEqual(evalIt('isUndefined(x)', { x: null }), false);   // null != undefined
      assert.strictEqual(evalIt('isNull(x)', { x: null }), true);
    });
    it('isEmpty on string / array / object / null', () => {
      assert.strictEqual(evalIt('isEmpty(x)', { x: "" }), true);
      assert.strictEqual(evalIt('isEmpty(x)', { x: [] }), true);
      assert.strictEqual(evalIt('isEmpty(x)', { x: {} }), true);
      assert.strictEqual(evalIt('isEmpty(x)', {}), true);                 // undefined
      assert.strictEqual(evalIt('isEmpty(x)', { x: [1] }), false);
      assert.strictEqual(evalIt('!isEmpty(x)', { x: "a" }), true);
    });
  });

  describe('date operators', () => {
    it('dateEqual and negation', () => {
      assert.strictEqual(evalIt('dateEqual(d, "2026-06-15")', { d: "2026-06-15" }), true);
      assert.strictEqual(evalIt('dateEqual(d, "2026-06-15")', { d: "2026-06-16" }), false);
      assert.strictEqual(evalIt('!dateEqual(d, "2026-06-15")', { d: "2026-06-16" }), true);
    });
    it('isAfter / isBefore / isAfterOrEqual / isBeforeOrEqual', () => {
      assert.strictEqual(evalIt('isAfter(d, "2026-01-01")', { d: "2026-06-15" }), true);
      assert.strictEqual(evalIt('isBefore(d, "2026-01-01")', { d: "2026-06-15" }), false);
      assert.strictEqual(evalIt('isAfterOrEqual(d, "2026-06-15")', { d: "2026-06-15" }), true);
      assert.strictEqual(evalIt('isBeforeOrEqual(d, "2026-06-15")', { d: "2026-06-15" }), true);
    });
    it('invalid date -> false (never throws)', () => {
      assert.strictEqual(evalIt('isAfter(d, "2026-01-01")', { d: "not-a-date" }), false);
      assert.strictEqual(evalIt('dateEqual(d, "x")', { d: "2026-06-15" }), false);
    });
  });

  describe('array operators', () => {
    it('arrayContains with element equality (no substring false positive)', () => {
      assert.strictEqual(evalIt('arrayContains(tags, "a")', { tags: ["a", "b"] }), true);
      assert.strictEqual(evalIt('arrayContains(tags, "c")', { tags: ["a", "b"] }), false);
      assert.strictEqual(evalIt('!arrayContains(tags, "c")', { tags: ["a", "b"] }), true);
      assert.strictEqual(evalIt('arrayContains(nums, 10)', { nums: [10, 20] }), true);
      assert.strictEqual(evalIt('arrayContains(nums, 1)', { nums: [10, 20] }), false); // not "10".includes("1")
      assert.strictEqual(evalIt('arrayContains(tags, "a")', { tags: '["a","b"]' }), true); // JSON string
    });
    it('length on array / string / non-array', () => {
      assert.strictEqual(evalIt('length(tags) == 2', { tags: ["a", "b"] }), true);
      assert.strictEqual(evalIt('length(tags) > 1', { tags: ["a", "b"] }), true);
      assert.strictEqual(evalIt('length(s) == 5', { s: "hello" }), true);
      assert.strictEqual(evalIt('length(o) == 0', { o: { a: 1 } }), true); // object -> 0
    });
  });

  describe('deep equality of arrays / objects (variable vs variable)', () => {
    it('objects', () => {
      assert.strictEqual(evalIt('a == b', { a: { x: 1, y: 2 }, b: { x: 1, y: 2 } }), true);
      assert.strictEqual(evalIt('a == b', { a: { x: 1 }, b: { x: 2 } }), false);
      assert.strictEqual(evalIt('a != b', { a: { x: 1 }, b: { x: 2 } }), true);
    });
    it('arrays', () => {
      assert.strictEqual(evalIt('a == b', { a: [1, 2], b: [1, 2] }), true);
      assert.strictEqual(evalIt('a == b', { a: [1, 2], b: [1, 3] }), false);
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
