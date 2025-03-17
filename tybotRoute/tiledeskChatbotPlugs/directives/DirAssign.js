const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskExpression } = require('../../TiledeskExpression');
const ms = require('minimist-string');
const { Filler } = require('../Filler');
const winston = require('../../utils/winston')

class DirAssign {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.log = context.log;
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
      if (this.log) {
        winston.debug("(DirAssign) Assigned: " + variableName + " = " + value);
        const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
        for (const [key, value] of Object.entries(all_parameters)) {
          const value_type = typeof value;
          winston.debug("(DirAssign) request parameter: " + key + " value: " + value + " type: " + value_type)
        }
      }

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
    const params = ms(directive_parameter);
    if (params.expression !== null) {
      expression = params.expression
    }
    if (params.assignTo !== null) {
      assignTo = params.assignTo;
    }
    return {
      expression: expression,
      assignTo: assignTo
    }
  }

}

module.exports = { DirAssign };