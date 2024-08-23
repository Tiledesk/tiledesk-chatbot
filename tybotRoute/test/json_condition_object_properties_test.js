var assert = require('assert');
const exp = require('constants');
const { TiledeskExpression } = require('../TiledeskExpression');

describe('JSON to expression', function() {

  it('test condition operand number property equal to (false)', async () => {
    const condition = {
      "type": "condition",
      "operand1": "person.cnn",
      "operator": TiledeskExpression.OPERATORS.equalAsNumbers.name,
      "operand2": {
        type: "const",
        value: "10"
      }
    }
    const vars = {
      person: {
        cnn: 10
      }
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
    assert(expression === 'Number($data.person.cnn) === Number("10")');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    assert(result === true);
  });

  it('test condition operand array (true)', async () => {
    const condition = {
      "type": "condition",
      "operand1": "persons[0].cnn",
      "operator": TiledeskExpression.OPERATORS.equalAsNumbers.name,
      "operand2": {
        type: "const",
        value: "10"
      }
    }
    const vars = {
      persons: [{
        cnn: 10
      }]
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
    assert(expression === 'Number($data.persons[0].cnn) === Number("10")');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    assert(result === true);
  });

  it('test condition operand array last element (true)', async () => {
    const condition = {
      "type": "condition",
      "operand1": "persons[persons.length - 1].cnn",
      "operator": TiledeskExpression.OPERATORS.equalAsNumbers.name,
      "operand2": {
        type: "var",
        value: "10",
        name: "owner.cnn"
      }
    }
    const vars = {
      persons: [
        {
          cnn: 10
        },
        {
          cnn: 10
        }
      ],
      owner: {
        cnn: 10
      }
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
    assert(expression === 'Number($data.persons[persons.length - 1].cnn) === Number($data.owner.cnn)');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    assert(result === true);
  });

  it('test condition operand array last element (true)', async () => {
    const condition = {
      "type": "condition",
      "operand1": "persons[persons.length - 1].cnn",
      "operator": TiledeskExpression.OPERATORS.equalAsNumbers.name,
      "operand2": {
        type: "var",
        value: "10",
        name: "owner.cnn"
      }
    }
    const vars = {
      persons: [
        {
          cnn: 10
        },
        {
          cnn: 10
        }
      ],
      owner: {
        cnn: 12
      }
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
    assert(expression === 'Number($data.persons[persons.length - 1].cnn) === Number($data.owner.cnn)');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    assert(result === false);
  });

  it('test condition operand try a var as const (true)', async () => {
    const condition = {
      "type": "condition",
      "operand1": "persons[persons.length - 1].cnn",
      "operator": TiledeskExpression.OPERATORS.equalAsNumbers.name,
      "operand2": {
        type: "var",
        value: "10",
        name: "persons[0].cnn"
      }
    }
    const vars = {
      persons: [
        {
          cnn: 10
        },
        {
          cnn: 10
        }
      ]
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
    assert(expression === 'Number($data.persons[persons.length - 1].cnn) === Number($data.persons[0].cnn)');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    assert(result === true);
  });

  it('test condition operand second operand property not defined (cnn)', async () => {
    const condition = {
      "type": "condition",
      "operand1": "persons[persons.length - 1].cnn",
      "operator": TiledeskExpression.OPERATORS.equalAsNumbers.name,
      "operand2": {
        type: "var",
        value: "10",
        name: "persons[0].cnn" // !defined
      }
    }
    const vars = {
      persons: [
        {
          name: "Andrea"
        },
        {
          cnn: 10
        }
      ]
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
    assert(expression === 'Number($data.persons[persons.length - 1].cnn) === Number($data.persons[0].cnn)');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    assert(result === false);
  });

  it('test condition operand first proerty undefined (cnn)', async () => {
    const condition = {
      "type": "condition",
      "operand1": "persons[0].cnn",
      "operator": TiledeskExpression.OPERATORS.isUndefined.name,
      "operand2": { // null operand
        type: "const"
      }
    }
    const vars = {
      persons: [
        {
          name: "Andrea"
        }
      ]
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
    assert(expression === '$data.persons[0].cnn === undefined');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    assert(result === true);
  });

  it('test condition operand first proerty undefined (cnn)', async () => {
    const condition = {
      "type": "condition",
      "operand1": "persona",
      "operator": TiledeskExpression.OPERATORS.isUndefined.name,
      "operand2": { // null operand
        type: "const"
      }
    }
    const vars = {
      persons: [
        {
          name: "Andrea"
        }
      ]
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
    assert(expression === '$data.persona === undefined');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    assert(result === true);
  });

  it('test condition operand operand1 undefined and checking for property anyway using ? operator: persona?.age', async () => {
    const condition = {
      "type": "condition",
      "operand1": "persona?.age", // doesn't exist
      "operator": TiledeskExpression.OPERATORS.isUndefined.name,
      "operand2": { // null operand
        type: "const"
      }
    }
    const vars = {
      persons: [
        {
          name: "Andrea"
        }
      ]
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
    assert(expression === '$data.persona?.age === undefined');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    assert(result === true);
  });

  it('test condition operand1 null', async () => {
    const condition = {
      "type": "condition",
      "operand1": "persons",
      "operator": TiledeskExpression.OPERATORS.isNull.name,
      "operand2": { // null operand
        type: "const"
      }
    }
    const vars = {
      persons: null
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
    assert(expression === '$data.persons === null');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    assert(result === true);
  });

  it('test condition operand1 undefined if no attributes', async () => {
    const condition = {
      "type": "condition",
      "operand1": "persons",
      "operator": TiledeskExpression.OPERATORS.isUndefined.name,
      "operand2": { // null operand
        type: "const"
      }
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
    assert(expression === '$data.persons === undefined');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, null);
    assert(result === true);
  });

  it('test condition operand1 bad syntax', async () => {
    const condition = {
      "type": "condition",
      "operand1": "andrea[].{",
      "operator": TiledeskExpression.OPERATORS.isUndefined.name,
      "operand2": {
        type: "const"
      }
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
    assert(expression === '$data.andrea[].{ === undefined');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, null);
    console.log("result:", result);
    assert(result === null);
  });

  it('test condition operand2 bad syntax', async () => {
    const condition = {
      "type": "condition",
      "operand1": "varName",
      "operator": TiledeskExpression.OPERATORS.equalAsNumbers.name,
      "operand2": {
        type: "var",
        name: "var[].{"
      }
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
    assert(expression === 'Number($data.varName) === Number($data.var[].{)');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, null);
    console.log("result:", result);
    assert(result === null);
  });

  it('test condition operand2 const & var properties (const.value & var.name) co-living', async () => {
    const condition = {
      "type": "condition",
      "operand1": "varName",
      "operator": TiledeskExpression.OPERATORS.equalAsNumbers.name,
      "operand2": {
        type: "var",
        value: "10",
        name: "age"
      }
    }
    const vars = {
      varName: 10,
      age: 10
    }
    const expression = TiledeskExpression.JSONConditionToExpression(condition);
    console.log("expression:", expression);
    assert(expression === 'Number($data.varName) === Number($data.age)');
    const result = new TiledeskExpression().evaluateStaticExpression(expression, vars);
    console.log("result:", result);
    assert(result === true);
  });

});