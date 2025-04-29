const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { DirIntent } = require('./DirIntent');
const winston = require('../../utils/winston');

class DirCaptureUserReply {
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
  }

  execute(directive, callback) {
    winston.verbose("Execute CaptureUserReply directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.warn("DirCaptureUserReply Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    });
  }

  async go(action, callback) {
    winston.debug("(DirCaptureUserReply) Action: ", action);
    const goToIntent = action.goToIntent;
    let lockedAction = await this.chatbot.currentLockedAction(this.requestId);
    if (!lockedAction) {
      const intent_name = this.reply.attributes.intent_info.intent_name
      const actionId = action["_tdActionId"];;
      await this.chatbot.lockIntent(this.requestId, intent_name);
      await this.chatbot.lockAction(this.requestId, actionId);
      callback();
      return;
    } else {
      try {
        await this.chatbot.unlockIntent(this.requestId);
        await this.chatbot.unlockAction(this.requestId);
      }
      catch(e) {
        winston.error("(DirCaptureUserReply) Error: ", e)
      }
      
    }
    try {
      const user_reply = this.message.text;
      if (this.context.tdcache) {
        if (action.assignResultTo) {
          winston.debug("(DirCaptureUserReply) assign assignResultTo: " + action.assignResultTo);
          await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignResultTo, user_reply);
        }
      }
  
      if (callback) {
        if (goToIntent) {
          this.#executeGoTo(goToIntent, () => {
            callback(); // continue the flow
          });
        }
        else {
          callback(); // continue the flow
        }
        
      }
    }
    catch(error) {
      winston.error("(DirCaptureUserReply) error: ", error);
    }
  }

  #executeGoTo(intent, callback) {
    let goToIntentDirective = null;
    if (intent) {
      goToIntentDirective = DirIntent.intentDirectiveFor(intent);
    }
    this.intentDir.execute(goToIntentDirective, () => {
        callback();
    });
  }

}

module.exports = { DirCaptureUserReply };