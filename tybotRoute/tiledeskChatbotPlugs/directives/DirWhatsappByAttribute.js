const axios = require("axios").default;
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');

const whatsapp_api_url = "https://tiledesk-whatsapp-app-pre.giovannitroisi3.repl.co/ext"

class DirWhatsappByAttribute {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    console.log("\n\nwhatsapp attributes context: ", context);
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
    }
    console.log("whatsapp by attributes action: ", JSON.stringify(action))
    if (action.attributeName) {
        console.log("attributeName:", attributeName);
        let attribute_value = null;
        if (this.context.tdcache) {

            const attribute_value = await TiledeskChatbot.getParameterStatic(this.context.tdcache, requestId, action.attributeName)
            console.log("attribute_value:", attribute_value);
        // attribute_value = {
        //   id_project: "62c3f10152dc7400352bab0d",
        //   phone_number_id: "109639215462567",
        //   template: {
        //     language: "it",
        //     name: "promo_mensile"
        //   },
        //   receiver_list: [
        //     {
        //       phone_number: "393484506627",
        //       header_params: [
        //         "https://www.eurofoodservice.it/8803-medium_default/jalapenos-cheddar-5pzx1kgcgm.jpg"
        //       ],
        //       body_params: [
        //         "Giovanni",
        //         "Maggio",
        //         "JALAPENOS CHEDDAR 5PZX1KG(CGM)",
        //         "24,99",
        //         "29,99"
        //       ],
        //       buttons_params: [
        //         "?user=giovanni123456"
        //       ]
        //     }
        //   ]
        // }

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
            function(err, resbody) {
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