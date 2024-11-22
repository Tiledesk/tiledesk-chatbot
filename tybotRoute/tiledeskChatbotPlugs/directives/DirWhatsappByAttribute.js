const axios = require("axios").default;
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');

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
    console.log("\n\nwhatsapp by attribtues action (execute) - directive: ", directive);
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      console.error("Incorrect directive: ", JSON.stringify(directive));
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    })
  }

  async go(action, callback) {

    if (this.log) {
      console.log("whatsapp by attributes action: ", JSON.stringify(action))
    }

    const whatsapp_api_url_pre = process.env.WHATSAPP_ENDPOINT;

    if (whatsapp_api_url_pre) {
      whatsapp_api_url = whatsapp_api_url_pre;
    } else {
      whatsapp_api_url = this.API_ENDPOINT + "/modules/whatsapp/api"
    }
    console.log("DirWhatsappByAttribute whatsapp_api_url: ", whatsapp_api_url);

    if (!action.attributeName) {
      console.error("DirWhatsappByAttribute attributeName is mandatory")
      callback();
      return;
    }
    if (this.log) { console.log("DirWhatsappByAttribute attributeName: ", action.attributeName )};

    const attribute_value = await TiledeskChatbot.getParameterStatic(this.context.tdcache, this.context.requestId, action.attributeName)
    if (this.log) { console.log("attribute_value:", JSON.stringify(attribute_value)); }

    if (attribute_value == null) {
      console.error("DirWhatsappByAttribute attribute_value is undefined");
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
            console.log("(tybot) broadcast sent: ", resbody);
            resolve(resbody);
          }
        }, true);
    })

  }

  // HTTP REQUEST
  static async myrequest(options, callback, log) {
    console.log("my request execution")
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
      console.error("(tybot request) An error occured: ", err);
      if (callback) {
        callback(err, null, null);
      }
    })
  }
}

module.exports = { DirWhatsappByAttribute }