const { Directives } = require('./Directives.js');
const { TiledeskClient } = require("@tiledesk/tiledesk-client");
const { TiledeskChatbot } = require("../../engine/TiledeskChatbot.js");
const { Filler } = require("../Filler");
const winston = require('../../utils/winston');

class DirMessage {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.API_ENDPOINT = context.API_ENDPOINT
    this.projectId = context.projectId;
    this.requestId = context.requestId;
    this.tdcache = this.context.tdcache;
    this.token = context.token;
    this.supportRequest = this.context.supportRequest

    this.tdClient = new TiledeskClient({
      projectId: this.context.projectId,
      token: this.context.token,
      APIURL: this.API_ENDPOINT,
      APIKEY: "___"
    });
  }

  execute(directive, callback) {
    winston.verbose("Execute Message directive");
    let action;
    if (directive.action) {
      action = directive.action;
      if (!action.attributes) {
        action.attributes = {}
      }
      // action.message.attributes.directives = false;
      // action.message.attributes.splits = false;
      // action.message.attributes.markbot = false;
      action.attributes.fillParams = true; // fillParams can fill commands[].message.text
      // temp patch for a fix in the future
      // if (!action.body.message.text || action.body.message.text.trim() === "") {
      //   // because server doesn't allow empty text
      //   // because we anyway need a text/type for conversation summary
      //   // we get info from first commands' message or set a default value
      //   if (action.body.message && action.body.message.attributes && action.body.message.attributes.commands) {
      //     const message_info = DirMessage.firstMessageInfoFromCommands(commands);
      //     action.body.message.text = message_info.text;
      //     action.body.message.type = message_info.type;
      //   }
      //   else {
      //     action.body.message.text = "New message";
      //     action.body.message.type = "text";
      //   }
      // }
    }
    // DEPRECATED
    else if (directive.parameter) {
      let text = directive.parameter.trim();
      action = {
        text: text,
        isInfo: true,
        attributes: {
          directives: false,
          splits: true,
          markbot: true,
          fillParams: true
        }
      }
      if (directive.name === Directives.HMESSAGE) {
        action.attributes.subtype = "info";
        // this.hMessage = true;
      }
      // if (directive.name === Directives.HMESSAGE) {
      //   action.sender = "tiledesk";
      // }
    }
    else {
      winston.warn("DirMessage Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, async () => {
      if (action["_tdThenStop"] == true) {
        callback(true); // stopping the action flow
      }
      else {
        callback();
      }
    });
  }

  async go(action, callback) {
    winston.debug("(DirMessage) Action: ", action);
    const message = action;
    winston.debug("(DirMessage) Message to extEndpoint:", message);

    if(!action.isInfo && this.supportRequest && !this.supportRequest.draft){
      callback();
      return;
    }
    delete action.isInfo
    // if (this.projectId === "656054000410fa00132e5dcc") {
    //   if (!message.text.startsWith('/')) {
    //     callback();
    //     return;
    //   }
    // }
    if (message.text) {
      message.text = message.text.replace(/\\n/g, "\n");

      let requestVariables = null;
      requestVariables = await TiledeskChatbot.allParametersStatic(this.tdcache, this.requestId)

      const filler = new Filler();
      message.text = filler.fill(message.text, requestVariables);
    }

    this.tdClient.sendSupportMessage(
      this.requestId,
      message,
      (err) => {
        if (err) {
          winston.err("(DirMessage) Error sending reply: ", err);
        }
        winston.debug("(DirMessage) Reply message sent: ", message);
        callback();
    });

  }

  // static firstMessageInfoFromCommands(commands) {
  //   let type = "text";
  //   let text = "New message";
  //   for (let i = 0; i < commands.length; i++) {
  //     const command = commands[i];
  //     if (command.type === "message") {
      
  //       if (command.message.type) {
  //         type = command.message.type;
  //       }
  //       if (command.message.text) {
  //         text = command.message.text;
  //       }
  //       break;
  //     }
  //   }
  //   const message_info = {
  //     type: type,
  //     text: text
  //   }
  //   return message_info;
  // }

}

module.exports = { DirMessage };