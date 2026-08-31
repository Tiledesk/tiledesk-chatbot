const { v4: uuidv4 } = require('uuid');
const winston = require('../../utils/winston');
const tilebotService = require('../../services/TilebotService');
const { BaseDirective } = require('../BaseDirective');

class DirMessageToBot extends BaseDirective {

  constructor(context) {
    super(context);
    this.TILEBOT_ENDPOINT = context.TILEBOT_ENDPOINT;
    this.supportRequest = context.supportRequest;
  }

  execute(directive, callback) {
    winston.verbose("Execute MessageToBot directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.warn("DirMessageToBot Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    });
  }

  go(action, callback) {
    winston.debug("(DirMessageToBot) Action: ", action);
    
    const message = action.message;
    const botId = this.supportRequest.bot_id;

    let outgoing_message = {
      "payload": message,
      "token": this.token
    }
    winston.debug("(DirMessageToBot) sending message: ", outgoing_message);
    
    tilebotService.sendMessageToBot(outgoing_message, botId, () => {
      callback(true);
    });
  }

}

module.exports = { DirMessageToBot };