const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskExpression } = require('../../TiledeskExpression');
const { Filler } = require('../Filler');
const { parseArgsStringToArgv } = require('string-argv');
const minimist = require('minimist');
const winston = require('../../utils/winston')

class DirAssign {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
  }

  execute(directive, callback) {
    winston.verbose("Execute Assign directive");
    let action;
    if (directive.action) {
      action = directive.action
    }
    else if (directive.parameter) {
      let params;
      params = this.parseParams(directive.parameter);
      action = {
        expression: params.expression,
        assignTo: params.assignTo
      }
    }
    else {
      winston.warn("Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    });
  }

  async go(action, callback) {
    winston.debug("(DirAssign) Action: ", action);
    const expression = action.expression;
    const assignTo = action.assignTo;
    if (assignTo === null || expression === null) {
      winston.warn("Invalid expression or assignTo parameters");
      callback();
      return;
    }

    if (this.context.tdcache) {
      winston.debug("(DirAssign) this.requestId: " + this.context.requestId);
      let variables =
        await TiledeskChatbot.allParametersStatic(
          this.context.tdcache, this.context.requestId);
      // filling
      let variableName;
      const filler = new Filler();
      variableName = filler.fill(assignTo, variables);
      
      winston.debug("(DirAssign) Variables: ", variables);
      // const value = await new TiledeskExpression().evaluateExpression(expression, variables);
      const value = new TiledeskExpression().evaluateExpression(expression, variables);
      winston.debug("(DirAssign) executed expression: " + expression + " value: " + value);
      await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, variableName, value);

      callback();
    }
    else {
      winston.error("(DirAssign) No this.context.tdcache");
      callback();
    }
  }

  // async evaluateExpression(_expression, variables) {
  //   let expression = _expression.replace("$", "$data.");
  //   const result = new TiledeskExpression().evaluate(expression, variables);
  //   return result;
  // }

  parseParams(directive_parameter) {
    let expression = null;
    let assignTo = null;
    const argv = parseArgsStringToArgv(directive_parameter); // trasforma in array come process.argv
    const params = minimist(argv); 
    if (params.expression !== null) {
      expression = params.expression
    }
    if (params.assignTo !== null) {
      assignTo = params.assignTo;
    }
    return {
      expression: params.expression,
      assignTo: params.assignTo
    };
  }

}

module.exports = { DirAssign };