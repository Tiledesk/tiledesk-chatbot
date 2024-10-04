// const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { Directives } = require('./Directives');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskChatbotConst } = require('../../models/TiledeskChatbotConst');

class DirMoveToUnassigned {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdclient = context.tdclient;
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
    this.moveToUnassigned(this.requestId, (err) => {
      if (err) {
        console.error("Error moving to unassigned:", err);
      }
      else {
        // console.log("Successfully moved to unassigned");
      }
      callback();
    });
  }

  async moveToUnassigned(requestId, callback) {
    const empty_participants = [] // STATUS WILL MOVE AUTOMATICALLY TO UNASSIGNED (100)
    this.tdclient.updateRequestParticipants(requestId, empty_participants, (err) => {
      if (callback) {
        callback(err);
      }
    });
  }

  

}

module.exports = { DirMoveToUnassigned };