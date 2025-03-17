const { DirIntent } = require('./DirIntent');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskExpression } = require('../../TiledeskExpression');
const winston = require('../../utils/winston');

class DirJSONCondition {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.chatbot = context.chatbot;
    this.chatbot = context.chatbot;
    this.intentDir = new DirIntent(context);
    this.log = context.log;
  }

  execute(directive, callback) {
    winston.verbose("Execute JSONCondition directive");
    let action;
    if (directive.action) {
      action = directive.action
    }
    else {
      winston.warn("DirJSONCondition Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    });
    
  }

  async go(action, callback) {
    winston.debug("(DirJSONCondition) Action: ", action);

    const groups = action.groups; // NEXT
    const trueIntent = action.trueIntent;
    const falseIntent = action.falseIntent;
    const trueIntentAttributes = action.trueIntentAttributes;
    const falseIntentAttributes = action.falseIntentAttributes;
    let stopOnConditionMet = true; //action.stopOnConditionMet;

    if (trueIntent && trueIntent.trim() === "") {
      trueIntent = null;
    }
    if (falseIntent && falseIntent.trim() === "") {
      falseIntent = null;
    }
    if (!trueIntent && !falseIntent) {
      winston.warn("(DirJSONCondition) Invalid jsonCondition, no intents specified");
      callback();
      return;
    }
    else if (groups === null) {
      winston.warn("(DirJSONCondition) Invalid jsonCondition, no groups.");
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
    }
    else {
      winston.error("(DirJSONCondition) No this.context.tdcache")
    }
    // const result = await this.evaluateCondition(scriptCondition, variables);
    let result;
    const expression = TiledeskExpression.JSONGroupsToExpression(groups, variables);

    result = new TiledeskExpression().evaluateStaticExpression(expression, variables);
    winston.debug("(DirJSONCondition) executed condition: ", expression);
    if (result === true) {
      if (trueIntentDirective) {
        this.intentDir.execute(trueIntentDirective, () => {
          callback(stopOnConditionMet);
        });
      }
      else {
        winston.debug("(DirJSONCondition) No trueIntentDirective specified");
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
          callback(stopOnConditionMet);
        });
      }
      else {
        winston.debug("(DirJSONCondition) No falseIntentDirective specified");
        callback();
        return;
      }
    }
  }

}

module.exports = { DirJSONCondition };