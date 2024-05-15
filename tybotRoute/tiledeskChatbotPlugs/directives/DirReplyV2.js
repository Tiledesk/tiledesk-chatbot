const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskChatbotConst } = require('../../models/TiledeskChatbotConst');
const { TiledeskChatbotUtil } = require('../../models/TiledeskChatbotUtil');
const { DirIntent } = require("./DirIntent");

class DirReplyV2 {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.projectId = context.projectId;
    this.requestId = context.requestId;
    this.token = context.token;
    this.tdcache = context.tdcache;
    this.log = context.log;
    this.intentDir = new DirIntent(context);
    this.chatbot = context.chatbot;
    this.reply = context.reply;
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action;
      if (!action.attributes) {
        action.attributes = {}
      }
      action.attributes.fillParams = true;
    }
    else {
      console.error("Incorrect directive (no action provided):", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    });
  }

  async go(action, callback) {
    const message = action;
    // fill
    let requestAttributes = null;
    if (this.tdcache) {
      requestAttributes = 
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );
      if (this.log) {
        for (const [key, value] of Object.entries(requestAttributes)) {
          const value_type = typeof value;
        }
      }



      // lock/unlock
      // get buttons if available
      const buttons = TiledeskChatbotUtil.allReplyButtons(message);
      console.log("Buttons:", JSON.stringify(buttons));
      if (buttons && buttons.length > 0) {
        const locked = await this.lockUnlock(action);
        if (!locked) { // == just unlocked
          // last user text
          const last_user_text = await this.chatbot.getParameter(TiledeskChatbotConst.REQ_LAST_USER_TEXT_v2_KEY);
          console.log("got last user text");
          const button = TiledeskChatbotUtil.buttonByText(last_user_text, buttons);
          console.log("button found", JSON.stringify(button));
          // invoke button
          if (button && button.action) {
            console.log("moving to button action", button.action);
            let button_action = DirIntent.intentDirectiveFor(button.action, null);
            console.log("action with .intentName:", button_action);
            this.intentDir.execute(button_action, () => {
              console.log("action invoked", button_action);
            });
            callback(true);
            return;
          }
          else { // no match (treating text buttons as no-match for the moment)
            // if noMatchIntent invoke
            const button = TiledeskChatbotUtil.buttonByText("nomatch", buttons);
            console.log("nomatch button found", JSON.stringify(button));
            // invoke button
            if (button && button.action) {
              console.log("moving to nomatch action", button.action);
              let button_action = DirIntent.intentDirectiveFor(button.action, null);
              this.intentDir.execute(button_action, () => {
                console.log("nomatch action invoked", button_action);
              });
              callback(true);
              return;
            }
            else {
              callback();
              return;
            }
            
          }
        }
        else {
          // continue...
        }
      }


      // process normally to render and send the reply
      const filler = new Filler();
      // fill text attribute
      message.text = filler.fill(message.text, requestAttributes);
      if (message.metadata) {
        if (this.log) {console.log("filling message 'metadata':", JSON.stringify(message.metadata));}
        if (message.metadata.src) {
          message.metadata.src = filler.fill(message.metadata.src, requestAttributes);
        }
        if (message.metadata.name) {
          message.metadata.name = filler.fill(message.metadata.name, requestAttributes);
        }
      }
      if (this.log) {console.log("filling commands'. Message:", JSON.stringify(message));}
      if (message.attributes && message.attributes.commands) {
        if (this.log) {console.log("filling commands'. commands found.");}
        let commands = message.attributes.commands;
        if (this.log) {console.log("commands:", JSON.stringify(commands), commands.length);}
        if (commands.length > 0) {
          if (this.log) {console.log("commands' found");}
          for (let i = 0; i < commands.length; i++) {
            let command = commands[i];
            if (command.type === 'message' && command.message && command.message.text) {
              command.message.text = filler.fill(command.message.text, requestAttributes);
              TiledeskChatbotUtil.fillCommandAttachments(command, requestAttributes, this.log);
              if (this.log) {console.log("command filled:", command.message.text);}
            }
          }
        }
      }

      // EVALUATE EXPRESSION AND REMOVE BASED ON EVALUATION
      if (this.log) {console.log("message before filters:", JSON.stringify(message));}
      if (message.attributes && message.attributes.commands) {
        if (this.log) {console.log("filterOnVariables...on commands", JSON.stringify(message.attributes.commands));}
        if (this.log) {console.log("filterOnVariables...on attributes", requestAttributes);}
        // TiledeskChatbotUtil.filterOnVariables(message.attributes.commands, requestAttributes);
        TiledeskChatbotUtil.filterOnVariables(message, requestAttributes);
      }

      // temporary send back of reserved attributes
      if (!message.attributes) {
        message.attributes = {}
      }
      // Reserved names: userEmail, userFullname
      if (requestAttributes['userEmail']) {
          message.attributes.updateUserEmail = requestAttributes['userEmail'];
      }
      if (requestAttributes['userFullname']) {
        message.attributes.updateUserFullname = requestAttributes['userFullname'];
      }
      // intent_info
      if (this.context.reply && this.context.reply.attributes && this.context.reply.attributes.intent_info) {
        message.attributes.intentName = this.context.reply.attributes.intent_info.intent_name;
      }
    }
    // send!
    let cleanMessage = message;
    // cleanMessage = TiledeskChatbotUtil.removeEmptyReplyCommands(message);
    // if (!TiledeskChatbotUtil.isValidReply(cleanMessage)) {
    //   console.log("invalid message", cleanMessage);
    //   callback(); // cancel reply operation
    //   return;
    // }
    // console.log("valid message!", cleanMessage);
    cleanMessage.senderFullname = this.context.chatbot.bot.name;
    if (this.log) {console.log("Reply:", JSON.stringify(cleanMessage))};
    await TiledeskChatbotUtil.updateConversationTranscript(this.context.chatbot, cleanMessage);
    this.context.tdclient.sendSupportMessage(
      this.requestId,
      cleanMessage,
      (err) => {
        if (err) {
          console.error("Error sending reply:", err);
        }
        if (this.log) {console.log("Reply message sent");}
        const delay = TiledeskChatbotUtil.totalMessageWait(cleanMessage);
        // console.log("got total delay:", delay)
        if (delay > 0 && delay <= 30000) { // prevent long delays
          setTimeout(async () => {
            // console.log("callback after delay")
            callback();



            
          }, delay);
        }
        else {
          // console.log("invalid delay.")
          callback();
        }
    });

  }

  async lockUnlock(action, callback) {
    let lockedAction = await this.chatbot.currentLockedAction(this.requestId);
    console.log("(DirReplyV2) lockedAction:", lockedAction);
    if (!lockedAction) {
      console.log("(DirReplyV2) !lockedAction");
      const intent_name = this.reply.attributes.intent_info.intent_name
      const actionId = action["_tdActionId"];
      console.log("(DirReplyV2) intent_name:", intent_name);
      console.log("(DirReplyV2) actionId:", actionId);
      await this.chatbot.lockIntent(this.requestId, intent_name);
      console.log("(DirReplyV2) lockIntent");
      await this.chatbot.lockAction(this.requestId, actionId);
      console.log("(DirReplyV2) lockAction");
      let _lockedAction = await this.chatbot.currentLockedAction(this.requestId);
      let _lockedIntent = await this.chatbot.currentLockedIntent(this.requestId);
      console.log("(DirReplyV2) _lockedAction", _lockedAction);
      console.log("(DirReplyV2) _lockedIntent", _lockedIntent);
      // callback();
      return true;
    } else {
      try {
        await this.chatbot.unlockIntent(this.requestId);
        await this.chatbot.unlockAction(this.requestId);
        console.log("unlocked ReplyV2");
        return false;
      }
      catch(e) {
        console.error("Error", e);
      }
    }
  }

}

module.exports = { DirReplyV2 };