var assert = require('assert');
const exp = require('constants');
const { TiledeskExpression } = require('../TiledeskExpression');

describe('JSON to expression', function() {
  
  it('test condition operand lessThan (false)', async () => {
    const condition = {
      "type": "condition",
      "operand1": "age",
      "operator": TiledeskExpression.OPERATORS.lessThan.name,
      "operand2": {
        type: "const",
        value: "10"
      }
    }
    const vars = {
      age: 12
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    // console.log("expression:", expression);
    assert(expression === 'Number($data.age) < Number("10")');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    assert(result === false);
  });

  it('test condition operand lessThan (true)', async () => {
    const condition = {
      "type": "condition",
      "operand1": "age",
      "operator": TiledeskExpression.OPERATORS.lessThan.name,
      "operand2": {
        type: "const",
        value: "12"
      }
    }
    
    const vars = {
      age: 10
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    // console.log("expression:", expression);
    assert(expression === 'Number($data.age) < Number("12")');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    // console.log("result:", result);
    assert(result === true);
  });

  it('test condition operand greaterThan (true)', async () => {
    const condition = {
      "type": "condition",
      "operand1": "age",
      "operator": TiledeskExpression.OPERATORS.greaterThan.name,
      "operand2": {
        type: "const",
        value: "10"
      }
    }
    const vars = {
      age: 12
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    // console.log("expression:", expression);
    assert(expression === 'Number($data.age) > Number("10")');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    // console.log("result:", result);
    assert(result === true);
  });

  it('test condition operand startsWith (true)', async () => {
    const condition = {
      "type": "condition",
      "operand1": "name",
      "operator": TiledeskExpression.OPERATORS.startsWith.name,
      "operand2": {
        type: "const",
        value: "And"
      }
    }
    const vars = {
      name: "Andrea"
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    // console.log("expression:", expression);
    assert(expression === 'String($data.name).startsWith(String("And"))');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    // console.log("result:", result);
    assert(result === true);
  });

  it('test condition operand notStartsWith (true)', async () => {
    const condition = {
      "type": "condition",
      "operand1": "name",
      "operator": TiledeskExpression.OPERATORS.notStartsWith.name,
      "operand2": {
        type: "const",
        value: "And"
      }
    }
    const vars = {
      name: "Marco"
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
    assert(expression === '!String($data.name).startsWith(String("And"))');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    console.log("result:", result);
    assert(result === true);
  });

  it('test condition operand notStartsWith (false)', async () => {
    const condition = {
      "type": "condition",
      "operand1": "name",
      "operator": TiledeskExpression.OPERATORS.notStartsWith.name,
      "operand2": {
        type: "const",
        value: "And"
      }
    }
    const vars = {
      name: "Andrea"
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
    assert(expression === '!String($data.name).startsWith(String("And"))');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    console.log("result:", result);
    assert(result === false);
  });

  it('test condition group in "and" (true)', async () => {
    const part1 = {
      "type": "condition",
      "operand1": "height",
      "operator": TiledeskExpression.OPERATORS.greaterThan.name,
      "operand2": {
        type: "const",
        value: "1"
      }
    }

    const part2 = {
      "type": "operator",
      "operator": TiledeskExpression.OPERATORS.AND.name
    }

    const part3 = {
      "type": "condition",
      "operand1": "name",
      "operator": TiledeskExpression.OPERATORS.startsWith.name,
      "operand2": {
        type: "const",
        value: "And"
      }
    }

    const group = {
      type: "expression",
      conditions: [ part1, part2, part3 ]
    }
    const vars = {
      height: 2,
      name: "Andrea"
    }
    const expression = TiledeskExpression.JSONGroupToExpression(group);
    // console.log("expression:", expression);
    assert(expression === '(Number($data.height) > Number("1") && String($data.name).startsWith(String("And")))');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    // console.log("result:", result);
    assert(result === true);
  });

  it('test condition group in "and" (false)', async () => {
    const part1 = {
      "type": "condition",
      "operand1": "height",
      "operator": TiledeskExpression.OPERATORS.greaterThan.name,
      "operand2": {
        type: "const",
        value: "2"
      }
    }

    const part2 = {
      "type": "operator",
      "operator": TiledeskExpression.OPERATORS.AND.name
    }

    const part3 = {
      "type": "condition",
      "operand1": "name",
      "operator": TiledeskExpression.OPERATORS.startsWith.name,
      "operand2": {
        type: "const",
        value: "Ond"
      }
    }

    const group = {
      conditions: [ part1, part2, part3 ]
    }
    const vars = {
      height: 1,
      name: "Andrea"
    }
    const expression = TiledeskExpression.JSONGroupToExpression(group);
    // console.log("expression:", expression);
    assert(expression === '(Number($data.height) > Number("2") && String($data.name).startsWith(String("Ond")))');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    // console.log("result:", result);
    assert(result === false);
  });

  it('test multiple conditions group (true)', async () => {
    const part1 = {
      "type": "condition",
      "operand1": "height",
      "operator": TiledeskExpression.OPERATORS.greaterThan.name,
      "operand2": {
        type: "const",
        value: "1"
      }
    }

    const part2 = {
      "type": "operator",
      "operator": TiledeskExpression.OPERATORS.AND.name
    }

    const part3 = {
      "type": "condition",
      "operand1": "Andrea",
      "operator": TiledeskExpression.OPERATORS.startsWith.name,
      "operand2": {
        type: "const",
        value: "And"
      }
    }

    const part4 = {
      "type": "operator",
      "operator": TiledeskExpression.OPERATORS.OR.name
    }

    const part5 = {
      "type": "condition",
      "operand1": "size",
      "operator": TiledeskExpression.OPERATORS.equalAsNumbers.name,
      "operand2": {
        type: "const",
        value: "03"
      }
    }

    const part6 = {
      "type": "operator",
      "operator": TiledeskExpression.OPERATORS.AND.name
    }

    const part7 = {
      "type": "condition",
      "operand1": "name",
      "operator": TiledeskExpression.OPERATORS.equalAsStrings.name,
      "operand2": {
        type: "const",
        value: "Andrea"
      }
    }

    const group = {
      conditions: [ part1, part2, part3, part4, part5, part6, part7 ]
    }
    const vars = {
      height: 2,
      size: 3,
      name: "Andrea"
    }
    const expression = TiledeskExpression.JSONGroupToExpression(group);
    // console.log("expression:", expression);
    assert(expression === '(Number($data.height) > Number("1") && String($data.Andrea).startsWith(String("And")) || Number($data.size) === Number("03") && String($data.name) === String("Andrea"))');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    // console.log("result:", result);
    assert(result === true);
  });

  it('test multiple groups (true)', async () => {
    const part1 = {
      "type": "condition",
      "operand1": "height",
      "operator": TiledeskExpression.OPERATORS.greaterThan.name,
      "operand2": {
        type: "const",
        value: "1"
      }
    }

    const part2 = {
      "type": "operator",
      "operator": TiledeskExpression.OPERATORS.AND.name
    }

    const part3 = {
      "type": "condition",
      "operand1": "name",
      "operator": TiledeskExpression.OPERATORS.startsWith.name,
      "operand2": {
        type: "const",
        value: "And"
      }
    }

    const part5 = {
      "type": "condition",
      "operand1": "size",
      "operator": TiledeskExpression.OPERATORS.equalAsNumbers.name,
      "operand2": {
        type: "const",
        value: "03"
      }
    }

    const part6 = {
      "type": "operator",
      "operator": TiledeskExpression.OPERATORS.AND.name
    }

    const part7 = {
      "type": "condition",
      "operand1": "name",
      "operator": TiledeskExpression.OPERATORS.equalAsStrings.name,
      "operand2": {
        type: "const",
        value: "Andrea"
      }
    }

    const group1 = {
      type: "expression",
      conditions: [ part1, part2, part3 ]
    }

    const group_operator = {
      "type": "operator",
      "operator": TiledeskExpression.OPERATORS.OR.name
    }

    const group2 = {
      type: "expression",
      conditions: [ part5, part6, part7 ]
    }

    const groups = [group1, group_operator, group2];
    const vars = {
      height: 2,
      size: 3,
      name: "Andrea"
    }
    const expression = TiledeskExpression.JSONGroupsToExpression(groups);
    // console.log("expression:", expression);
    assert(expression === '(Number($data.height) > Number("1") && String($data.name).startsWith(String("And"))) || (Number($data.size) === Number("03") && String($data.name) === String("Andrea"))');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    // console.log("result:", result);
    assert(result === true);
  });

  it('test multiple groups with one condition and one group (true)', async () => {
    const part1 = {
      "type": "condition",
      "operand1": "height",
      "operator": TiledeskExpression.OPERATORS.greaterThan.name,
      "operand2": {
        type: "const",
        value: "1"
      }
    }

    const group1 = {
      type: "expression",
      conditions: [ part1 ]
    }

    const groups = [group1];
    const vars = {
      height: 2
    }
    const expression = TiledeskExpression.JSONGroupsToExpression(groups);
    // console.log("expression:", expression);
    assert(expression === '(Number($data.height) > Number("1"))');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    // console.log("result:", result);
    assert(result === true);
  });

  it('test multiple groups with one condition and one group (false)', async () => {
    const part1 = {
      "type": "condition",
      "operand1": "height",
      "operator": TiledeskExpression.OPERATORS.lessThan.name,
      "operand2": {
        type: "const",
        value: "1"
      }
    }
    const group1 = {
      type: "expression",
      conditions: [ part1 ]
    }
    const groups = [group1];
    const vars = {
      height: 2
    }
    const expression = TiledeskExpression.JSONGroupsToExpression(groups);
    // console.log("expression:", expression);
    assert(expression === '(Number($data.height) < Number("1"))');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    // console.log("result:", result);
    assert(result === false);
  });

  it('test variables, a > b true', async () => {
    const part1 = {
      "type": "condition",
      "operand1": "a",
      "operator": TiledeskExpression.OPERATORS.greaterThan.name,
      "operand2": {
        type: "var",
        name: "b"
      }
    }

    const group1 = {
      type: "expression",
      conditions: [ part1 ]
    }

    const vars = {
      "a": "2.5",
      "b": "2.4"
    }

    const groups = [group1];
    
    const expression = TiledeskExpression.JSONGroupsToExpression(groups);
    // console.log("full expression2:", expression);
    assert(expression === '(Number($data.a) > Number($data.b))');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    // console.log("result:", result);
    assert(result === true);
  });

  it('test variables, a < b true', async () => {
    const part1 = {
      "type": "condition",
      "operand1": "a",
      "operator": TiledeskExpression.OPERATORS.lessThan.name,
      "operand2": {
        type: "var",
        name: "b"
      }
    }

    const group1 = {
      type: "expression",
      conditions: [ part1 ]
    }

    const vars = {
      "a": "1",
      "b": "2"
    }

    const groups = [group1];
    
    const expression = TiledeskExpression.JSONGroupsToExpression(groups);
    // console.log("full expression:", expression);
    assert(expression === '(Number($data.a) < Number($data.b))');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    // console.log("result:", result);
    assert(result === true);
  });

  it('validates variable names', async () => {
    let is_valid;
    is_valid = TiledeskExpression.validateVariableName("1");
    assert(is_valid === false);
  });

  // Struct
    // const expression = {
    //   groups: [
    //     {
    //       type: "expression",
    //       conditions: [
    //         {
    //           type: "condition",
    //           "operand1": "age",
    //           "operator": TiledeskExpression.OPERATORS.lessThan,
    //           "operand2": {
    //             type: "const", // type: "var"
    //             value: "10" // name: "b"
    //           }
    //         },
    //         {
    //           type: "operator",
    //           operator: "OR"
    //         },
    //         { type: "condition", ...}
    //       ]
    //     },
    //     {
    //       type: "operator",
    //       operator: "AND"
    //     },
    //     { type: "expression", ...}
    //   ]
    // };

    
});


describe("Test conditions with invalid operands", () => {
  it('test condition with invalid variable operand', async () => {
    const condition = {
      "type": "condition",
      "operand1": "age()", // invalid chars ()
      "operator": TiledeskExpression.OPERATORS.lessThan.name,
      "operand2": {
        type: "const",
        value: "10"
      }
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    // console.log("expression:", expression);
    assert(expression === null);
  });

  it('test condition with invalid variable operand', async () => {
    const condition = {
      "type": "condition",
      "operand1": "age",
      "operator": TiledeskExpression.OPERATORS.lessThan.name,
      "operand2": {
        type: "var",
        name: "12" // invalid chars: starts with numbers
      }
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    // console.log("invalid expression:", expression);
    assert(expression === null);
  });

  it('test multiple groups with invalid variable names', async () => {
    const part1 = {
      "type": "condition",
      "operand1": "11height", // invalid, starts with numbers
      "operator": TiledeskExpression.OPERATORS.greaterThan.name,
      "operand2": {
        type: "const",
        value: "1"
      }
    }
    const part2 = {
      "type": "operator",
      "operator": TiledeskExpression.OPERATORS.AND.name
    }
    const part3 = {
      "type": "condition",
      "operand1": "name",
      "operator": TiledeskExpression.OPERATORS.startsWith.name,
      "operand2": {
        type: "const",
        value: "And"
      }
    }
    const part5 = {
      "type": "condition",
      "operand1": "size",
      "operator": TiledeskExpression.OPERATORS.equalAsNumbers.name,
      "operand2": {
        type: "const",
        value: "03"
      }
    }
    const part6 = {
      "type": "operator",
      "operator": TiledeskExpression.OPERATORS.AND.name
    }
    const part7 = {
      "type": "condition",
      "operand1": "name",
      "operator": TiledeskExpression.OPERATORS.equalAsStrings.name,
      "operand2": {
        type: "const",
        value: "Andrea"
      }
    }
    const group1 = {
      type: "expression",
      conditions: [ part1, part2, part3 ]
    }
    const group_operator = {
      "type": "operator",
      "operator": TiledeskExpression.OPERATORS.OR.name
    }
    const group2 = {
      type: "expression",
      conditions: [ part5, part6, part7 ]
    }
    const groups = [group1, group_operator, group2];
    const expression = TiledeskExpression.JSONGroupsToExpression(groups);
    console.log("invalid group expression:", expression);
    assert(expression === null);
  });
})

describe('Bugs', function() {
  
  it('should have to be true', () => {
    const group = {
      "type": "expression",
      "conditions": [{
        "type": "condition",
        "operand1": "score",
        "operator": "notEqualAsNumbers",
        "operand2": {
          "type": "const",
          "value": "5",
          "name": ""
        }
      }, {
        "type": "operator",
        "operator": "AND"
      }, {
        "type": "condition",
        "operand1": "score",
        "operator": "notEqualAsNumbers",
        "operand2": {
          "type": "const",
          "value": "10",
          "name": ""
        }
      }]
    }

    const expression = TiledeskExpression.JSONGroupToExpression(group);
    // console.log("expression:", expression);
    // assert(expression === '(Number($data.height) > Number("1") && String($data.name).startsWith(String("And")))');
    // const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    // console.log("result:", result);
    // assert(result === true);

  });

});