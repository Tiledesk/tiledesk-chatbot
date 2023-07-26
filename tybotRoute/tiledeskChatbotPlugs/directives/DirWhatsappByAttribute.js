const axios = require("axios").default;
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');

// const whatsapp_api_url = "https://tiledesk-whatsapp-app-pre.giovannitroisi3.repl.co/ext"
let whatsapp_api_url;

class DirWhatsappByAttribute {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
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

    if (process.env.API_URL) {
      whatsapp_api_url = process.env.API_URL + "/modules/whatsapp";
      console.log("(Tilebot) DirWhatsappByAttribute whatsapp_api_url: ", whatsapp_api_url);
    } else {
      console.error("(Tilebot) ERROR Missing whatsapp_api_url. Unable to use action WhatsApp By Attributes");
      callback();
      return;
    }

    if (action.attributeName) {
      if (this.log) { console.log("whatsapp attributeName:", action.attributeName); }
      let attribute_value = null;
      if (this.context.tdcache) {

        const attribute_value = await TiledeskChatbot.getParameterStatic(this.context.tdcache, this.context.requestId, action.attributeName)
        if (this.log) { console.log("attribute_value:", JSON.stringify(attribute_value)); }

        if (attribute_value == null) {
          console.error("(Tilebot) attribute_value is undefined");
          callback();
          return;
        }

        const URL = whatsapp_api_url + '/tiledesk/broadcast';
        const HTTPREQUEST = {
          url: URL,
          headers: {
            'Content-Type': 'application/json'
          },
          json: attribute_value,
          method: 'POST'
        };
        let promise = new Promise((resolve, reject) => {
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
        return promise;
      }
    }
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