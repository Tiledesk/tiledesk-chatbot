const axios = require("axios").default;
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
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
      DirWhatsappByAttribute.myrequest(
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

  // HTTP REQUEST
  static async myrequest(options, callback, log) {
    return await axios({
      url: options.url,
      method: options.method,
      data: options.json,
      params: options.params,
      headers: options.headers
    }).then((res) => {
      if (res && res.status == 200 && res.data) {
        if (callback) {
          callback(null, res.data);
        }
      }
      else {
        if (callback) {
          callback(TiledeskClient.getErr({ message: "Response status not 200" }, options, res), null, null);
        }
      }
    }).catch((err) => {
      winston.error("(DirWhatsappByAttribute) An error occured: ", err);
      if (callback) {
        callback(err, null, null);
      }
    })
  }
}

module.exports = { DirWhatsappByAttribute }