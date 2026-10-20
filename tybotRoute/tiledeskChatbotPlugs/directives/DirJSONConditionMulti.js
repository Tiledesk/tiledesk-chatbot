const { DirIntent } = require('./DirIntent');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskWhenExpression } = require('../../TiledeskWhenExpression');
const winston = require('../../utils/winston');
const { Logger } = require('../../Logger');

/**
 * DirJSONConditionMulti
 *
 * Multi-branch condition: N cases evaluated IN ORDER, each with its own exit.
 * The first case whose `when` is true routes the flow to its own block and the
 * action stops there; the remaining cases are never evaluated. When no case
 * matches, the flow leaves through `elseIntent`.
 *
 * It replaces the chain of single conditions (each one's false branch feeding
 * the next) with one block that has one exit per case.
 *
 * Rules (see design-studio docs/V3/multi-conditions-piano.md):
 *  1. cases are evaluated in order; the first true one wins and stops the chain;
 *  2. a case with no `when` (or an empty one) is SKIPPED, never taken as true —
 *     an empty case at the top would otherwise swallow all the traffic;
 *  3. an evaluation error on a case counts as "no match": `flowError` is set and
 *     the next case is tried, so one broken case does not shadow the sound ones
 *     that follow it;
 *  4. a case that matches but has no target block advances to the next action,
 *     exactly as DirJSONConditionV2 does with an unset trueIntent;
 *  5. no case matched -> `elseIntent`; unset, the next action runs;
 *  6. nothing usable at all -> a warning, and the chain advances.
 *
 * There is no legacy delegation here (unlike DirJSONConditionV2): this action
 * type is new, so no bot can carry an older shape of it.
 *
 * The callback contract matches the dispatcher (DirectivesChatbotPlug): the
 * callback is invoked with `stop` (truthy halts the directive chain) and is
 * guaranteed to be called EXACTLY ONCE on every path, including errors.
 */
class DirJSONConditionMulti {

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
    winston.verbose("Execute JSONConditionMulti directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive);
      winston.warn("DirJSONConditionMulti Incorrect directive: ", directive);
      callback();
      return;
    }

    this.go(action, (stop) => {
      this.logger.native("[ConditionMulti] Executed");
      callback(stop);
    }).catch((err) => {
      // Last-resort net: never leave the directive chain hanging.
      winston.error("(DirJSONConditionMulti) Unhandled error in go(): " + (err && err.message));
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
      const cases = Array.isArray(action.cases) ? action.cases : [];
      const elseIntent = this.#cleanIntent(action.elseIntent);
      const elseIntentAttributes = action.elseIntentAttributes;
      // Same decision as V2: a matched case always stops the chain.
      const stopOnConditionMet = true;

      const evaluable = cases.filter((c) => c && typeof c.when === 'string' && c.when.trim() !== "");
      if (evaluable.length === 0 && !elseIntent) {
        this.logger.warn("[ConditionMulti] Invalid action: no evaluable case and no elseIntent");
        winston.warn("(DirJSONConditionMulti) No evaluable case and no elseIntent");
        done();
        return;
      }
      if (evaluable.length !== cases.length) {
        // Rule 2. Worth saying out loud: an unfinished case in the editor is a branch
        // of the flow that silently never fires.
        winston.verbose("(DirJSONConditionMulti) " + (cases.length - evaluable.length) + " case(s) without a condition were skipped");
      }

      // Load conversation variables (native-typed) from cache, once for every case.
      let variables = {};
      if (this.context.tdcache) {
        variables = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId) || {};
      }
      else {
        winston.error("(DirJSONConditionMulti) No this.context.tdcache — evaluating with empty variables");
      }

      const expression = new TiledeskWhenExpression();
      for (let i = 0; i < evaluable.length; i++) {
        const branch = evaluable[i];
        const label = branch.label || branch._tdCaseId || ('#' + (i + 1));
        let result;
        try {
          const value = expression.evaluate(branch.when, variables);
          result = (value === null || value === undefined) ? false : Boolean(value);
        }
        catch (err) {
          // Rule 3: a broken case is not a match, and it does not shadow the ones below it.
          winston.error("(DirJSONConditionMulti) Error evaluating case '" + label + "': " + (err && err.message));
          this.logger.error("[ConditionMulti] An error occurred evaluating case '" + label + "'");
          if (this.context.tdcache) {
            await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, "flowError", "An error occurred evaluating condition '" + label + "' (when)");
          }
          result = false;
        }
        winston.debug("(DirJSONConditionMulti) case '" + label + "' -> " + result);
        if (!result) continue;

        this.logger.native("[ConditionMulti] Case '" + label + "' matched");
        const intent = this.#cleanIntent(branch.intent);
        if (!intent) {
          // Rule 4: the switch is decided, but there is nowhere to go.
          this.logger.native("[ConditionMulti] Case '" + label + "' has no target block");
          winston.warn("(DirJSONConditionMulti) Matched case '" + label + "' has no intent");
          done();
          return;
        }
        this.intentDir.execute(DirIntent.intentDirectiveFor(intent, branch.intentAttributes), () => done(stopOnConditionMet));
        return;
      }

      // Rule 5: nothing matched.
      this.logger.native("[ConditionMulti] No case matched");
      if (elseIntent) {
        this.intentDir.execute(DirIntent.intentDirectiveFor(elseIntent, elseIntentAttributes), () => done(stopOnConditionMet));
      }
      else {
        this.logger.native("[ConditionMulti] No elseIntent specified");
        done();
      }
    }
    catch (err) {
      winston.error("(DirJSONConditionMulti) Unexpected error in go(): " + (err && err.message));
      done(); // advance the chain rather than hang
    }
  }

  /** An intent that is missing, or blank, is an unconnected exit — not a target. */
  #cleanIntent(intent) {
    if (typeof intent !== 'string') return null;
    const trimmed = intent.trim();
    return trimmed === "" ? null : trimmed;
  }

}

module.exports = { DirJSONConditionMulti };
