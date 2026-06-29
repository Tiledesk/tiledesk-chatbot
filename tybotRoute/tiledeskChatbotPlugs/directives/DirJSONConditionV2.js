const { DirIntent } = require('./DirIntent');
const { DirJSONCondition } = require('./DirJSONCondition');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskWhenExpression } = require('../../TiledeskWhenExpression');
const winston = require('../../utils/winston');
const { Logger } = require('../../Logger');

/**
 * DirJSONConditionV2
 *
 * Evaluates JSON conditions using the new `when` infix expression field, via the
 * safe (no-eval / no-vm2) TiledeskWhenExpression engine.
 *
 * Backward compatibility: if the action has NO `when` field, this directive
 * delegates to the legacy DirJSONCondition (left unchanged), so existing bots
 * keep working exactly as before.
 *
 * The callback contract matches the dispatcher (DirectivesChatbotPlug): the
 * callback is invoked with `stop` (truthy halts the directive chain) and is
 * guaranteed to be called EXACTLY ONCE on every path, including errors.
 */
class DirJSONConditionV2 {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.chatbot = context.chatbot;
    this.requestId = this.context.requestId;

    this.intentDir = new DirIntent(context);
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.intent_id || this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    winston.verbose("Execute JSONConditionV2 directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive);
      winston.warn("DirJSONConditionV2 Incorrect directive: ", directive);
      callback();
      return;
    }

    // Backward compatibility: without a `when` field, fall back to the legacy engine.
    const when = action.when;
    if (typeof when !== 'string' || when.trim() === "") {
      winston.verbose("(DirJSONConditionV2) No 'when' field, delegating to legacy DirJSONCondition");
      new DirJSONCondition(this.context).execute(directive, callback);
      return;
    }

    this.go(action, (stop) => {
      this.logger.native("[ConditionV2] Executed");
      callback(stop);
    }).catch((err) => {
      // Last-resort net: never leave the directive chain hanging.
      winston.error("(DirJSONConditionV2) Unhandled error in go(): " + (err && err.message));
      callback();
    });
  }

  async go(action, callback) {
    // Guarantee the callback fires exactly once, regardless of which branch/throw occurs.
    let finished = false;
    const done = (stop) => {
      if (finished) return;
      finished = true;
      callback(stop);
    };

    try {
      const when = action.when;
      let trueIntent = action.trueIntent;
      let falseIntent = action.falseIntent;
      const trueIntentAttributes = action.trueIntentAttributes;
      const falseIntentAttributes = action.falseIntentAttributes;
      // Decision: keep legacy behavior — always stop after a condition is met.
      const stopOnConditionMet = true; // action.stopOnConditionMet not honored yet (known limitation)

      if (trueIntent && trueIntent.trim() === "") trueIntent = null;
      if (falseIntent && falseIntent.trim() === "") falseIntent = null;

      if (!trueIntent && !falseIntent) {
        this.logger.warn("[ConditionV2] Invalid jsonCondition, no intents specified");
        winston.warn("(DirJSONConditionV2) Invalid jsonCondition, no intents specified");
        done();
        return;
      }

      const trueIntentDirective = trueIntent ? DirIntent.intentDirectiveFor(trueIntent, trueIntentAttributes) : null;
      const falseIntentDirective = falseIntent ? DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes) : null;

      // Load conversation variables (native-typed) from cache.
      let variables = {};
      if (this.context.tdcache) {
        variables = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId) || {};
      }
      else {
        winston.error("(DirJSONConditionV2) No this.context.tdcache — evaluating with empty variables");
      }

      // Evaluate the `when` expression safely. Engine errors -> result === null.
      let result;
      try {
        const value = new TiledeskWhenExpression().evaluate(when, variables);
        result = (value === null || value === undefined) ? null : Boolean(value);
      }
      catch (err) {
        winston.error("(DirJSONConditionV2) Error evaluating 'when' expression: " + (err && err.message));
        result = null;
      }
      this.logger.native("[ConditionV2] Evaluated 'when' result: " + result);
      winston.debug("(DirJSONConditionV2) Evaluation result: " + result);

      if (result === true) {
        if (trueIntentDirective) {
          this.intentDir.execute(trueIntentDirective, () => done(stopOnConditionMet));
        }
        else {
          this.logger.native("[ConditionV2] No trueIntentDirective specified");
          done();
        }
        return;
      }

      // result === false OR result === null (evaluation error)
      if (result === null) {
        this.logger.error("[ConditionV2] An error occurred evaluating the condition");
        if (this.context.tdcache) {
          await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, "flowError", "An error occurred evaluating condition (when)");
        }
      }
      if (falseIntentDirective) {
        this.intentDir.execute(falseIntentDirective, () => done(stopOnConditionMet));
      }
      else {
        this.logger.native("[ConditionV2] No falseIntentDirective specified");
        done();
      }
    }
    catch (err) {
      winston.error("(DirJSONConditionV2) Unexpected error in go(): " + (err && err.message));
      done(); // advance the chain rather than hang
    }
  }

}

module.exports = { DirJSONConditionV2 };
