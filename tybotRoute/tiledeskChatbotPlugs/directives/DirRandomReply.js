const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskChatbotUtil } = require('../../models/TiledeskChatbotUtil');

class DirRandomReply {

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
        const rnd_commands = TiledeskChatbotUtil.chooseRandomReply(message);
        message.attributes.commands = rnd_commands;
        if (this.log) {console.log("filling commands'. commands found.");}
        let commands = message.attributes.commands;
        if (this.log) {console.log("commands:", JSON.stringify(commands), commands.length);}
        if (commands.length > 0) {
          if (this.log) {console.log("commands' found");}
          for (let i = 0; i < commands.length; i++) {
            if (commands[i].type === 'message' && commands[i].message && commands[i].message.text) {
              commands[i].message.text = filler.fill(commands[i].message.text, requestVariables);
              if (this.log) {console.log("command filled:", commands[i].message.text);}
            }
          }
        }
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
}

module.exports = { DirRandomReply };