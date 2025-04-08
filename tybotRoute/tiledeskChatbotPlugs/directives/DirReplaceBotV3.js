const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { Filler } = require('../Filler');

const axios = require("axios").default;
let https = require("https");
const winston = require('../../utils/winston');
const httpUtils = require('../../utils/HttpUtils');

class DirReplaceBotV3 {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.requestId = context.requestId;

    this.API_ENDPOINT = context.API_ENDPOINT;
    this.tdClient = new TiledeskClient({
      projectId: this.context.projectId,
      token: this.context.token,
      APIURL: this.API_ENDPOINT,
      APIKEY: "___"
    });
  }

  execute(directive, callback) {
    winston.verbose("Execute ReplaceBotV3 directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.warn("DirReplaceBotV3 Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    })
  }

  async go(action, callback) {
    winston.debug("(DirReplaceBotV3) Action: ", action);
    let botId = action.botId;
    let botSlug = action.botSlug;
    let useSlug = action.useSlug;
    let blockName = action.blockName;
    let variables = null;
    variables = 
    await TiledeskChatbot.allParametersStatic(
      this.context.tdcache, this.context.requestId
    );
    const filler = new Filler();
    //botId = filler.fill(botId, variables);
    botSlug = filler.fill(botSlug, variables);
    blockName = filler.fill(blockName, variables);

    let data = {};
    if (useSlug && useSlug === true) {
      data.slug = botSlug;
    } else {
      data.id = botId;
    }

    const HTTPREQUEST = {
      url: this.API_ENDPOINT + "/" + this.context.projectId + "/requests/" + this.requestId + "/replace",
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'JWT ' + this.context.token
      },
      json: data,
      method: 'PUT'
    }

    httpUtils.request(
      HTTPREQUEST, async (err, resbody) => {
        if (err) {
          winston.error("(DirReplaceBotV3) error: ", err);
          if (callback) {
            callback();
            return;
          }
        }

        winston.debug("(DirReplaceBotV3)  replace resbody: ", resbody);
        if (blockName) {
          winston.debug("(DirReplaceBotV3) Sending hidden /start message to bot in dept");
          const message = {
            type: "text",
            text: "/" + blockName,
            attributes: {
              subtype: "info"
            }
          }
          this.tdClient.sendSupportMessage(
            this.requestId,
            message, (err) => {
              if (err) {
                winston.debug("(DirReplaceBotV3) Error sending hidden message: " + err.message);
              }
              callback();
            });
        }
        else {
          callback();
        }
      }
    )
  }

}

module.exports = { DirReplaceBotV3 };