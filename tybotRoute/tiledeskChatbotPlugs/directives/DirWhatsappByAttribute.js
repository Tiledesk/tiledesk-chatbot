const axios = require("axios").default;
const { Logger } = require("../../Logger");
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const httpUtils = require("../../utils/HttpUtils");
const winston = require('../../utils/winston');

let whatsapp_api_url;

class DirWhatsappByAttribute {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.requestId = this.context.requestId;
    this.API_ENDPOINT = context.API_ENDPOINT;
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest.draft, intent_id: this.context.reply.attributes.intent_info.intent_id });
  }

  execute(directive, callback) {
    this.logger.info("[Whatsapp by Attribute] Executing action");
    winston.verbose("Execute WhatsappByAttribute directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirWhatsappByAttribute Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, () => {
      this.logger.info("[Whatsapp by Attribute] Action completed");
      callback();
    })
  }

  async go(action, callback) {
    winston.debug("(DirWhatsappByAttribute) Action: ", action);

    const whatsapp_api_url_pre = process.env.WHATSAPP_ENDPOINT;

    if (whatsapp_api_url_pre) {
      whatsapp_api_url = whatsapp_api_url_pre;
    } else {
      whatsapp_api_url = this.API_ENDPOINT + "/modules/whatsapp/api"
    }
    winston.debug("(DirWhatsappByAttribute) whatsapp_api_url: " + whatsapp_api_url);

    if (!action.attributeName) {
      winston.error("(DirWhatsappByAttribute) attributeName is mandatory")
      callback();
      return;
    }
    winston.debug("(DirWhatsappByAttribute) attributeName: " + action.attributeName )

    const attribute_value = await TiledeskChatbot.getParameterStatic(this.context.tdcache, this.context.requestId, action.attributeName)
    winston.debug("(DirWhatsappByAttribute) attribute_value:", attribute_value);

    if (attribute_value == null) {
      winston.error("(DirWhatsappByAttribute)  attribute_value is undefined");
      callback();
      return;
    }

    attribute_value.transaction_id = this.context.requestId;

    const HTTPREQUEST = {
      url: whatsapp_api_url + "/tiledesk/broadcast",
      headers: {
        'Content-Type': 'application/json'
      },
      json: attribute_value,
      method: 'POST'
    }

    return new Promise((resolve, reject) => {
      httpUtils.request(
        HTTPREQUEST,
        function (err, resbody) {
          if (err) {
            if (callback) {
              callback(err);
            }
            reject(err);
          }
          else {
            if (callback) {
              callback(null, resbody);
            }
            winston.debug("(DirWhatsappByAttribute) broadcast sent: ", resbody);
            resolve(resbody);
          }
        }, true);
    })

  }
}

module.exports = { DirWhatsappByAttribute }