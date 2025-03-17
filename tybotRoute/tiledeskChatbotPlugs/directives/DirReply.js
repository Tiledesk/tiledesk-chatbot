const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskChatbotUtil } = require('../../utils/TiledeskChatbotUtil');
let axios = require('axios');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const winston = require('../../utils/winston')

class DirReply {

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

    this.API_ENDPOINT = context.API_ENDPOINT;
    this.tdClient = new TiledeskClient({
      projectId: this.context.projectId,
      token: this.context.token,
      APIURL: this.API_ENDPOINT,
      APIKEY: "___",
      log: this.log
    });
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
      winston.error("DirReply Incorrect directive (no action provided):", directive);
      callback();
      return;
    }
    this.go(action, () => {
      callback();
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
      const filler = new Filler();
      // fill text attribute
      message.text = filler.fill(message.text, requestAttributes);
      if (message.metadata) {
        winston.debug("DirReply filling message 'metadata':", message.metadata);
        if (message.metadata.src) {
          message.metadata.src = filler.fill(message.metadata.src, requestAttributes);
        }
        if (message.metadata.name) {
          message.metadata.name = filler.fill(message.metadata.name, requestAttributes);
        }
      }
      winston.debug("DirReply filling commands'. Message:", message);
      if (message.attributes && message.attributes.commands) {
        let commands = message.attributes.commands;
        winston.debug("DirReply commands: " + JSON.stringify(commands) + " length: " + commands.length);
        
        if (commands.length > 0) {
          for (let i = 0; i < commands.length; i++) {
            let command = commands[i];
            if (command.type === 'message' && command.message && command.message.text) {
              command.message.text = filler.fill(command.message.text, requestAttributes);
              TiledeskChatbotUtil.fillCommandAttachments(command, requestAttributes, this.log);
              winston.debug("DirReply command filled: " + command.message.text);
            }
            if (command.type === 'settings' && command.settings) {
              Object.keys(command.settings).forEach(k => {
                command.settings[k] = filler.fill(command.settings[k], requestAttributes)
                winston.debug("DirReply settings command filled: " + command.settings[k]);
              })
            }
          }
        }
      }

      // EVALUATE EXPRESSION AND REMOVE BASED ON EVALUATION
      winston.debug("DirReply message before filters: ", message);
      if (message.attributes && message.attributes.commands) {
        winston.debug("DirReply filterOnVariables...on commands", message.attributes.commands)
        winston.debug("DirReply filterOnVariables...on attributes", requestAttributes);
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
      winston.debug("DirReply userFlowAttributes:", userFlowAttributes);
      if (userFlowAttributes) {
        message.attributes["flowAttributes"] = {};
        for (const [key, value] of Object.entries(userFlowAttributes)) {
          try {
            if(typeof value === 'string' && value.length <= 1000){
              message.attributes["flowAttributes"][key] = value;
            }
          }
          catch(err) {
            winston.error("DirReply An error occurred while JSON.parse(). Parsed value:" + value + " in allParametersStatic(). Error:", err);
          }
        }
      }
    }

    let cleanMessage = message;
    cleanMessage.senderFullname = this.context.chatbot.bot.name;
    winston.debug("DirReply reply with clean message: ", cleanMessage);

    await TiledeskChatbotUtil.updateConversationTranscript(this.context.chatbot, cleanMessage);
    this.tdClient.sendSupportMessage(
      this.requestId,
      cleanMessage,
      (err) => {
        if (err) {
          winston.error("DirReply Error sending reply: ", err);
        }
        winston.verbose("DirReply reply message sent")
        const delay = TiledeskChatbotUtil.totalMessageWait(cleanMessage);
        if (delay > 0 && delay <= 30000) { // prevent long delays
          setTimeout(() => {
            callback();
          }, delay);
        }
        else {
          callback();
        }
    });

  }

}

module.exports = { DirReply };