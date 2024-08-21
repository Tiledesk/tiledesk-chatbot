var assert = require('assert');
const { TiledeskExpression } = require('../TiledeskExpression');

describe('Variable names validator regex', function() {

  it('validates variable name invalid (numbers only)', async () => {
    let is_valid = TiledeskExpression.validateVariableName("1");
    assert(is_valid === false);
  });

  it('validates variable name valid (letters only)', async () => {
    let is_valid = TiledeskExpression.validateVariableName("test");
    assert(is_valid === true);
  });

  it('validates variable name INvalid (cannot start with number)', async () => {
    let is_valid = TiledeskExpression.validateVariableName("12test");
    assert(is_valid === false);
  });

  it('validates variable name valid (starts with letters, ends with numbers)', async () => {
    let is_valid = TiledeskExpression.validateVariableName("t12");
    assert(is_valid === true);
  });

});



