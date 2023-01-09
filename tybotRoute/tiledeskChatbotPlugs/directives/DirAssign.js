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
          condition: params.condition,
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
    const condition = action.body.condition;
    const assignTo = action.body.assignTo;
    if (!assignTo || !condition) {
      if (this.log) {console.log("Invalid condition or assignTo parameters");}
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
      console.error("(DirCondition) No this.context.tdcache");
    }
    const result = await this.evaluateCondition(condition, variables);
    if (this.log) {console.log("executed condition:", condition, "result:", result);}
    await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, variableName, value);
    console.log("Assigned:", value, "to", variableName);
  }

  async evaluateCondition(_condition, variables) {
    let condition = _condition.replace("$", "$data.");
    console.log("Evaluating expression:", condition);
    console.log("With variables:", variables);
    const result = new TiledeskExpression().evaluate(condition, variables);
    console.log("Expression result:", result);
    return result;
  }

  parseParams(directive_parameter) {
    let condition = null;
    let trueIntent = null;
    let falseIntent = null;
    const params = ms(directive_parameter);
    if (params.condition) {
      condition = params.condition
    }
    if (params.trueIntent) {
      trueIntent = params.trueIntent;
    }
    if (params.falseIntent) {
      falseIntent = params.falseIntent;
    }
    return {
      condition: condition,
      trueIntent: trueIntent,
      falseIntent: falseIntent
    }
  }

}

module.exports = { DirAssign };