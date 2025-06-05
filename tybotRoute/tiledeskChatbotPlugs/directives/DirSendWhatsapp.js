const axios = require("axios").default;
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
const winston = require('../../utils/winston');
const httpUtils = require("../../utils/HttpUtils");
const { Logger } = require("../../Logger");

let whatsapp_api_url;

class DirSendWhatsapp {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.chatbot = context.chatbot;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.API_ENDPOINT = this.context.API_ENDPOINT;
    
    this.intentDir = new DirIntent(context);
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    winston.verbose("Execute SendWhatsapp directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirSendWhatsapp Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Send Whatsapp] Executed");
      callback(stop);
    })
  }

  async go(action, callback) {

    winston.debug("(DirSendWhatsapp) Action: ", action);
    if (!this.tdcache) {
      winston.error("(DirSendWhatsapp) Error: tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;

    let requestVariables = null;
    requestVariables = 
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    // Declarations
    let payload = action.payload;

    const filler = new Filler();
    
    // receiver_list will be of just one element, so we can pick up only the first element, if exists.
    let receiver = payload.receiver_list[0];
    

    //header_params: text, image, document. NO: location
    //body_params: text
    //button_params: text
    //footer_paramas: non supportati

    receiver = await this.fillWholeReceiver(receiver, requestVariables);
    payload.receiver_list[0] = receiver;
    payload.transaction_id = this.context.requestId;
    payload.broadcast = false;
    
    const whatsapp_api_url_pre = process.env.WHATSAPP_ENDPOINT;

    if (whatsapp_api_url_pre) {
      whatsapp_api_url = whatsapp_api_url_pre;
    } else {
      whatsapp_api_url = this.API_ENDPOINT + "/modules/whatsapp/api"
    }
    winston.debug("(DirSendWhatsapp) whatsapp_api_url: " + whatsapp_api_url);

    const HTTPREQUEST = {
      url: whatsapp_api_url + "/tiledesk/broadcast",
      headers: {
        'Content-Type': 'application/json'
      },
      json: payload,
      method: 'POST'
    }

    winston.debug("(DirSendWhatsapp) HttpRequest:  ", HTTPREQUEST);

    httpUtils.request(
      HTTPREQUEST, async (err, resbody) => {
        if (err) {
          winston.error("(DirSendWhatsapp)  error: ", err)
          await this.chatbot.addParameter("flowError", "SendWhatsapp Error: " + err);
          if (callback) {
            if (falseIntent) {
              await this.#executeCondition(false, trueIntent, null, falseIntent, null);
              callback(true);
              return;
            }
            callback();
            return;
          }
        } else if (resbody.success === true) {
          if (callback) {
            if (trueIntent) {
              await this.#executeCondition(true, trueIntent, null, falseIntent, null);
              callback(true);
              return;
            }
            callback();
            return;
          }
        } else {
          winston.debug("(DirSendWhatsapp) unexpected resbody: ", resbody);
          if (callback) {
            if (falseIntent) {
              await this.#executeCondition(false, trueIntent, null, falseIntent, null);
              callback(true);
              return
            }
            callback();
            return;
          }
        }
      }
    )
  }

  async #executeCondition(result, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, callback) {
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
        winston.debug("(DirSendWhatsapp) No trueIntentDirective specified");
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
        winston.debug("(DirSendWhatsapp) No falseIntentDirective specified");
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
        winston.error("(DirSendWhatsapp) fillWholeReceiver error: ", err)
        resolve(null);
      }

    })
  }
}

module.exports = { DirSendWhatsapp }