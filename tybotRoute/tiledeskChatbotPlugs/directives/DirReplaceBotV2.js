const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { Filler } = require('../Filler');

const axios = require("axios").default;
let https = require("https");
const winston = require('../../utils/winston');
const httpUtils = require('../../utils/HttpUtils');

class DirReplaceBotV2 {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
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
    this.logger.info("[Replace Bot] Executing action");
    winston.verbose("Execute ReplaceBotV2 directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else if (directive.parameter) {
      let botName = directive.parameter.trim();
      action = {
        botName: botName
      }
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirReplaceBotV2 Incorrect directive: ", directive);
      callback();
    }
    this.go(action, () => {
      this.logger.info("[Replace Bot] Action completed");
      callback();
    })
  }

  async go(action, callback) {
    winston.debug("(DirReplaceBotV2) Action: ", action);
    let botName = action.botName;
    let blockName = action.blockName;
    let variables = null;
    variables = 
    await TiledeskChatbot.allParametersStatic(
      this.context.tdcache, this.context.requestId
    );
    const filler = new Filler();
    botName = filler.fill(botName, variables);

    let data = {};
    if (action.nameAsSlug && action.nameAsSlug === true) {
      data.slug = botName;
    } else {
      data.name = botName;
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
          winston.error("(DirReplaceBotV2) DirReplaceBot error: ", err);
          if (callback) {
            callback();
            return;
          }
        }

        winston.debug("(DirReplaceBotV2) replace resbody: ", resbody)
        if (blockName) {
          winston.debug("(DirReplaceBotV2) Sending hidden /start message to bot in dept");
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
                winston.debug("(DirReplaceBotV2) Error sending hidden message: " + err.message);
              }
              callback();
            });
        }
        else {
          callback();
        }
      }
    )

    // this.tdClient.replaceBotByName(this.requestId, botName, () => {
    //   if (blockName) {
    //     const message = {
    //       type: "text",
    //       text: "/" + blockName,
    //       attributes : {
    //         subtype: "info"
    //       }
    //     }
    //     this.tdClient.sendSupportMessage(
    //       this.requestId,
    //       message, (err) => {
    //         if (err) {
    //           winston.error("Error sending hidden message:", err.message);
    //         }
    //         callback();
    //     });
    //   }
    //   else {
    //     callback();
    //   }
    // });
  }

}

module.exports = { DirReplaceBotV2 };