const { DirIntent } = require('./DirIntent');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskExpression } = require('../../TiledeskExpression');
const ms = require('minimist-string');

class DirAssign {

  constructor(context) {
    if (!context) {
      throw new Error('config (TiledeskClient) object is mandatory.');
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
      action = {
        body: {
          expression: params.expression,
          assignTo: params.assignTo
        }
      }
    }
    else {
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    });
  }

  async go(action, callback) {
    const expression = action.body.expression;
    const assignTo = action.body.assignTo;
    if (!assignTo || !expression) {
      if (this.log) {console.log("Invalid expression or assignTo parameters");}
      callback();
      return;
    }
    
    if (this.context.tdcache) {
      if (this.log) {
        console.log("this.requestId:", this.context.requestId);
        variables = 
        await TiledeskChatbot.allParametersStatic(
          this.context.tdcache, this.context.requestId
        );
        console.log("Variables:", variables)
      }
    }
    else {
      console.error("(DirAssign) No this.context.tdcache");
    }
    const result = await this.evaluateExpression(expression, variables);
    if (this.log) {console.log("executed expression:", expression, "result:", result);}
    await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, variableName, value);
    console.log("Assigned:", value, "to", variableName);
  }

  async evaluateExpression(_expression, variables) {
    let expression = _expression.replace("$", "$data.");
    console.log("Evaluating expression:", expression);
    console.log("With variables:", variables);
    const result = new TiledeskExpression().evaluate(expression, variables);
    console.log("Expression result:", result);
    return result;
  }

  parseParams(directive_parameter) {
    let expression = null;
    let assignTo = null;
    const params = ms(directive_parameter);
    if (params.expression) {
      expression = params.expression
    }
    if (params.assignTo) {
      assignTo = params.assignTo;
    }
    return {
      expression: expression,
      assignTo: assignTo
    }
  }

}

module.exports = { DirAssign };