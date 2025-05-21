const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskChatbotConst } = require('../../engine/TiledeskChatbotConst');
const { TiledeskChatbotUtil } = require('../../utils/TiledeskChatbotUtil');
const { DirIntent } = require("./DirIntent");
// const { defaultOptions } = require('liquidjs');
const { DirMessageToBot } = require('./DirMessageToBot');
const { v4: uuidv4 } = require('uuid');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const winston = require('../../utils/winston');
const { Logger } = require('../../Logger');

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
    this.intentDir = new DirIntent(context);
    this.chatbot = context.chatbot;
    this.reply = context.reply;
    this.originalMessage = context.message;
    this.API_ENDPOINT = context.API_ENDPOINT;
    
    this.intentDir = new DirIntent(context);
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.attributes?.intent_info?.intent_id });
    this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___" });
  }

  execute(directive, callback) {
    this.logger.info("[Advanced Reply] Executing action");
    winston.verbose("Execute ReplyV2 directive");
    let action;
    if (directive.action) {
      action = directive.action;
      if (!action.attributes) {
        action.attributes = {}
      }
      action.attributes.fillParams = true;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirReplyV2 Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.info("[Advanced Reply] Action completed");
      callback(stop);
    });
  }

  async go(action, callback) {
    winston.debug("(DirReplyV2) Action: ", action);
    const message = action;

    let current; // debug only
    if (message.attributes.commands[1].message.text) {
      current = message.attributes.commands[1].message.text
    }
    
    let must_stop = false;
    // fill
    let requestAttributes = null;
    if (this.tdcache) {
      requestAttributes = 
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );
      // for (const [key, value] of Object.entries(requestAttributes)) {
      //   const value_type = typeof value;
      // }

      TiledeskChatbotUtil.replaceJSONButtons(message, requestAttributes);

      try {
        // lock/unlock + no-match
        // get buttons if available
        const buttons = TiledeskChatbotUtil.allReplyButtons(message);
        if (buttons && buttons.length > 0) {
          const locked = await this.lockUnlock(action); // first execution returns locked, then unlocked
          if (locked) { // fist execution returns (just) locked
            must_stop = true; // you must stop after next callbacks (in this flow) if there are buttons
            if (action.noInputIntent) {
              const noInputIntent = action.noInputIntent;
              const noInputTimeout = action.noInputTimeout;
              if (noInputTimeout > 0 && noInputTimeout < 7776000) {
                const timeout_id = uuidv4();
                await this.chatbot.addParameter(TiledeskChatbotConst.USER_INPUT, timeout_id); // control variable. On each user input is removed
                setTimeout(async () => {
                  winston.debug("(DirReplyV2) noinput timeout triggered!");
                  const userInput = await this.chatbot.getParameter(TiledeskChatbotConst.USER_INPUT);
                  if (userInput && userInput === timeout_id) {
                    await this.chatbot.unlockIntent(this.requestId);
                    await this.chatbot.unlockAction(this.requestId);
                    winston.debug("(DirReplyV2) Unlocked (for noInput) ReplyV2");
                    let noinput_action = DirIntent.intentDirectiveFor(noInputIntent, null);
                    this.intentDir.execute(noinput_action, () => {
                      winston.debug("(DirReplyV2) noinput action invoked", noinput_action);
                    });
                  }
                  else {
                    winston.debug("(DirReplyV2) Skipping noinput action because of userInput", userInput);
                  }
                }, noInputTimeout);
              }
            }
          }
          else { // second execution

            const last_user_text = await this.chatbot.getParameter(TiledeskChatbotConst.REQ_LAST_USER_TEXT_v2_KEY);
            const button = TiledeskChatbotUtil.buttonByText(last_user_text, buttons);

            // invoke button
            if (button && button.action) {
              let button_action = DirIntent.intentDirectiveFor(button.action, null);
              this.intentDir.execute(button_action, () => {
                winston.debug("(DirReplyV2) action invoked", button_action);
              });
              callback(true); // must_stop = true
              return;
            }
            else { // no match (treating text buttons as no-match for the moment)
              // if noMatchIntent invoke
              // const button = TiledeskChatbotUtil.buttonByText("nomatch", buttons);
              winston.debug("(DirReplyV2) nomatch button found ", button);
              // // invoke button
              // if (button && button.action) {
              //   let button_action = DirIntent.intentDirectiveFor(button.action, null);
              //   this.intentDir.execute(button_action, () => {
              //   });
              //   callback(true);
              //   return;
              // }
              if (action.noMatchIntent) {
                let nomatch_action = DirIntent.intentDirectiveFor(action.noMatchIntent, null);
                this.intentDir.execute(nomatch_action, () => {
                  winston.debug("(DirReplyV2) nomatch action invoked", nomatch_action);
                });
                callback(true); // must_stop = true
                return;
              }
              else {
                // const defaultFallbackAction = { action: { intentName: "defaultFallback" } };

                const messageDir = new DirMessageToBot(this.context);
                messageDir.execute( { action: { message: this.originalMessage }  }, () => {
                  winston.debug("(DirReplyV2) messageDir invoked");
                });
                callback(true); // must_stop = true
                return;

                // const textAction = { action: { text: last_user_text } };
                // this.intentDir.execute( textAction, () => {
                // });
                // callback(true); // must_stop = true
                // return;


                // // there is no "no-match", go on...
                // callback(false);
                // return;
              }
            }
          }
        }
      }
      catch(error) {
        winston.error("(DirReplyV2) Error: ", error);
      }

      const filler = new Filler();
    
      // fill text attribute
      message.text = filler.fill(message.text, requestAttributes);
      if (message.metadata) {
        if (message.metadata.src) {
          message.metadata.src = filler.fill(message.metadata.src, requestAttributes);
        }
        if (message.metadata.name) {
          message.metadata.name = filler.fill(message.metadata.name, requestAttributes);
        }
      }
      if (message.attributes && message.attributes.commands) {
        let commands = message.attributes.commands;
        if (commands.length > 0) {
          for (let i = 0; i < commands.length; i++) {
            let command = commands[i];
            if (command.type === 'message' && command.message && command.message.text) {
              command.message.text = filler.fill(command.message.text, requestAttributes);
              TiledeskChatbotUtil.fillCommandAttachments(command, requestAttributes);
            }
          }
        }
      }

      // EVALUATE EXPRESSION AND REMOVE BASED ON EVALUATION
      winston.debug("(DirReplyV2) message before filters:", message);
      if (message.attributes && message.attributes.commands) {
        // TiledeskChatbotUtil.filterOnVariables(message.attributes.commands, requestAttributes);
        TiledeskChatbotUtil.filterOnVariables(message, requestAttributes);
      }

      // temporary send back of reserved attributes
      if (!message.attributes) {
        message.attributes = {}
      }
      // Reserved names: userEmail, userFullname
      // if (requestAttributes['userEmail']) {
      //     message.attributes.updateUserEmail = requestAttributes['userEmail'];
      // }
      // if (requestAttributes['userFullname']) {
      //   message.attributes.updateUserFullname = requestAttributes['userFullname'];
      // }
      // intent_info
      if (this.context.reply && this.context.reply.attributes && this.context.reply.attributes.intent_info) {
        message.attributes.intentName = this.context.reply.attributes.intent_info.intent_name;
      }
      // userFlowAttributes
      let userFlowAttributes = TiledeskChatbotUtil.userFlowAttributes(requestAttributes);
      if (userFlowAttributes) {
        message.attributes["flowAttributes"] = {};
        for (const [key, value] of Object.entries(userFlowAttributes)) {
          try {
            if(typeof value === 'string' && value.length <= 1000){
              message.attributes["flowAttributes"][key] = value;
            }
          }
          catch(err) {
            winston.errpr("(DirReplyV2) An error occurred while JSON.parse(). Parsed value: " + value + " in allParametersStatic(). Error: " + JSON.stringify(err));
          }
        }
      }
      
    }
    // send!
    let cleanMessage = message;
    // cleanMessage = TiledeskChatbotUtil.removeEmptyReplyCommands(message);
    // if (!TiledeskChatbotUtil.isValidReply(cleanMessage)) {
    //   callback(); // cancel reply operation
    //   return;
    // }
    cleanMessage.senderFullname = this.context.chatbot.bot.name;
    winston.debug("(DirReplyV2) Reply: ", cleanMessage);
    await TiledeskChatbotUtil.updateConversationTranscript(this.context.chatbot, cleanMessage);
    this.tdClient.sendSupportMessage(
      this.requestId,
      cleanMessage,
      (err) => {
        if (err) {
          winston.error("(DirReplyV2) Error sending reply: ", err);
        }
        winston.debug("(DirReplyV2) Reply message sent");
        const delay = TiledeskChatbotUtil.totalMessageWait(cleanMessage);
        if (delay > 0 && delay <= 30000) { // prevent long delays
          winston.debug("(DirReplyV2) start timeout callback(" + must_stop + ") for:", current);
          setTimeout(async () => {
            winston.debug("(DirReplyV2) callback(" + must_stop + ") after delay", current);
            callback(must_stop);
          }, delay);
        }
        else {
          callback(must_stop);
        }
    });

  }


  async lockUnlock(action, callback) {
    let lockedAction = await this.chatbot.currentLockedAction(this.requestId);

    if (!lockedAction) {
      const intent_name = this.reply.attributes.intent_info.intent_name
      const actionId = action["_tdActionId"];
      await this.chatbot.lockIntent(this.requestId, intent_name);
      await this.chatbot.lockAction(this.requestId, actionId);
      let _lockedAction = await this.chatbot.currentLockedAction(this.requestId);
      let _lockedIntent = await this.chatbot.currentLockedIntent(this.requestId);
      // callback();
      return true;
    } else {
      try {
        await this.chatbot.unlockIntent(this.requestId);
        await this.chatbot.unlockAction(this.requestId);
        return false;
      }
      catch(e) {
        winston.error("(DirReplyV2) Error", e);
      }
    }
  }

}

module.exports = { DirReplyV2 };