const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskChatbotConst } = require('../../engine/TiledeskChatbotConst');
const { DirIntent } = require('./DirIntent');
const { v4: uuidv4 } = require('uuid');
const winston = require('../../utils/winston');
const { Logger } = require('../../Logger');

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
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.intent_id || this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    winston.verbose("Execute CaptureUserReply directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirCaptureUserReply Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    });
  }

  #resolveIntentLockKey() {
    const intent_info = this.reply?.attributes?.intent_info;
    if (intent_info?.intent_id) {
      return "#" + intent_info.intent_id;
    }
    if (intent_info?.intent_name) {
      return intent_info.intent_name;
    }
    if (this.reply?.intent_id) {
      return "#" + this.reply.intent_id;
    }
    if (this.reply?.intent_display_name) {
      return this.reply.intent_display_name;
    }
    return null;
  }

  async go(action, callback) {
    winston.debug("(DirCaptureUserReply) Action: ", action);
    const goToIntent = action.goToIntent;
    const lockedAction = await this.chatbot.currentLockedAction(this.requestId);
    // a lock only counts as "waiting for the reply" when this very action set it
    const own = lockedAction && lockedAction === action["_tdActionId"];
    if (!own) {
      const intent_name = this.#resolveIntentLockKey();
      const actionId = action["_tdActionId"];
      if (!intent_name) {
        this.logger.error("[Capture User Reply] Cannot lock intent: missing intent info");
        winston.error("(DirCaptureUserReply) Cannot lock intent: missing intent info");
        callback(true);
        return;
      }
      await this.chatbot.lockIntent(this.requestId, intent_name);
      await this.chatbot.lockAction(this.requestId, actionId);
      this.logger.native("[Capture User Reply] Waiting for user reply...");
      await this.#scheduleNoInput(action);
      callback(true);
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
      this.logger.native("[Capture User Reply] User replied with: ", user_reply);
      if (this.context.tdcache) {
        if (action.assignResultTo) {
          winston.debug("(DirCaptureUserReply) assign assignResultTo: " + action.assignResultTo);
          await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignResultTo, user_reply);
        }
      }
  
      if (callback) {
        if (goToIntent) {
          this.#executeGoTo(goToIntent, (stop) => {
            this.logger.native("[Capture User Reply] Executed");
            callback(stop); // a jump ends this block
          });
        }
        else {
          this.logger.native("[Capture User Reply] Executed");
          callback(); // continue the flow
        }
        
      }
    }
    catch(error) {
      this.logger.error("[Capture User Reply] Error: ", error);
      winston.error("(DirCaptureUserReply) error: ", error);
    }
  }

  /**
   * No input, as in DirReplyV2: when the capture starts waiting, a timer of noInputTimeout ms. If the
   * user has not replied when it fires, the capture is unlocked and the flow goes to noInputIntent.
   * "Not replied" is the control variable USER_INPUT still holding this timer's id: every user
   * message deletes it (TiledeskChatbotUtil, message in), and the lock must still be this action's
   * (a reply moved the flow on, another capture or reply is waiting now: nothing to do).
   * Like DirReplyV2's, the timer lives in this process: a restart while waiting loses it.
   */
  async #scheduleNoInput(action) {
    const noInputIntent = action.noInputIntent;
    const noInputTimeout = Number(action.noInputTimeout);
    if (!noInputIntent || !(noInputTimeout > 0 && noInputTimeout < 7776000)) {
      return;
    }
    const timeout_id = uuidv4();
    await this.chatbot.addParameter(TiledeskChatbotConst.USER_INPUT, timeout_id); // deleted by every user input
    setTimeout(async () => {
      try {
        const userInput = await this.chatbot.getParameter(TiledeskChatbotConst.USER_INPUT);
        const lockedAction = await this.chatbot.currentLockedAction(this.requestId);
        if (lockedAction !== action["_tdActionId"]) {
          winston.debug("(DirCaptureUserReply) lock owned by another action, skipping noinput");
          return;
        }
        if (userInput !== timeout_id) {
          winston.debug("(DirCaptureUserReply) the user replied, skipping noinput");
          return;
        }
        await this.chatbot.unlockIntent(this.requestId);
        await this.chatbot.unlockAction(this.requestId);
        this.logger.native("[Capture User Reply] No input: no reply in " + noInputTimeout + " ms");
        const noinput_action = DirIntent.intentDirectiveFor(noInputIntent, null);
        this.intentDir.execute(noinput_action, () => {
          winston.debug("(DirCaptureUserReply) noinput action invoked", noinput_action);
        });
      }
      catch (error) {
        this.logger.error("[Capture User Reply] No input error: ", error);
        winston.error("(DirCaptureUserReply) noinput error: ", error);
      }
    }, noInputTimeout);
  }

  #executeGoTo(intent, callback) {
    let goToIntentDirective = null;
    if (intent) {
      goToIntentDirective = DirIntent.intentDirectiveFor(intent);
    }
    this.intentDir.execute(goToIntentDirective, (stop) => {
        callback(stop);
    });
  }

}

module.exports = { DirCaptureUserReply };