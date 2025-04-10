
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const winston = require('../../utils/winston');

class DirWait {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.chatbot = context.chatbot;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
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
      if (!Number.isNaN(millis)) {
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
    setTimeout(() => {
      callback();
    }, action.millis);
  }
}

module.exports = { DirWait };