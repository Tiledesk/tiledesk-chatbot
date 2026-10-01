const { TiledeskClient } = require("@tiledesk/tiledesk-client");
const winston = require('../../utils/winston');
const HttpUtils = require('../../utils/HttpUtils').constructor;

class DirRemoveCurrentBot {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }

    this.context = context;
    this.requestId = context.requestId;
    this.API_ENDPOINT = context.API_ENDPOINT;

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
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      callback();
    };
    const fail = (step, err) => {
      winston.error("(RemoveCurrentBot) " + step + " error: ", HttpUtils.errorSummary(err));
      finish();
    };
    const requestId = this.requestId;
    this.tdClient.getRequestById(requestId, (err, request) => {
      if (err) {
        return fail("getRequestById", err);
      }
      const bots = request && request.participantsBots;
      if (!bots || bots.length === 0) {
        return finish();
      }
      const botParticipant = this.tdClient.normalizeBotId(bots[0]);
      const participants = Array.isArray(request.participants) ? request.participants : [];
      // Any participant besides the removed bot (human or another bot) keeps the
      // conversation ASSIGNED (the server already handles the status): don't touch it.
      const botOnly = !participants.some((p) => p !== botParticipant);
      this.tdClient.deleteRequestParticipant(requestId, botParticipant, (err) => {
        if (err) {
          return fail("deleteRequestParticipant", err);
        }
        if (!botOnly) {
          return finish();
        }
        this.tdClient.updateRequestProperties(requestId, { status: 50 }, (err) => {
          if (err) {
            return fail("updateRequestProperties", err);
          }
          finish();
        });
      });
    });
  }
}

module.exports = { DirRemoveCurrentBot };
