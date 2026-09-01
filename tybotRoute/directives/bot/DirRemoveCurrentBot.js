const { TiledeskClient } = require("@tiledesk/tiledesk-client");
const winston = require('../../utils/winston');
const { BaseDirective } = require('../BaseDirective');
const { Directives } = require('../Directives');

class DirRemoveCurrentBot extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.REMOVE_CURRENT_BOT];

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
      return;
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