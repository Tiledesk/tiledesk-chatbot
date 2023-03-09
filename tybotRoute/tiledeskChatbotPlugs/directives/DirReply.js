const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskChatbotUtil } = require('../../models/TiledeskChatbotUtil');

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
  }

  execute(directive, callback) {
    // console.log("Reply directive:", JSON.stringify(directive));
    let action;
    if (directive.action) {
      action = directive.action;
      // console.log("got action:", JSON.stringify(action));
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
    let requestVariables = null;
    if (this.tdcache) {
      requestVariables = 
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );
      if (this.log) {
        for (const [key, value] of Object.entries(requestVariables)) {
          const value_type = typeof value;
          if (this.log) {console.log("(DirReply) request parameter:", key, "value:", value, "type:", value_type)}
        }
      }
      const filler = new Filler();
      // fill text attribute
      message.text = filler.fill(message.text, requestVariables);
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
              command.message.text = filler.fill(command.message.text, requestVariables);
              TiledeskChatbotUtil.fillCommandAttachments(command, requestVariables, this.log);
              if (this.log) {console.log("command filled:", command.message.text);}
            }
          }
        }
      }

      // EVALUATE EXPRESSION AND REMOVE BASED ON EVALUATION
      // const mylang = requestVariables["mylang"];
      // console.log("filterOnVariables:", JSON.stringify(requestVariables));
      // if (message.attributes && message.attributes.commands) {
      //   TiledeskChatbotUtil.filterOnLanguage(message.attributes.commands, mylang);
      // }
      if (message.attributes && message.attributes.commands) {
        if (this.log) {console.log("filterOnVariables...on commands", JSON.stringify(message.attributes.commands));}
        TiledeskChatbotUtil.filterOnVariables(message.attributes.commands, requestVariables);
      }
      
      // temporary send back of reserved attributes
      if (!message.attributes) {
        message.attributes = {}
      }
      // Reserved names: userEmail, userFullname
      if (requestVariables['userEmail']) {
          message.attributes.updateUserEmail = requestVariables['userEmail'];
      }
      if (requestVariables['userFullname']) {
        message.attributes.updateUserFullname = requestVariables['userFullname'];
      }
    }
    // send!
    if (this.log) {console.log("Reply:", JSON.stringify(message))};
    this.context.tdclient.sendSupportMessage(
      this.requestId,
      message,
      (err) => {
        if (err) {
          console.error("Error sending reply:", err.message);
        }
        if (this.log) {console.log("Reply message sent.");}
        callback();
    });
  }

  // fillCommandTemplates(command, variables) {
  //   if (command && command.attributes && command.attachment && command.attachment.buttons && command.attachment.buttons.length > 0){
  //     let buttons = command.attachment.buttons.length;
  //     const filler = new Filler();
  //     buttons.forEach(button => {
  //       if (button.link) {
  //         button.link = filler.fill(button.link, variables);
  //       }
  //     });
  //   }
  // }

}

module.exports = { DirReply };