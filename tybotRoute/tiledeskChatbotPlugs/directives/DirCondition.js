const { DirIntent } = require('./DirIntent');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskExpression } = require('../../TiledeskExpression');
const winston = require('../../utils/winston');
const { Logger } = require('../../Logger');

class DirCondition {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.requestId = this.context.requestId;
    
    this.intentDir = new DirIntent(context);
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    winston.verbose("Execute Condition directive");
    let action;
    if (directive.action) {
      action = directive.action
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirCondition Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Condition] Executed");
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
      this.logger.error("[Condition] Invalid condition, no intents specified");
      winston.error("(DirCondition) Invalid condition, no intents specified");
      callback();
      return;
    }
    if (scriptCondition === null && jsonCondition === null) {
      this.logger.error("[Condition] Invalid condition, scriptCondition & jsonCondition null");
      winston.error("(DirCondition) Invalid condition, scriptCondition & jsonCondition null");
      callback();
      return;
    }
    if (scriptCondition !== null && scriptCondition.trim === "") {
      this.logger.error("[Condition] Invalid condition, scriptCondition is empty");
      winston.error("(DirCondition) Invalid condition, scriptCondition is empty");
      callback();
      return;
    }
    else if (jsonCondition && jsonCondition.groups === null) {
      this.logger.error("[Condition] Invalid jsonCondition, no groups");
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
        this.logger.native("[Condition] No trueIntentDirective specified");
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
        this.logger.native("[Condition] No falseIntentDirective specified");
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

}

module.exports = { DirCondition };