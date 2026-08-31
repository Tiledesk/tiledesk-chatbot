const { TiledeskClient } = require("@tiledesk/tiledesk-client");
const winston = require('../../utils/winston');
const { BaseDirective } = require('../BaseDirective');

class DirRemoveCurrentBot extends BaseDirective {

  constructor(context) {
    super(context);

    this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___", log: this.log });
  }

  execute(directive, callback) {
    winston.verbose("Execute RemoveCurrentBot directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else if (directive.parameter) {
      action = {};
    }
    else {
      winston.warn("DirRemoveCurrentBot Incorrect directive: ", directive);
      callback();
    }
    this.go(action, () => {
      callback();
    })
  }

  go(action, callback) {
    winston.debug("(RemoveCurrentBot) Action: ", action);
    this.tdClient.removeCurrentBot(this.requestId, (err) => {
      callback();
    });
  }
}

module.exports = { DirRemoveCurrentBot };