const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskChatbotUtil } = require('../../models/TiledeskChatbotUtil');
let axios = require('axios');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');

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
      console.error("Incorrect directive (no action provided):", directive);
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
          // if (this.log) {console.log("(DirReply) request parameter:", key, "value:", value, "type:", value_type)}
        }
      }
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
            if (command.type === 'settings' && command.settings) {
              Object.keys(command.settings).forEach(k => {
                command.settings[k] = filler.fill(command.settings[k], requestAttributes)
                if (this.log) {console.log("settings command filled:", command.settings[k]);}
              })
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
      if (this.log) { console.log("userFlowAttributes:", userFlowAttributes); }
      if (userFlowAttributes) {
        message.attributes["flowAttributes"] = {};
        for (const [key, value] of Object.entries(userFlowAttributes)) {
          try {
            if(typeof value === 'string' && value.length <= 1000){
              message.attributes["flowAttributes"][key] = value;
            }
          }
          catch(err) {
            console.error("An error occurred while JSON.parse(). Parsed value:" + value + " in allParametersStatic(). Error:", err);
          }
        }
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
    
    cleanMessage.senderFullname = this.context.chatbot.bot.name;
    if (this.log) {console.log("Reply:", JSON.stringify(cleanMessage))};
    await TiledeskChatbotUtil.updateConversationTranscript(this.context.chatbot, cleanMessage);
    // console.log("sending message!", cleanMessage);
    this.tdClient.sendSupportMessage(
      this.requestId,
      cleanMessage,
      (err) => {
        if (err) {
          console.error("Error sending reply:", err);
        }
        if (this.log) {console.log("Reply message sent:", JSON.stringify(cleanMessage));}
        const delay = TiledeskChatbotUtil.totalMessageWait(cleanMessage);
        // console.log("got total delay:", delay)
        if (delay > 0 && delay <= 30000) { // prevent long delays
          setTimeout(() => {
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

}

module.exports = { DirReply };