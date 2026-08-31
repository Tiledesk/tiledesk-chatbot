const { Directives } = require('../Directives');
const { TiledeskChatbot } = require('../../../engine/TiledeskChatbot');
const { TiledeskChatbotConst } = require('../../../engine/TiledeskChatbotConst');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const winston = require('../../../utils/winston');
const { BaseDirective } = require('../../BaseDirective');

class DirMoveToUnassigned extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.MOVE_TO_UNASSIGNED];

  constructor(context) {
    super(context);

    this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___" });
  }

  execute(directive, callback) {
    winston.verbose("Execute MoveToUnassigned directive");
    directive.action = {};
    this.go(directive.action, () => {
      this.logger.native("[Move to Unassigned] Executed");
      callback();
    });
  }

  async go(action, callback) {
    this.moveToUnassigned(this.requestId, (err) => {
      if (err) {
        winston.error("(DirMoveToUnassigned) Error moving to unassigned: ", err);
      }
      else {
        // Successfully moved to unassigned
      }
      callback();
    });
  }

  async moveToUnassigned(requestId, callback) {
    const empty_participants = [] // STATUS WILL MOVE AUTOMATICALLY TO UNASSIGNED (100)
    this.tdClient.updateRequestParticipants(requestId, empty_participants, (err) => {
      if (callback) {
        callback(err);
      }
    });
  }

  

}

module.exports = { DirMoveToUnassigned };