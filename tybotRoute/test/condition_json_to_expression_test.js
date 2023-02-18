var assert = require('assert');
const exp = require('constants');
const { TiledeskExpression } = require('../TiledeskExpression');

describe('JSON to expression', function() {
  
  it('test condition operand lessThan (false)', async () => {
    const condition = {
      "type": "condition",
      "operand1": "age",
      "operator": TiledeskExpression.OPERATORS.lessThan.name,
      "operand2": "10"
    }
    const vars = {
      age: 12
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
    assert(expression === 'Number($data.age) < Number("10")');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    assert(result === false);
  });

  it('test condition operand lessThan (true)', async () => {
    const condition = {
      "type": "condition",
      "operand1": "age",
      "operator": TiledeskExpression.OPERATORS.lessThan.name,
      "operand2": "12"
    }
    
    const vars = {
      age: 10
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
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
      "operand2": "10"
    }
    const vars = {
      age: 12
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
    assert(expression === 'Number($data.age) > Number("10")');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    // console.log("result:", result);
    assert(result === true);
  });

  // it('test condition operand startsWith (true)', async () => {
  //   const condition = {
  //     "type": "condition",
  //     "operand1": "Andrea",
  //     "operator": TiledeskExpression.OPERATORS.startsWith.name,
  //     "operand2": "And"
  //   }
    
  //   const expression = TiledeskExpression.JSONConditionToExpression(condition);
  //   assert(expression === "String(\"" + condition.operand1 + "\").startsWith(String(\"" + condition.operand2 + "\"))");
  //   const result = new TiledeskExpression().evaluateStaticExpression(expression);
  //   // console.log("result:", result);
  //   assert(result === true);
  // });

  // it('test condition group in "and" (true)', async () => {
  //   const part1 = {
  //     "type": "condition",
  //     "operand1": "2",
  //     "operator": TiledeskExpression.OPERATORS.greaterThan.name,
  //     "operand2": "1"
  //   }

  //   const part2 = {
  //     "type": "operator",
  //     "operatorName": TiledeskExpression.OPERATORS.AND.name
  //   }

  //   const part3 = {
  //     "type": "condition",
  //     "operand1": "Andrea",
  //     "operator": TiledeskExpression.OPERATORS.startsWith.name,
  //     "operand2": "And"
  //   }

  //   const group = {
  //     type: "expression",
  //     conditions: [ part1, part2, part3 ]
  //   }
    
  //   const expression = TiledeskExpression.JSONGroupToExpression(group);
  //   // console.log("expression:", expression);
  //   assert(expression === "(" + "Number(\"2\") > Number(\"1\") && String(\"Andrea\").startsWith(String(\"And\"))" + ")");
  //   const result = new TiledeskExpression().evaluateStaticExpression(expression);
  //   // console.log("result:", result);
  //   assert(result === true);
  // });

  // it('test condition group in "and" (false)', async () => {
  //   const part1 = {
  //     "type": "condition",
  //     "operand1": "1",
  //     "operator": TiledeskExpression.OPERATORS.greaterThan.name,
  //     "operand2": "2"
  //   }

  //   const part2 = {
  //     "type": "operator",
  //     "operatorName": TiledeskExpression.OPERATORS.AND.name
  //   }

  //   const part3 = {
  //     "type": "condition",
  //     "operand1": "Andrea",
  //     "operator": TiledeskExpression.OPERATORS.startsWith.name,
  //     "operand2": "Ond"
  //   }

  //   const group = {
  //     conditions: [ part1, part2, part3 ]
  //   }
    
  //   const expression = TiledeskExpression.JSONGroupToExpression(group);
  //   // console.log("expression:", expression);
  //   assert(expression === "(" + "Number(\"1\") > Number(\"2\") && String(\"Andrea\").startsWith(String(\"Ond\"))" + ")");
  //   const result = new TiledeskExpression().evaluateStaticExpression(expression);
  //   // console.log("result:", result);
  //   assert(result === false);
  // });

  // it('test multiple conditions group (true)', async () => {
  //   const part1 = {
  //     "type": "condition",
  //     "operand1": "2",
  //     "operator": TiledeskExpression.OPERATORS.greaterThan.name,
  //     "operand2": "1"
  //   }

  //   const part2 = {
  //     "type": "operator",
  //     "operatorName": TiledeskExpression.OPERATORS.AND.name
  //   }

  //   const part3 = {
  //     "type": "condition",
  //     "operand1": "Andrea",
  //     "operator": TiledeskExpression.OPERATORS.startsWith.name,
  //     "operand2": "And"
  //   }

  //   const part4 = {
  //     "type": "operator",
  //     "operatorName": TiledeskExpression.OPERATORS.OR.name
  //   }

  //   const part5 = {
  //     "type": "condition",
  //     "operand1": "3",
  //     "operator": TiledeskExpression.OPERATORS.equalAsNumbers.name,
  //     "operand2": "03"
  //   }

  //   const part6 = {
  //     "type": "operator",
  //     "operatorName": TiledeskExpression.OPERATORS.AND.name
  //   }

  //   const part7 = {
  //     "type": "condition",
  //     "operand1": "Andrea",
  //     "operator": TiledeskExpression.OPERATORS.equalAsStrings.name,
  //     "operand2": "Andrea"
  //   }

  //   const group = {
  //     conditions: [ part1, part2, part3, part4, part5, part6, part7 ]
  //   }
    
  //   const expression = TiledeskExpression.JSONGroupToExpression(group);
  //   // console.log("expression:", expression);
  //   assert(expression === '(Number("2") > Number("1") && String("Andrea").startsWith(String("And")) || Number("3") === Number("03") && String("Andrea") === String("Andrea"))');
  //   const result = new TiledeskExpression().evaluateStaticExpression(expression);
  //   // console.log("result:", result);
  //   assert(result === true);
  // });

  // it('test multiple groups (true)', async () => {
  //   const part1 = {
  //     "type": "condition",
  //     "operand1": "2",
  //     "operator": TiledeskExpression.OPERATORS.greaterThan.name,
  //     "operand2": "1"
  //   }

  //   const part2 = {
  //     "type": "operator",
  //     "operatorName": TiledeskExpression.OPERATORS.AND.name
  //   }

  //   const part3 = {
  //     "type": "condition",
  //     "operand1": "Andrea",
  //     "operator": TiledeskExpression.OPERATORS.startsWith.name,
  //     "operand2": "And"
  //   }

  //   const part5 = {
  //     "type": "condition",
  //     "operand1": "3",
  //     "operator": TiledeskExpression.OPERATORS.equalAsNumbers.name,
  //     "operand2": "03"
  //   }

  //   const part6 = {
  //     "type": "operator",
  //     "operatorName": TiledeskExpression.OPERATORS.AND.name
  //   }

  //   const part7 = {
  //     "type": "condition",
  //     "operand1": "Andrea",
  //     "operator": TiledeskExpression.OPERATORS.equalAsStrings.name,
  //     "operand2": "Andrea"
  //   }

  //   const group1 = {
  //     type: "expression",
  //     conditions: [ part1, part2, part3 ]
  //   }

  //   const group_operator = {
  //     "type": "operator",
  //     "operatorName": TiledeskExpression.OPERATORS.OR.name
  //   }

  //   const group2 = {
  //     type: "expression",
  //     conditions: [ part5, part6, part7 ]
  //   }

  //   const groups = [group1, group_operator, group2];
    
  //   const expression = TiledeskExpression.JSONGroupsToExpression(groups);
  //   // console.log("full expression:", expression);
  //   assert(expression === '(Number("2") > Number("1") && String("Andrea").startsWith(String("And"))) || (Number("3") === Number("03") && String("Andrea") === String("Andrea"))');
  //   const result = new TiledeskExpression().evaluateStaticExpression(expression);
  //   // console.log("result:", result);
  //   assert(result === true);
  // });

  // it('test multiple groups with one condition and one group (true)', async () => {
  //   const part1 = {
  //     "type": "condition",
  //     "operand1": "2",
  //     "operator": TiledeskExpression.OPERATORS.greaterThan.name,
  //     "operand2": "1"
  //   }

  //   const group1 = {
  //     type: "expression",
  //     conditions: [ part1 ]
  //   }

  //   const groups = [group1];
    
  //   const expression = TiledeskExpression.JSONGroupsToExpression(groups);
  //   // console.log("full expression:", expression);
  //   assert(expression === '(Number("2") > Number("1"))');
  //   const result = new TiledeskExpression().evaluateStaticExpression(expression);
  //   // console.log("result:", result);
  //   assert(result === true);
  // });

  // it('test multiple groups with one condition and one group (false)', async () => {
  //   const part1 = {
  //     "type": "condition",
  //     "operand1": "2",
  //     "operator": TiledeskExpression.OPERATORS.lessThan.name,
  //     "operand2": "1"
  //   }

  //   const group1 = {
  //     type: "expression",
  //     conditions: [ part1 ]
  //   }

  //   const groups = [group1];
    
  //   const expression = TiledeskExpression.JSONGroupsToExpression(groups);
  //   // console.log("full expression:", expression);
  //   assert(expression === '(Number("2") < Number("1"))');
  //   const result = new TiledeskExpression().evaluateStaticExpression(expression);
  //   // console.log("result:", result);
  //   assert(result === false);
  // });

  // it('test variables, all set', async () => {
  //   const part1 = {
  //     "type": "condition",
  //     "operand1": "$a",
  //     "operator": TiledeskExpression.OPERATORS.lessThan.name,
  //     "operand2": "$b"
  //   }

  //   const group1 = {
  //     type: "expression",
  //     conditions: [ part1 ]
  //   }

  //   const variables = {
  //     "a": "1",
  //     "b": "2"
  //   }

  //   const groups = [group1];
    
  //   const expression = TiledeskExpression.JSONGroupsToExpression(groups, variables);
  //   // console.log("full expression:", expression);
  //   assert(expression === '(Number("1") < Number("2"))');
  //   const result = new TiledeskExpression().evaluateStaticExpression(expression);
  //   // console.log("result:", result);
  //   assert(result === true);
  // });

  // it('test variables, some not set', async () => {
  //   const part1 = {
  //     "type": "condition",
  //     "operand1": "$a",
  //     "operator": TiledeskExpression.OPERATORS.lessThan.name,
  //     "operand2": "$b"
  //   }

  //   const group1 = {
  //     type: "expression",
  //     conditions: [ part1 ]
  //   }

  //   const variables = {
  //     // "a": "1",
  //     "b": "2"
  //   }

  //   const groups = [group1];
    
  //   const expression = TiledeskExpression.JSONGroupsToExpression(groups, variables);
  //   // console.log("full expression:", expression);
  //   assert(expression === '(Number("$a") < Number("2"))');
  //   const result = new TiledeskExpression().evaluateStaticExpression(expression);
  //   // console.log("result:", result);
  //   assert(result === false);
  // });

 
  // Struct
  //   const expression = {
  //     groups: [
  //       {
  //         type: "expression",
  //         conditions: [
  //           {
  //             type: "condition",
  //             "operand1": "age",
  //             "operator": TiledeskExpression.OPERATORS.lessThan,
  //             "operand2": "10"
  //           },
  //           {
  //             type: "operator",
  //             operator: "OR"
  //           },
  //           { type: "condition", ...}
  //         ]
  //       },
  //       {
  //         type: "operator",
  //         operator: "AND"
  //       },
  //       { type: "expression", ...}
  //     ]
  //   };

    
});



