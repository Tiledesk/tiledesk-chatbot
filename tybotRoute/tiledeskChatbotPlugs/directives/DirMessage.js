const { Directives } = require('./Directives.js');
const { TiledeskClient } = require("@tiledesk/tiledesk-client");
const { TiledeskChatbot } = require("../../models/TiledeskChatbot");
const { Filler } = require("../Filler");

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
    this.log = this.context.log;
    this.supportRequest = this.context.supportRequest

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
      if (this.log) {console.log("got action:", JSON.stringify(action));}
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
      // console.log("final message action:", JSON.stringify(action));
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
      console.error("Incorrect directive:", directive);
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
    // const message = action.body.message;
    const message = action;
    if (this.log) {console.log("Message to extEndpoint:", JSON.stringify(message))};

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
    // message.text = "Ciao1\n\nCIao2"
    // console.log("sendSupportMessageExt from dirmessage", message);

    this.tdClient.sendSupportMessage(
      this.requestId,
      message,
      (err) => {
        if (err) {
          console.error("Error sending reply:", err);
        }
        if (this.log) {console.log("Reply message sent:", JSON.stringify(message));}
        callback();
    });

  }

  // static firstMessageInfoFromCommands(commands) {
  //   let type = "text";
  //   let text = "New message";
  //   for (let i = 0; i < commands.length; i++) {
  //     const command = commands[i];
  //     console.log("cheking command", command)
  //     if (command.type === "message") {
  //       console.log("command.type: message!")
  //       console.log("command.message.type!", command.message.type)
  //       console.log("command.message.text!", command.message.text)
        
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
  //   // console.log("message_info:", message_info);
  //   return message_info;
  // }

}

module.exports = { DirMessage };