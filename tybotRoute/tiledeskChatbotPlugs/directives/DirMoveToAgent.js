const { Directives } = require('./Directives');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskChatbotConst } = require('../../engine/TiledeskChatbotConst');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const winston = require('../../utils/winston');
const { Logger } = require('../../Logger');

class DirMoveToAgent {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest.draft, intent_id: this.context.reply.attributes.intent_info.intent_id });

    this.API_ENDPOINT = context.API_ENDPOINT;
    this.tdClient = new TiledeskClient({
      projectId: this.context.projectId,
      token: this.context.token,
      APIURL: this.API_ENDPOINT,
      APIKEY: "___"
    });
    
  }

  execute(directive, callback) {
    this.logger.info("[Transfer to a Human] Executing action");
    winston.verbose("Execute MoveToAgent directive");
    directive.action = {};
    this.go(directive.action, () => {
      this.logger.info("[Transfer to a Human] Action completed");
      callback();
    });
  }

  async go(action, callback) {
    this.tdClient.moveToAgent(this.requestId, (err) => {
      if (err) {
        winston.error("DirMoveToAgent) Error moving to agent: ", err);
      }
      else {
        // Successfully moved to agent
      }
      callback();
    });
  }

}

module.exports = { DirMoveToAgent };