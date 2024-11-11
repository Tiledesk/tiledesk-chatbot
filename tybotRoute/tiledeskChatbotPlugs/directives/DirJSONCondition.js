const { DirIntent } = require('./DirIntent');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskExpression } = require('../../TiledeskExpression');

class DirJSONCondition {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.chatbot = context.chatbot;
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
    // this.tdclient = new TiledeskClient({
    //   projectId: context.projectId,
    //   token: context.token,
    //   APIURL: context.TILEDESK_APIURL,
    //   APIKEY: "___",
    //   log: context.log
    // });
    this.chatbot = context.chatbot;
    this.intentDir = new DirIntent(context);
    //   {
    //     API_ENDPOINT: context.TILEDESK_APIURL,
    //     TILEBOT_ENDPOINT: context.TILEBOT_ENDPOINT,
    //     supportRequest: context.supportRequest,
    //     token: context.token,
    //     log: context.log
    //   }
    // );
    this.log = context.log;
  }

  execute(directive, callback) {
    // console.log("Condition...")
    let action;
    if (directive.action) {
      action = directive.action
    }
    else {
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    });
    
  }

  async go(action, callback) {
    // const groups = action.jsonCondition.groups;
    const groups = action.groups; // NEXT
    const trueIntent = action.trueIntent;
    const falseIntent = action.falseIntent;
    const trueIntentAttributes = action.trueIntentAttributes;
    const falseIntentAttributes = action.falseIntentAttributes;
    let stopOnConditionMet = true; //action.stopOnConditionMet;
    if (this.log) {console.log("groups:", JSON.stringify(groups));}
    if (trueIntent && trueIntent.trim() === "") {
      trueIntent = null;
    }
    if (falseIntent && falseIntent.trim() === "") {
      falseIntent = null;
    }
    if (!trueIntent && !falseIntent) {
      if (this.log) {console.log("Invalid jsonCondition, no intents specified");}
      callback();
      return;
    }
    else if (groups === null) {
      if (this.log) {console.log("Invalid jsonCondition, no groups.");}
      callback();
      return;
    }
    let trueIntentDirective = null;
    if (trueIntent) {
      trueIntentDirective = DirIntent.intentDirectiveFor(trueIntent, trueIntentAttributes);
    }
    let falseIntentDirective = null;
    if (falseIntent) {
      falseIntentDirective = DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes);
    }
    let variables = null;
    if (this.context.tdcache) {
      variables = 
      await TiledeskChatbot.allParametersStatic(
        this.context.tdcache, this.context.requestId
      );
      if (this.log) {console.log("Variables:", JSON.stringify(variables))}
    }
    else {
      console.error("(DirJSONCondition) No this.context.tdcache");
    }
    // const result = await this.evaluateCondition(scriptCondition, variables);
    let result;
    const expression = TiledeskExpression.JSONGroupsToExpression(groups, variables);
    // console.log("full json condition expression:", expression);
    result = new TiledeskExpression().evaluateStaticExpression(expression, variables);
    if (this.log) {console.log("executed condition:", expression, "result:", result);}
    if (result === true) {
      if (trueIntentDirective) {
        this.intentDir.execute(trueIntentDirective, () => {
          // console.log("result === true. stopOnConditionMet?", stopOnConditionMet);
          callback(stopOnConditionMet);
        });
      }
      else {
        if (this.log) {console.log("No trueIntentDirective specified");}
        callback();
        return;
      }
    }
    else {
      if (result === null) {
        await this.chatbot.addParameter("flowError", "An error occurred evaluating condition: result === null");
      }
      if (falseIntentDirective) {
        this.intentDir.execute(falseIntentDirective, () => {
          // console.log("result === false. stopOnConditionMet?", stopOnConditionMet);
          callback(stopOnConditionMet);
        });
      }
      else {
        if (this.log) {console.log("No falseIntentDirective specified");}
        callback();
        return;
      }
    }
  }

}

module.exports = { DirJSONCondition };