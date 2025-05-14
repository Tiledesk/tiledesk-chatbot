const { Directives } = require('./Directives');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskChatbotConst } = require('../../engine/TiledeskChatbotConst');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const winston = require('../../utils/winston');
const { Logger } = require('../../Logger');

class DirMoveToUnassigned {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.requestId = context.requestId;
    this.API_ENDPOINT = context.API_ENDPOINT;
    
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.attributes?.intent_info?.intent_id });
    this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___" });
  }

  execute(directive, callback) {
    this.logger.info("[Move to Unassigned] Executing action");
    winston.verbose("Execute MoveToUnassigned directive");
    directive.action = {};
    this.go(directive.action, () => {
      this.logger.info("[Move to Unassigned] Action completed");
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