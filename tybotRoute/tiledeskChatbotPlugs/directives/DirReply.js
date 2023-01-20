const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');

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
  }

  execute(directive, callback) {
    console.log("Reply directive:", directive);
    let action;
    if (directive.action) {
      action = directive.action;
      console.log("got action:", JSON.stringify(action));
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
      const filler = new Filler();
      // fill text attribute
      message.text = filler.fill(message.text, requestVariables);
      // fill commands' text attribute
      if (message.attributes && message.attributes.commands) {
        let commands = message.attributes.commands;
        if (commands.length > 1) {
          for (let i = 0; i < commands.length; i++) {
            if (commands[i].type === 'message' && commands[i].message && commands[i].message.text) {
              commands[i].message.text = this.fillWithRequestParams(commands[i].message.text, requestVariables);
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
    if (this.log) {console.log("Message to extEndpoint:", message)};
    this.context.tdclient.sendSupportMessage(
      this.requestId,
      message,
      (err) => {
        if (err) {
          console.error("Error sending reply:", err.message);
        }
        if (this.log) {console.log("Message sent.");}
        callback();
    });
  }

}

module.exports = { DirReply };