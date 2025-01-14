const { DirIntent } = require('./DirIntent');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskExpression } = require('../../TiledeskExpression');
const ms = require('minimist-string');

class DirCondition {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.intentDir = new DirIntent(context);
    this.log = context.log;
  }

  execute(directive, callback) {
    // console.log("Condition...")
    let action;
    if (directive.action) {
      action = directive.action
    }
    else if (directive.parameter) {
      let params;
      params = this.parseParams(directive.parameter);
      if (!params.condition) {
        callback();
        return;
      }
      action = {
        scriptCondition: params.condition,
        trueIntent: params.trueIntent,
        falseIntent: params.falseIntent
      }
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
    const scriptCondition = action.scriptCondition;
    const jsonCondition = action.jsonCondition;
    if (this.log) {console.log("scriptCondition:", scriptCondition);}
    if (this.log) {console.log("jsonCondition:", JSON.stringify(jsonCondition));}
    // const condition = action.condition;
    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let stopOnConditionMet = action.stopOnConditionMet;
    if (trueIntent && trueIntent.trim() === "") {
      trueIntent = null;
    }
    if (falseIntent && falseIntent.trim() === "") {
      falseIntent = null;
    }
    if (this.log) {console.log("condition action:", action);}
    if (!trueIntent && !falseIntent) {
      if (this.log) {console.log("Invalid condition, no intents specified");}
      callback();
      return;
    }
    if (scriptCondition === null && jsonCondition === null) {
      if (this.log) {console.log("Invalid condition, scriptCondition & jsonCondition null");}
      callback();
      return;
    }
    if (scriptCondition !== null && scriptCondition.trim === "") {
      if (this.log) {console.log("Invalid condition, scriptCondition is empty");}
      callback();
      return;
    }
    else if (jsonCondition && jsonCondition.groups === null) {
      if (this.log) {console.log("Invalid jsonCondition, no groups:", JSON.stringify(jsonCondition));}
      callback();
      return;
    }
    let trueIntentDirective = null;
    if (trueIntent) {
      trueIntentDirective = DirIntent.intentDirectiveFor(trueIntent);
    }
    let falseIntentDirective = null;
    if (falseIntent) {
      falseIntentDirective = DirIntent.intentDirectiveFor(falseIntent);
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
      console.error("(DirCondition) No this.context.tdcache");
    }
    if (this.log) {console.log("condition:", scriptCondition);}
    // const result = await this.evaluateCondition(scriptCondition, variables);
    let result;
    if (scriptCondition) {
      // result = this.evaluateCondition(scriptCondition, variables);
      result = new TiledeskExpression().evaluateExpression(scriptCondition, variables)
    }
    else if (jsonCondition) {
      const expression = TiledeskExpression.JSONGroupsToExpression(jsonCondition.groups, variables);
      // console.log("full json condition expression:", expression);
      result = new TiledeskExpression().evaluateStaticExpression(expression);
    }
    if (this.log) {console.log("executed condition:", scriptCondition, "result:", result);}
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

  // async evaluateCondition(_condition, variables) {
  //   let condition = _condition.replace("$", "$data.");
  //   if (this.log) {
  //     console.log("Evaluating expression:", condition);
  //     console.log("With variables:", variables);
  //   }
  //   const result = new TiledeskExpression().evaluate(condition, variables)
  //   if (this.log) {
  //     console.log("Expression result:", result);
  //   }
  //   return result;
  // }

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

module.exports = { DirCondition };