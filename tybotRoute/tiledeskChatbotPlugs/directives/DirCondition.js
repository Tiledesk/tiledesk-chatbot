const { DirIntent } = require('./DirIntent');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskExpression } = require('../../TiledeskExpression');
const ms = require('minimist-string');
const winston = require('../../utils/winston');

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
    winston.verbose("Execute Condition directive");
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
      winston.warn("DirCondition Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    });
    
  }

  async go(action, callback) {
    winston.debug("(DirCondition) Action: ", action);
    const scriptCondition = action.scriptCondition;
    const jsonCondition = action.jsonCondition;
    winston.debug("(DirCondition) scriptCondition:", scriptCondition);
    winston.debug("(DirCondition) jsonCondition:", jsonCondition);

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
    winston.debug("(DirCondition) condition action: ", action);
    if (!trueIntent && !falseIntent) {
      winston.error("(DirCondition) Invalid condition, no intents specified");
      callback();
      return;
    }
    if (scriptCondition === null && jsonCondition === null) {
      winston.error("(DirCondition) Invalid condition, scriptCondition & jsonCondition null");
      callback();
      return;
    }
    if (scriptCondition !== null && scriptCondition.trim === "") {
      winston.error("(DirCondition) Invalid condition, scriptCondition is empty");
      callback();
      return;
    }
    else if (jsonCondition && jsonCondition.groups === null) {
      winston.error("(DirCondition) Invalid jsonCondition, no groups:", jsonCondition);
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
      winston.debug("(DirCondition) Variables:", variables)
    }
    else {
      winston.error("(DirCondition) No this.context.tdcache");
    }
    winston.debug("(DirCondition) condition:", scriptCondition);
    // const result = await this.evaluateCondition(scriptCondition, variables);
    let result;
    if (scriptCondition) {
      // result = this.evaluateCondition(scriptCondition, variables);
      result = new TiledeskExpression().evaluateExpression(scriptCondition, variables)
    }
    else if (jsonCondition) {
      const expression = TiledeskExpression.JSONGroupsToExpression(jsonCondition.groups, variables);
      result = new TiledeskExpression().evaluateStaticExpression(expression);
    }
    winston.debug("(DirCondition) executed condition: " + JSON.stringify(scriptCondition) + " result: " + JSON.stringify(result));
    if (result === true) {
      if (trueIntentDirective) {
        this.intentDir.execute(trueIntentDirective, () => {
          callback(stopOnConditionMet);
        });
      }
      else {
        winston.debug("(DirCondition) No trueIntentDirective specified");
        callback();
        return;
      }
    }
    else {
      if (falseIntentDirective) {
        this.intentDir.execute(falseIntentDirective, () => {
          callback(stopOnConditionMet);
        });
      }
      else {
        winston.debug("(DirCondition) No falseIntentDirective specified");
        callback();
        return;
      }
    }
  }

  // async evaluateCondition(_condition, variables) {
  //   let condition = _condition.replace("$", "$data.");
  //   const result = new TiledeskExpression().evaluate(condition, variables)
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