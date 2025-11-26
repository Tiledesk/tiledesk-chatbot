let axios = require('axios');
let https = require("https");
const { v4: uuidv4 } = require('uuid');
const winston = require('../../utils/winston');
const tilebotService = require('../../services/TilebotService');

class DirIntent {

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
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else if (directive.parameter && directive.parameter.trim() !== "") {
      action = {
        intentName: directive.parameter.trim()
      }
    }
    else {
      winston.error("DirIntent Incorrect directive:", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    });
  }

  go(action, callback) {
    const intentName = action.intentName;
    const projectId = this.supportRequest.id_project;
    const requestId = this.supportRequest.request_id;
    const draft = this.supportRequest.draft;
    const botId = this.supportRequest.bot_id;
    let intent_command;
    if (intentName) {
      intent_command = "/" + intentName;
    }
    else {
      callback();
      return;
    }

    let intent_command_request = {
      "payload": {
        "_id": uuidv4(),
        "senderFullname": "_tdinternal",
        "type": "text",
        "sender": "_tdinternal",
        "recipient": requestId,
        "text": intent_command,
        "id_project": projectId,
        "request": {
          "request_id": requestId,
          "id_project": projectId,
          "draft": draft
        }
      },
      "token": this.token
    }
    winston.debug("DirIntent move to intent message: ", intent_command_request);

    // TODO - richiamare endpoint differente (executeBlock)
    tilebotService.executeBlock(intent_command_request, botId, () => {
      callback(true);
    });

    // tilebotService.sendMessageToBot(intent_command_request, botId, () => {
    //   callback(true);
    // });

  }

  static intentDirectiveFor(intent, json_params) {
    let string_params = null;
    if (json_params) {
      try {
        string_params = JSON.stringify(json_params);
      }
      catch (error) {
        winston.error("(DirIfOpenHours) Error stringing JSON PARAMS ", json_params);
      }
    }
    if (string_params != null) {
      intent += string_params
    }
    let intentDirective = {
      action: {
        intentName: intent
      }
    }
    return intentDirective;
  }

  static fullIntentDirectiveFor(intent, json_params) {
    let string_params = JSON.stringify(params);
    let intentDirective = {
      action: {
        intentName: intent
      }
    }
    return intentDirective;
  }

}

module.exports = { DirIntent };