const winston = require('../utils/winston');
const { Logger } = require("../observability/Logger");

/**
 * Shared shapes, declared once in tybotRoute/types/index.js. These are
 * type-only imports: JSDoc `import()` is erased at runtime, so nothing is
 * actually required here and no cycle is introduced.
 *
 * @typedef {import('../types').DirectiveContext} DirectiveContext
 * @typedef {import('../types').Action} Action
 * @typedef {import('../types').TdCacheLike} TdCacheLike
 */

// DirIntent is required lazily: BaseDirective is imported by directives, and
// directives/flow/DirIntent will itself become a BaseDirective subclass in a later
// phase. A module-level require would therefore create a cycle.
let _DirIntent = null;
function getDirIntent() {
  if (!_DirIntent) {
    _DirIntent = require("./flow/DirIntent").DirIntent;
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
 *
 * Subclasses supply the dispatch entry point themselves; the contract the
 * dispatcher relies on is
 *   execute(directive: import('../types').Directive,
 *           callback: import('../types').DirectiveCallback): void
 * -- call `callback(true)` to stop directive processing, `callback()` to go on.
 */
class BaseDirective {

  /**
   * @param {DirectiveContext} context  The per-reply context built by
   *   DirectivesChatbotPlug.processDirectives(). Mandatory.
   * @throws {Error} if `context` is missing.
   */
  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    /** @type {DirectiveContext} */
    this.context = context;
    /** @type {TdCacheLike|undefined} */
    this.tdcache = this.context.tdcache;
    /** @type {string|undefined} */
    this.requestId = this.context.requestId;
    /** @type {string|undefined} */
    this.projectId = this.context.projectId;
    /** @type {string|undefined} */
    this.token = this.context.token;
    /** @type {string|undefined} */
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
   *
   * @returns {string}
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
   *
   * @type {{trueExecute?: string, trueMissing?: string, falseExecute?: string, falseMissing?: string}|null}
   */
  _conditionLabels = null;

  /**
   * @param {'trueExecute'|'trueMissing'|'falseExecute'|'falseMissing'} key
   * @returns {void}
   */
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
   *
   * @param {boolean} result                    Branch selector; strictly `true` takes the true branch.
   * @param {string} [trueIntent]               Intent name to run when `result === true`.
   * @param {Record<string, any>} [trueIntentAttributes]   Attributes passed to the true intent.
   * @param {string} [falseIntent]              Intent name to run otherwise.
   * @param {Record<string, any>} [falseIntentAttributes]  Attributes passed to the false intent.
   * @param {() => void} [callback]             Invoked once the selected branch completed.
   * @returns {Promise<void>}
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
   * @param {Action} action  The directive's action payload; `action[actionKey]`
   *   holds the NAME of the flow attribute to write to.
   * @param {Array<[string, any] | [string, any, {onlyIfTruthy?: boolean}]>} assignments
   *   ordered tuples [actionKey, value] or [actionKey, value, { onlyIfTruthy: true }]
   * @returns {Promise<void>}
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
