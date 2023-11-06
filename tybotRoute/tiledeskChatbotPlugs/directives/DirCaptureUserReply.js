const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { DirIntent } = require('./DirIntent');

class DirCaptureUserReply {
  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.reply = context.reply;
    // reply = {
    //   actions: [
    //     {
    //       _tdActionType: 'askgpt',
    //       _tdActionTitle: 'gpt action',
    //       assignReplyTo: 'gpt_reply',
    //       assignSourceTo: 'gpt_source',
    //       kbid: 'XXX',
    //       trueIntent: '#SUCCESS',
    //       falseIntent: '#FAILURE',
    //       question: 'this is the question: ${last_user_message}'
    //     }
    //   ],
    //   attributes: {
    //     clienttimestamp: 1695548792706,
    //     intent_info: {
    //       intent_name: 'gpt success',
    //       intent_id: '00f93b97-89ee-466d-a09c-e47a18943057',
    //       is_fallback: false,
    //       confidence: undefined,
    //       question_payload: [Object],
    //       botId: 'botID',
    //       bot: [Object]
    //     },
    //     webhook: false
    //   }
    // }
    this.message = context.message;
    this.tdclient = context.tdclient;
    this.chatbot = context.chatbot;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.intentDir = new DirIntent(context);
    this.log = context.log;
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      console.error("Incorrect directive:", JSON.stringify(directive));
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    });
  }

  async go(action, callback) {
    const goToIntent = action.goToIntent;
    // console.log("(DirCaptureUserReply) goToIntent:", goToIntent);
    let lockedAction = await this.chatbot.currentLockedAction(this.requestId);
    // console.log("(DirCaptureUserReply) lockedAction:", lockedAction);
    if (!lockedAction) {
      // console.log("(DirCaptureUserReply) !lockedAction");
      const intent_name = this.reply.attributes.intent_info.intent_name
      const actionId = action["_tdActionId"];
      // console.log("(DirCaptureUserReply) intent_name:", intent_name);
      // console.log("(DirCaptureUserReply) actionId:", actionId);
      await this.chatbot.lockIntent(this.requestId, intent_name);
      // console.log("(DirCaptureUserReply) lockIntent");
      await this.chatbot.lockAction(this.requestId, actionId);
      // console.log("(DirCaptureUserReply) lockAction");
      let _lockedAction = await this.chatbot.currentLockedAction(this.requestId);
      let _lockedIntent = await this.chatbot.currentLockedIntent(this.requestId);
      // console.log("(DirCaptureUserReply) _lockedAction", _lockedAction)
      // console.log("(DirCaptureUserReply) _lockedIntent", _lockedIntent)
      callback();
      return;
    } else {
      try {
        await this.chatbot.unlockIntent(this.requestId);
        await this.chatbot.unlockAction(this.requestId);
        // console.log("unlo")
      }
      catch(e) {
        console.error("Error", e)
      }
      
    }
    try {
      const user_reply = this.message.text;
      if (this.context.tdcache) {
        if (action.assignResultTo) {
          if (this.log) {console.log("assign assignResultTo:", action.assignResultTo);}
          await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignResultTo, user_reply);
        }
      }
  
      if (callback) {
        // console.log("(DirCaptureUserReply) #executeGoTo(goToIntent)", goToIntent)
        this.#executeGoTo(goToIntent, () => {
          callback(); // continue the flow
        });
      }
    }
    catch(error) {
      console.error("error is", error);
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