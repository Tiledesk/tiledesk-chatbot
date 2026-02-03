
const { Logger } = require('../../Logger');
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
    
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.intent_id || this.context.reply?.attributes?.intent_info?.intent_id });
  }

  async execute(directive, callback) {
    //  500ms < wait-time < 10.000ms
    winston.verbose("Execute Wait directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else if (directive.parameter) {
      let millis = 500;
      const _millis = parseInt(directive.parameter.trim(), 10);
      if (!Number.isNaN(_millis)) {
        millis = _millis;
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

    action.millis = await this.resolveMillis(action);
    this.go(action, () => {
      this.logger.native("[Wait] Executed");
      callback();
    })
  }

  async resolveMillis(action) {
    if (!action) {
      return 1000;
    }

    let millis = action.millis;
    if (millis && typeof millis === 'object') {
      const value = millis.value;
      if (millis.isVariable) {
        const resolved = await this.resolveVariableValue(value);
        return this.normalizeMillis(resolved);
      }
      return this.normalizeMillis(value);
    }

    if (typeof millis === 'string') {
      const parsed = this.parseMillis(millis);
      if (parsed !== null) {
        return this.normalizeMillis(parsed);
      }
      const resolved = await this.resolveVariableValue(millis);
      return this.normalizeMillis(resolved);
    }

    return this.normalizeMillis(millis);
  }

  async resolveVariableValue(raw) {
    if (!raw) {
      return null;
    }
    let name = String(raw).trim();
    const match = name.match(/^\{\{\s*([^}]+)\s*\}\}$/);
    if (match && match[1]) {
      name = match[1].trim();
    }
    return await this.chatbot.getParameter(name);
  }

  parseMillis(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    return parsed;
  }

  normalizeMillis(value) {
    const parsed = this.parseMillis(value);
    let millis = parsed === null ? 1000 : parsed;
    if (millis > 20000) {
      millis = 20000;
    }
    else if (millis < 1000) {
      millis = 1000;
    }
    return millis;
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