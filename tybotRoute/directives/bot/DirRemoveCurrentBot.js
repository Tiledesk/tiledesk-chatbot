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
    // The same three calls TiledeskClient.removeCurrentBot() makes, driven here
    // instead. That method only calls back from inside
    // `if (request.participantsBots && request.participantsBots.length > 0)`,
    // so a conversation with no participant bot -- exactly the state a previous
    // removecurrentbot leaves behind -- never reaches the callback and the flow
    // stalls with no reply, no log and no error. Every path below calls back.
    // Promise.resolve(...).catch: getRequestById and updateRequestProperties
    // BOTH call their callback and reject their own promise on an error -- the
    // `reject(err)` sits outside the `if (callback)` guard in the client. The
    // callbacks below already log and release the flow; the rejections need
    // handling too, or they go unhandled and kill the worker under Node's
    // default --unhandled-rejections=throw. Promise.resolve(...) rather than a
    // direct .catch, so a test double that returns nothing still works.
    Promise.resolve(this.tdClient.getRequestById(this.requestId, (err, request) => {
      if (err) {
        winston.error("(RemoveCurrentBot) Error reading the request: ", err);
        return callback();
      }
      const bots = request ? request.participantsBots : null;
      if (!bots || bots.length === 0) {
        winston.debug("(RemoveCurrentBot) No participant bot to remove.");
        return callback();
      }
      const participantId = this.tdClient.normalizeBotId(bots[0]);
      this.tdClient.deleteRequestParticipant(this.requestId, participantId, (err) => {
        if (err) {
          winston.error("(RemoveCurrentBot) Error removing the bot participant: ", err);
          return callback();
        }
        Promise.resolve(this.tdClient.updateRequestProperties(this.requestId, { status: 50 }, (err) => {
          if (err) {
            winston.error("(RemoveCurrentBot) Error handing the conversation over: ", err);
          }
          callback();
        })).catch((err) => {
          winston.debug("(RemoveCurrentBot) updateRequestProperties rejected, already handled in the callback: ", err && err.message);
        });
      });
    })).catch((err) => {
      winston.debug("(RemoveCurrentBot) getRequestById rejected, already handled in the callback: ", err && err.message);
    });
  }
}

module.exports = { DirRemoveCurrentBot };