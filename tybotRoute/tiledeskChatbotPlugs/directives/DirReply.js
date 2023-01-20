const { Filler } = require('../Filler');

class DirReply {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.projectId = context.projectId;
    this.requestId = context.requestId;
    this.token = context.token;
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
    // fill
    let requestVariables = null;
    if (this.tdcache) {
      requestVariables = 
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );
    }
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
    if (all_parameters['userEmail']) {
        message.attributes.updateUserEmail = all_parameters['userEmail'];
    }
    if (all_parameters['userFullname']) {
      message.attributes.updateUserFullname = all_parameters['userFullname'];
    }
    // send!
    const message = action;
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