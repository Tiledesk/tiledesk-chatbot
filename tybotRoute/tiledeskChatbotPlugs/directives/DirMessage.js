const { ExtApi } = require('../../ExtApi.js');
const { Directives } = require('./Directives.js');

class DirMessage {

  // constructor(settings) {
  //   if (!settings.API_ENDPOINT) {
  //     throw new Error("settings.API_ENDPOINT is mandatory!");
  //   }
  //   this.API_ENDPOINT = settings.API_ENDPOINT;
  //   this.TILEBOT_ENDPOINT = settings.TILEBOT_ENDPOINT;
  //   this.projectId = settings.projectId;
  //   this.requestId = settings.requestId;
  //   this.token = settings.token;
  // }

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.API_ENDPOINT = context.TILEDESK_APIURL,
    this.TILEBOT_ENDPOINT = context.TILEBOT_ENDPOINT;
    this.projectId = context.projectId;
    this.requestId = context.requestId;
    this.token = context.token;
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      // console.log("got action:", JSON.stringify(action));
      action = directive.action;
      if (action.body && action.body.message) {
        if (!action.body.message.attributes) {
          action.body.message.attributes = {}
        }
        action.body.message.attributes.directives = false;
        action.body.message.attributes.splits = false;
        action.body.message.attributes.markbot = false;
        action.body.message.attributes.fillParams = true; // fillParams can fill commands[].message.text
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
    }
    else if (directive.parameter) {
      let text = directive.parameter.trim();
      action = {
        body: {
          message: {
            text: text,
            attributes: {
              directives: false,
              splits: true,
              markbot: true,
              fillParams: true
            }
          }
        }
      }
      if (directive.name === Directives.HMESSAGE) {
        action.body.message.attributes.subtype = "info";
      }
    }
    else {
      console.error("Incorrect directive:", directive);
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    });
  }

  go(action, callback) {
    const message = action.body.message;
    if (this.log) {console.log("Message to extEndpoint:", message)};
    let extEndpoint = `${this.API_ENDPOINT}/modules/tilebot`;
    if (this.TILEBOT_ENDPOINT) {
      extEndpoint = `${this.TILEBOT_ENDPOINT}`;
    }
    const apiext = new ExtApi({
      ENDPOINT: extEndpoint,
      log: false
    });
    if (message.text) {
      message.text = message.text.replace(/\\n/g, "\n");
    }
    // message.text = "Ciao1\n\nCIao2"
    // console.log("sendSupportMessageExt from dirmessage", message);
    apiext.sendSupportMessageExt(
      message,
      this.projectId,
      this.requestId,
      this.token,
      () => {
        if (this.log) {console.log("Ext message sent.");}
        callback();
    });
  }

  static firstMessageInfoFromCommands(commands) {
    let type = "text";
    let text = "New message";
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      console.log("cheking command", command)
      if (command.type === "message") {
        console.log("command.type: message!")
        console.log("command.message.type!", command.message.type)
        console.log("command.message.text!", command.message.text)
        
        if (command.message.type) {
          type = command.message.type;
        }
        if (command.message.text) {
          text = command.message.text;
        }
        break;
      }
    }
    const message_info = {
      type: type,
      text: text
    }
    // console.log("message_info:", message_info);
    return message_info;
  }

}

module.exports = { DirMessage };