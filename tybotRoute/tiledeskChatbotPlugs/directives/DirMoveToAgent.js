// const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { Directives } = require('./Directives');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskChatbotConst } = require('../../models/TiledeskChatbotConst');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const winston = require('../../utils/winston');

class DirMoveToAgent {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.log = context.log;

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
    winston.verbose("Execute MoveToAgent directive");
    directive.action = {};
    this.go(directive.action, () => {
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