const axios = require("axios").default;
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");

let whatsapp_api_url;

class DirSendWhatsapp {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.intentDir = new DirIntent(context);
    this.log = context.log;
  }

  execute(directive, callback) {
    if (this.log) { console.log("DirWhatsappStatic directive: ", directive); }
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

    if (this.log) { console.log("DirWhatsappStatic action: ", JSON.stringify(action)) }
    if (!this.tdcache) {
      console.error("Error: DirAskGPT tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;

    console.log("Payload: ", action.payload);

    let requestVariables = null;
    requestVariables = 
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    // Declarations
    let payload = action.payload;

    if (this.log) {
      // Declaration logs
    }

    const filler = new Filler();
    
    // receiver_list will be of just one element, so we can pick up only the first element, if exists.
    let receiver = payload.receiver_list[0];

    console.log("receiver (before): ", receiver);
    

    //header_params: text, image, document. NO: location
    //body_params: text
    //button_params: text
    //footer_paramas: non supportati

    receiver = await this.fillWholeReceiver(receiver, requestVariables);
    console.log("receiver (after): ", receiver);
    console.log("receiver (after): ", receiver.header_params);

    payload.receiver_list[0] = receiver;


    payload.transaction_id = this.context.requestId;
    payload.broadcast = false;
    
    const whatsapp_api_url_pre = process.env.WHATSAPP_ENDPOINT;
    const server_base_url = process.env.API_URL || process.env.API_ENDPOINT;

    if (whatsapp_api_url_pre) {
      whatsapp_api_url = whatsapp_api_url_pre;
    } else {
      whatsapp_api_url = server_base_url + "/modules/whatsapp/api"
    }
    console.log("DirSendWhatsapp whatsapp_api_url: ", whatsapp_api_url);

    const HTTPREQUEST = {
      url: whatsapp_api_url + "/tiledesk/broadcast",
      headers: {
        'Content-Type': 'application/json'
      },
      json: attribute_value,
      method: 'POST'
    }

    this.#myrequest(
      HTTPREQUEST, async (err, resbody) => {
        if (this.log && err) {
          console.log("")
        }
      }
    )

    // JSON sample
    // {
    //   "id_project": "62c3f10152dc7400352bab0d",
    //   "phone_number_id": "109639215462567",
    //   "template": {
    //     "name": "codice_sconto_2",
    //     "language": "it"
    //   },
    //   "receiver_list": [
    //     {
    //       "phone_number": "+393484506627",
    //       "body_params": [
    //         {
    //           "type": "text",
    //           "text": "Giovanni"
    //         },
    //         {
    //           "type": "text",
    //           "text": "30%"
    //         },
    //         {
    //           "type": "text",
    //           "text": "SUMMER2024"
    //         }
    //       ]
    //     }
    //   ]
    // }
    console.log("payload to be sent: ", JSON.stringify(payload, null, 2));


    

    if (callback) {
      if (trueIntent) {
        console.log("exec true intent")
        await this.#executeCondition(true, trueIntent, null, falseIntent, null);
        
        callback();
        return;
      }
      callback();
      return;
    }








    // const whatsapp_api_url_pre = process.env.WHATSAPP_ENDPOINT;
    // const server_base_url = process.env.API_URL || process.env.API_ENDPOINT;

    // if (whatsapp_api_url_pre) {
    //   whatsapp_api_url = whatsapp_api_url_pre;
    // } else {
    //   whatsapp_api_url = server_base_url + "/modules/whatsapp/api"
    // }
    // console.log("DirWhatsappByAttribute whatsapp_api_url: ", whatsapp_api_url);

    // if (!action.attributeName) {
    //   console.error("DirWhatsappByAttribute attributeName is mandatory")
    //   callback();
    //   return;
    // }
    // if (this.log) { console.log("DirWhatsappByAttribute attributeName: ", action.attributeName )};

    // const attribute_value = await TiledeskChatbot.getParameterStatic(this.context.tdcache, this.context.requestId, action.attributeName)
    // if (this.log) { console.log("attribute_value:", JSON.stringify(attribute_value)); }

    // if (attribute_value == null) {
    //   console.error("DirWhatsappByAttribute attribute_value is undefined");
    //   callback();
    //   return;
    // }

    // attribute_value.transaction_id = this.context.requestId;

    // const HTTPREQUEST = {
    //   url: whatsapp_api_url + "/tiledesk/broadcast",
    //   headers: {
    //     'Content-Type': 'application/json'
    //   },
    //   json: attribute_value,
    //   method: 'POST'
    // }

    // return new Promise((resolve, reject) => {
    //   DirWhatsappByAttribute.myrequest(
    //     HTTPREQUEST,
    //     function (err, resbody) {
    //       if (err) {
    //         if (callback) {
    //           callback(err);
    //         }
    //         reject(err);
    //       }
    //       else {
    //         if (callback) {
    //           callback(null, resbody);
    //         }
    //         console.log("(tybot) broadcast sent: ", resbody);
    //         resolve(resbody);
    //       }
    //     }, true);
    // })

  }

  async #executeCondition(result, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, callback) {
    console.log("executeCondition...")
    let trueIntentDirective = null;
    if (trueIntent) {
      trueIntentDirective = DirIntent.intentDirectiveFor(trueIntent, trueIntentAttributes);
    }
    let falseIntentDirective = null;
    if (falseIntent) {
      falseIntentDirective = DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes);
    }
    if (result === true) {
      if (trueIntentDirective) {
        this.intentDir.execute(trueIntentDirective, () => {
          if (callback) {
            callback();
          }
        })
      }
      else {
        if (this.log) { console.log("No trueIntentDirective specified"); }
        if (callback) {
          callback();
        }
      }
    }
    else {
      if (falseIntentDirective) {
        this.intentDir.execute(falseIntentDirective, () => {
          if (callback) {
            callback();
          }
        });
      }
      else {
        if (this.log) { console.log("No falseIntentDirective specified"); }
        if (callback) {
          callback();
        }
      }
    }
  }

  async fillWholeReceiver(receiver, requestVariables) {
    return new Promise((resolve) => {

      const filler = new Filler();
      try {

        receiver.phone_number = filler.fill(receiver.phone_number, requestVariables);
        if (receiver.header_params) {
          receiver.header_params.forEach(p => {
            console.log("p: ", p)
            if (p.type === 'TEXT') {
              p.text = filler.fill(p.text, requestVariables)
            } 
            else if (p.type === 'IMAGE') {
              p.image.link = filler.fill(p.image.link, requestVariables)
            }
            else if (p.type === 'DOCUMENT') {
              p.document.link = filler.fill(p.document.link, requestVariables)
            }
          })
        }
    
        if (receiver.body_params) {
          receiver.body_params.forEach(p => {
            p.text = filler.fill(p.text, requestVariables)
          })
        }
    
        if (receiver.buttons_params) {
          receiver.buttons_params.forEach(p => {
            p.text = filler.fill(p.text, requestVariables)
          })
        }

        resolve(receiver);

      } catch(err) {
        console.error("DirSendWhatsapp fillWholeReceiver error: ", err)
        resolve(null);
      }

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

module.exports = { DirSendWhatsapp }