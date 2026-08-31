const winston = require('../utils/winston');
const { Logger } = require("../Logger");

// DirIntent is required lazily: BaseDirective is imported by directives, and
// directives/DirIntent will itself become a BaseDirective subclass in a later
// phase. A module-level require would therefore create a cycle.
let _DirIntent = null;
function getDirIntent() {
  if (!_DirIntent) {
    _DirIntent = require("./directives/DirIntent").DirIntent;
  }
  return _DirIntent;
}

// Same reasoning: the engine imports this package, so resolve it on first use.
let _TiledeskChatbot = null;
function getTiledeskChatbot() {
  if (!_TiledeskChatbot) {
    _TiledeskChatbot = require("../engine/TiledeskChatbot").TiledeskChatbot;
  }
  return _TiledeskChatbot;
}

/**
 * Common base for chatbot directives.
 *
 * Holds the three things that were copy-pasted across the directive files:
 *  - the constructor preamble (mandatory-context guard, context hoisting, Logger)
 *  - `_executeCondition` (true/false intent branching)
 *  - `_assignAttributes` (writing action results back into the request parameters)
 *
 * These are conventional-protected `_`-prefixed methods rather than `#private`
 * fields on purpose: `#private` members cannot be inherited or overridden, which
 * is precisely what a base class needs them to be.
 */
class BaseDirective {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.projectId = this.context.projectId;
    this.token = this.context.token;
    this.API_ENDPOINT = this.context.API_ENDPOINT;

    this.logger = new Logger({
      request_id: this.requestId,
      dev: this.context.supportRequest?.draft,
      intent_id: this.context.reply?.intent_id || this.context.reply?.attributes?.intent_info?.intent_id
    });
  }

  /**
   * The winston prefix for this directive, e.g. "(DirBrevo)".
   * Derived from the subclass name; the parenthesised form is the one used by
   * the majority of the directives.
   */
  get _tag() {
    return "(" + this.constructor.name + ")";
  }

  /**
   * Optional flow-log labels emitted by `_executeCondition`.
   *
   * Subclasses that want native flow logs set this field to an object with any
   * of the four keys below; a missing key emits nothing at that point.
   *   { trueExecute, trueMissing, falseExecute, falseMissing }
   * Defaults to null, i.e. emit nothing.
   */
  _conditionLabels = null;

  _nativeLog(key) {
    const labels = this._conditionLabels;
    if (labels && labels[key]) {
      this.logger.native(labels[key]);
    }
  }

  /**
   * Runs the trueIntent branch when `result === true`, the falseIntent branch
   * otherwise. `callback` is optional and is invoked once the branch completed.
   *
   * Requires `this.intentDir` (a DirIntent instance) to be set by the subclass.
   */
  async _executeCondition(result, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, callback) {
    const DirIntent = getDirIntent();
    let trueIntentDirective = null;
    if (trueIntent) {
      trueIntentDirective = DirIntent.intentDirectiveFor(trueIntent, trueIntentAttributes);
    }
    let falseIntentDirective = null;
    if (falseIntent) {
      falseIntentDirective = DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes);
    }
    if (result === true) {
      if (trueIntentDirective) {
        this._nativeLog('trueExecute');
        this.intentDir.execute(trueIntentDirective, () => {
          if (callback) {
            callback();
          }
        });
      }
      else {
        this._nativeLog('trueMissing');
        winston.debug(this._tag + " No trueIntentDirective specified");
        if (callback) {
          callback();
        }
      }
    }
    else {
      if (falseIntentDirective) {
        this._nativeLog('falseExecute');
        this.intentDir.execute(falseIntentDirective, () => {
          if (callback) {
            callback();
          }
        });
      }
      else {
        this._nativeLog('falseMissing');
        winston.debug(this._tag + " No falseIntentDirective specified");
        if (callback) {
          callback();
        }
      }
    }
  }

  /**
   * Writes action results back into the request parameters.
   *
   * The 12 hand-written copies of `#assignAttributes` did not share a single
   * signature (they range over status/result/error, answer/source/chunks, ...),
   * so the shared form is the ordered list of assignments they all reduce to.
   * Order matters: the writes happen sequentially, exactly as before.
   *
   * @param {object} action
   * @param {Array} assignments  ordered tuples [actionKey, value] or
   *                             [actionKey, value, { onlyIfTruthy: true }]
   */
  async _assignAttributes(action, assignments) {
    const TiledeskChatbot = getTiledeskChatbot();
    winston.debug(this._tag + " assignAttributes action: ", action)
    if (this.context.tdcache) {
      for (const [actionKey, value, opts] of assignments) {
        const target = action[actionKey];
        if (!target) {
          continue;
        }
        if (opts && opts.onlyIfTruthy && !value) {
          continue;
        }
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, target, value);
      }
    }
  }
}

module.exports = { BaseDirective };
