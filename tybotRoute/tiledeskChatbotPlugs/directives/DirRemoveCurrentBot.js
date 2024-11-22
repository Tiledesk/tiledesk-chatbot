const { TiledeskClient } = require("@tiledesk/tiledesk-client");

class DirRemoveCurrentBot {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }

    this.context = context;
    this.tdclient = context.tdclient;
    this.requestId = context.requestId;

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
    }
    else if (directive.parameter) {
      action = {};
    }
    else {
      callback();
    }
    this.go(action, () => {
      callback();
    })
  }

  go(action, callback) {
    this.tdclient.removeCurrentBot(this.requestId, (err) => {
      callback();
    });
  }
}

module.exports = { DirRemoveCurrentBot };