const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { DirIntent } = require('./DirIntent');
const winston = require('../../utils/winston');
const { Logger } = require('../../Logger');

class DirIteration {
  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    
    this.context = context;
    this.reply = context.reply;
    this.message = context.message;
    this.chatbot = context.chatbot;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    
    this.intentDir = new DirIntent(context);
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    winston.verbose("Execute Iteration directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirIteration Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Iteration] Executed");
      callback(stop);
    });
  }

  async go(action, callback) {
    winston.debug("(DirIteration) Action: ", action);
    
    const goToIntent = action.goToIntent;
    const iterable = action.iterable;
    const output = action.assignOutputTo;
    const delay = (action.delay || 30) * 1000; // s to ms

    let requestVariables = null;
    requestVariables =
    await TiledeskChatbot.allParametersStatic(
      this.tdcache, this.requestId
    )

    const iterableArray = await TiledeskChatbot.getParameterStatic(this.tdcache, this.requestId, action.iterable);

    if (!iterableArray) {
      winston.verbose("[Iteration] Iterable object is undefined");
      this.logger.warn("[Iteration] Iterable object is undefined");
      callback(true);
      return;
    }

    if (!Array.isArray(iterableArray)) {
      winston.verbose("[Iteration] A non-iterable object was provided. Exit...")
      this.logger.error("[Iteration] A non-iterable object was provided. Exit...")
      callback(true);
      return;
    }

    for (const item of iterableArray) {
      await this.chatbot.addParameter(output, item);
      await this.#executeIntent(goToIntent);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.logger.native("[Iteration] Iteration terminated");
    callback(true);
    return;

  }

  async #executeIntent(destinationIntentId, callback) {
    let intentDirective = null;
    if (destinationIntentId) {
      intentDirective = DirIntent.intentDirectiveFor(destinationIntentId, null);
    }
    if (intentDirective) {
      this.logger.native("[Iteration] executing destinationIntentId");
      this.intentDir.execute(intentDirective, () => {
        if (callback) {
          callback();
        }
      })
    }
    else {
      this.logger.native("[Iteration] no block connected to intentId:", destinationIntentId);
      winston.debug("[Iteration] no block connected to intentId:" + destinationIntentId);
      if (callback) {
        callback();
      }
    }
  }

}

module.exports = { DirIteration };