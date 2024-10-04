// const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { Directives } = require('./Directives');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskChatbotConst } = require('../../models/TiledeskChatbotConst');

class DirMoveToAgent {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdclient = context.tdclient;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.log = context.log;
  }

  execute(directive, callback) {
    directive.action = {};
    this.go(directive.action, () => {
      callback();
    });
  }

  async go(action, callback) {
    this.tdclient.moveToAgent(this.requestId, (err) => {
      if (err) {
        console.error("Error moving to agent:", err);
      }
      else {
        // console.log("Successfully moved to agent");
      }
      callback();
    });
  }

}

module.exports = { DirMoveToAgent };