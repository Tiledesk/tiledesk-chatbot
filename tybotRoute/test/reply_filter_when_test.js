var assert = require('assert');
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');

/** A reply carrying one filtered message, in the shape filterOnVariables expects. */
function replyWith(filter, text) {
  return {
    text: "",
    attributes: {
      commands: [
        { type: "message", message: { text: text || "hello", _tdJSONCondition: filter } }
      ]
    }
  };
}

/** The two forms the design studio saves: the tree, and the same filter as a formula. */
function filter(conditions, when) {
  const f = { conditions: conditions };
  if (when !== undefined) { f.when = when; }
  return f;
}

function cond(operand1, operator, value) {
  // `type` non e' decorativo: JSONGroupToExpression salta gli elementi che non lo dichiarano,
  // e un gruppo di soli elementi saltati produce "()", che non e' un'espressione valida.
  return { type: 'condition', operand1: operand1, operator: operator, operand2: { type: 'const', value: value } };
}

describe('Reply filters · which evaluator reads them', function () {

  it('a filter carrying `when` is read from the formula', () => {
    // The tree says something the formula contradicts: whichever answer comes back tells us
    // which of the two was read, with no way to confuse them.
    const f = filter([cond('city', 'equalAsStrings', 'Roma')], 'city == "Milano"');
    assert.strictEqual(TiledeskChatbotUtil.evaluateMessageFilter(f, { city: 'Milano' }), true);
    assert.strictEqual(TiledeskChatbotUtil.evaluateMessageFilter(f, { city: 'Roma' }), false);
  });

  it('a filter without `when` keeps working as before', () => {
    // Every filter saved before `when` was written looks like this. Reading only the formula
    // would switch all of them off at once.
    const f = filter([cond('city', 'equalAsStrings', 'Roma')]);
    assert.strictEqual(TiledeskChatbotUtil.evaluateMessageFilter(f, { city: 'Roma' }), true);
    assert.strictEqual(TiledeskChatbotUtil.evaluateMessageFilter(f, { city: 'Milano' }), false);
  });

  it('an empty `when` is not a formula: the tree is read', () => {
    const f = filter([cond('city', 'equalAsStrings', 'Roma')], '   ');
    assert.strictEqual(TiledeskChatbotUtil.evaluateMessageFilter(f, { city: 'Roma' }), true);
  });

  // The 22 operators the old evaluator never had. Through `when` they are ordinary formulas.
  it('the operators the old evaluator does not know are evaluated', () => {
    const cases = [
      ['!isEmpty(name)',                       { name: 'Ada' },              true],
      ['!isEmpty(name)',                       { name: '' },                 false],
      ['!contains(msg, "hi")',                 { msg: 'hello' },             true],
      ['!contains(msg, "hi")',                 { msg: 'hi there' },          false],
      ['isAfter(due, "2020-01-01")',           { due: '2030-06-01' },        true],
      ['isAfter(due, "2020-01-01")',           { due: '2010-06-01' },        false],
      ['isBefore(due, "2020-01-01")',          { due: '2010-06-01' },        true],
      ['arrayContains(tags, "vip")',           { tags: '["vip","new"]' },    true],
      ['arrayContains(tags, "vip")',           { tags: '["new"]' },          false],
      ['!arrayContains(tags, "vip")',          { tags: '["new"]' },          true],
      ['length(name) > 3',                     { name: 'Adalovelace' },      true],
      ['length(name) > 3',                     { name: 'Ada' },              false],
      ['flag == true',                         { flag: true },               true],
      ['flag == false',                        { flag: true },               false],
      ['!isUndefined(x) && !isNull(x)',        { x: 'v' },                   true],
      ['!isUndefined(x) && !isNull(x)',        { x: null },                  false],
      ['!endsWith(file, ".pdf")',              { file: 'a.txt' },            true],
      ['!matches(email, "^.+@.+$")',           { email: 'nope' },            true]
    ];
    cases.forEach(([when, vars, expected]) => {
      const got = TiledeskChatbotUtil.evaluateMessageFilter(filter([], when), vars);
      assert.strictEqual(got, expected, `${when} with ${JSON.stringify(vars)} -> ${got}`);
    });
  });

  // A list reaching a flow is held as JSON text, so these two used to disagree on the same
  // value: one read it as a list, the other as characters, while sitting in the same "Array"
  // group of the studio's picker.
  it('length counts the items of a list written as JSON', () => {
    const arr = { tags: '["a","b"]' };
    assert.strictEqual(TiledeskChatbotUtil.evaluateMessageFilter(filter([], 'length(tags) == 2'), arr), true);
    assert.strictEqual(TiledeskChatbotUtil.evaluateMessageFilter(filter([], 'length(tags) > 1'), arr), true);
    assert.strictEqual(TiledeskChatbotUtil.evaluateMessageFilter(filter([], 'length(tags) > 2'), arr), false);
    assert.strictEqual(TiledeskChatbotUtil.evaluateMessageFilter(filter([], 'arrayContains(tags, "a")'), arr), true);
  });

  it('length still counts characters when the text is not a list', () => {
    assert.strictEqual(TiledeskChatbotUtil.evaluateMessageFilter(filter([], 'length(name) == 3'), { name: 'Ada' }), true);
    // Valid JSON, but not a list: read as text, as before.
    assert.strictEqual(TiledeskChatbotUtil.evaluateMessageFilter(filter([], 'length(x) == 7'), { x: '{"a":1}' }), true);
  });

  // A variable explicitly set to null holds no value: saying it exists made "exists" and
  // "is null" both true on it.
  it('exists is false on a variable set to null, and on one never set', () => {
    assert.strictEqual(TiledeskChatbotUtil.evaluateMessageFilter(filter([], 'exists(x)'), { x: 'v' }), true);
    assert.strictEqual(TiledeskChatbotUtil.evaluateMessageFilter(filter([], 'exists(x)'), { x: null }), false);
    assert.strictEqual(TiledeskChatbotUtil.evaluateMessageFilter(filter([], 'exists(x)'), {}), false);
    assert.strictEqual(TiledeskChatbotUtil.evaluateMessageFilter(filter([], '!exists(x)'), { x: null }), true);
    // The two are still distinguishable for whoever needs it.
    assert.strictEqual(TiledeskChatbotUtil.evaluateMessageFilter(filter([], 'isNull(x)'), { x: null }), true);
    assert.strictEqual(TiledeskChatbotUtil.evaluateMessageFilter(filter([], 'isUndefined(x)'), { x: null }), false);
  });

  it('a filter that cannot be evaluated shows its message instead of hiding it', () => {
    // `=== false` is what hides a message, so anything that is not false leaves it in place.
    // The opposite reading would turn every malformed filter into content that vanishes with
    // nothing said on screen -- the fault this change exists to remove.
    const broken = TiledeskChatbotUtil.evaluateMessageFilter(filter([], 'city == =='), { city: 'Roma' });
    assert.notStrictEqual(broken, false);

    // An operator the old evaluator never had, saved WITHOUT a formula: building the old
    // expression throws, and the throw must not escape.
    const legacy = filter([cond('tags', 'arrayContains', 'vip')]);
    const got = TiledeskChatbotUtil.evaluateMessageFilter(legacy, { tags: '["vip"]' });
    assert.notStrictEqual(got, false);
  });

  it('a whole reply: the message with a false filter goes, the others stay', () => {
    const reply = {
      text: "",
      attributes: {
        commands: [
          { type: "message", message: { text: "always" } },
          { type: "message", message: { text: "only for VIPs", _tdJSONCondition: filter([], 'arrayContains(tags, "vip")') } }
        ]
      }
    };
    TiledeskChatbotUtil.filterOnVariables(reply, { tags: '["new"]' });
    assert.strictEqual(reply.attributes.commands.length, 1);
    assert.strictEqual(reply.text, "always");
  });

  it('an unevaluable filter does not take the rest of the reply down with it', () => {
    const reply = replyWith(filter([cond('tags', 'arrayContains', 'vip')]), "kept");
    reply.attributes.commands.unshift({ type: "message", message: { text: "first" } });
    TiledeskChatbotUtil.filterOnVariables(reply, { tags: '["vip"]' });
    assert.strictEqual(reply.attributes.commands.length, 2);
    assert.ok(reply.text.indexOf("kept") !== -1);
  });
});
