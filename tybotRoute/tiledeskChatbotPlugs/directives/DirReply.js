const { ExtApi } = require('../../ExtApi.js');
const { Directives } = require('./Directives.js');

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
    let action;
    if (directive.action) {
      console.log("got action:", JSON.stringify(action));
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

  go(action, callback) {
    // const message = action.body.message;
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