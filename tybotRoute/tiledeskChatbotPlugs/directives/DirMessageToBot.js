let axios = require('axios');
let https = require("https");
const { v4: uuidv4 } = require('uuid');
const winston = require('../../utils/winston');
const tilebotService = require('../../services/TilebotService');

class DirMessageToBot {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.API_ENDPOINT = context.API_ENDPOINT,
    this.TILEBOT_ENDPOINT = context.TILEBOT_ENDPOINT;
    this.supportRequest = context.supportRequest;
    this.token = context.token;
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