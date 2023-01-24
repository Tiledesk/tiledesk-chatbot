const { DirIntent } = require('./DirIntent');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskExpression } = require('../../TiledeskExpression');
const ms = require('minimist-string');
const { Filler } = require('../Filler');

class DirAssign {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    // let context =  {
    //   projectId: projectId,
    //   token: token,
    //   supportRequest: supportRequest,
    //   requestId: supportRequest.request_id,
    //   TILEDESK_APIURL: API_URL,
    //   TILEBOT_ENDPOINT:TILEBOT_ENDPOINT,
    //   departmentId: depId,
    //   tdcache: tdcache,
    //   log: false
    // }
    this.log = context.log;
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action
    }
    else if (directive.parameter) {
      let params;
      params = this.parseParams(directive.parameter);
      // console.log("DirAssign params:", params);
      action = {
        expression: params.expression,
        assignTo: params.assignTo
      }
      // console.log("DirAssign action:", action);
    }
    else {
      callback();
      return;
    }
    // console.log("go DirAssign with action:", action);
    this.go(action, () => {
      callback();
    });
  }

  async go(action, callback) {
    // console.log("DirAssign action processing:", action)
    // const expression = action.body.expression;
    // const assignTo = action.body.assignTo;
    const expression = action.expression;
    const assignTo = action.assignTo;
    if (assignTo === null || expression === null) {
      if (this.log) {console.log("Invalid expression or assignTo parameters");}
      callback();
      return;
    }

    if (this.context.tdcache) {
      if (this.log) {console.log("(DirAssign) this.requestId:", this.context.requestId);}
      let variables =
        await TiledeskChatbot.allParametersStatic(
          this.context.tdcache, this.context.requestId);
      // filling
      let variableName;
      const filler = new Filler();
      // console.log("assign variable name:", variableName);
      variableName = filler.fill(assignTo, variables);
      // console.log("assign variable name (after filling):", variableName);
      
      if (this.log) {console.log("(DirAssign) Variables:", JSON.stringify(variables));}
      const value = await new TiledeskExpression().evaluateExpression(expression, variables);
      if (this.log) {console.log("(DirAssign) executed expression:", expression, "value:", value);}
      await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, variableName, value);
      if (this.log) {
        console.log("(DirAssign) Assigned:", value, "to", variableName);
        const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
        for (const [key, value] of Object.entries(all_parameters)) {
          const value_type = typeof value;
          if (chatbot.log) {console.log("(DirAssign) request parameter:", key, "value:", value, "type:", value_type)}
        }
      }

      callback();
    }
    else {
      console.error("(DirAssign) No this.context.tdcache");
      callback();
    }
  }

  // async evaluateExpression(_expression, variables) {
  //   let expression = _expression.replace("$", "$data.");
  //   console.log("Evaluating expression:", expression);
  //   console.log("With variables:", variables);
  //   const result = new TiledeskExpression().evaluate(expression, variables);
  //   console.log("Expression result:", result);
  //   return result;
  // }

  parseParams(directive_parameter) {
    // console.log("Parsing directive_parameter:", directive_parameter);
    let expression = null;
    let assignTo = null;
    const params = ms(directive_parameter);
    // console.log("params dirassign:", params)
    if (params.expression !== null) {
      // console.log("go expression:", params.expression)
      expression = params.expression
      // console.log("got it expression:", expression)
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