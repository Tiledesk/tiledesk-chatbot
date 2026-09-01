
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const winston = require('../../utils/winston');
const { BaseDirective } = require('../BaseDirective');
const { Directives } = require('../Directives');

class DirWait extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.WAIT];

  constructor(context) {
    super(context);
    this.chatbot = context.chatbot;
  }

  execute(directive, callback) {
    //  500ms < wait-time < 10.000ms
    winston.verbose("Execute Wait directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else if (directive.parameter) {
      let millis = 500;
      const _millis = parseInt(directive.parameter.trim());
      // `_millis`, not `millis`: `millis` is the literal 500 assigned just above
      // and can never be NaN, so a non-numeric parameter used to assign NaN
      // unconditionally. Neither clamp below fires on NaN, and the directive
      // ended up calling setTimeout(callback, NaN), which fires on the next
      // tick: the wait silently did not happen.
      if (!Number.isNaN(_millis)) {
        millis = _millis;
      }
      if (millis > 20000) {
        millis = 20000
      }
      else if (millis < 1000) {
        millis = 1000
      }
      action = {
        millis: millis
      }
    }
    else {
      action = {
        millis: 500
      }
    }

    this.go(action, () => {
      this.logger.native("[Wait] Executed");
      callback();
    })
  }

  async go(action, callback) {
    winston.debug("(DirWait) Action: ", action);
    // reset step?
    // const step_key = TiledeskChatbot.requestCacheKey(this.requestId) + ":step";
    if (action && action.millis >= 1000) {//2000 * 60) { // at list 2 minutes waiting time to reset the steps counter
      // await this.tdcache.set(step_key, 0);
      await TiledeskChatbot.resetStep(this.tdcache, this.requestId);
    }
    this.logger.native("[Wait] Waiting for ", action.millis, "[ms]")
    setTimeout(() => {
      callback();
    }, action.millis);
  }
}

module.exports = { DirWait };