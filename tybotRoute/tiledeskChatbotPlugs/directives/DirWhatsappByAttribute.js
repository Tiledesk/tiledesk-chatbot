const axios = require("axios").default;
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
    this.API_ENDPOINT = context.API_ENDPOINT;
    this.log = context.log;
  }

  execute(directive, callback) {
    winston.verbose("Execute WhatsappByAttribute directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.warn("DirWhatsappByAttribute Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, () => {
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