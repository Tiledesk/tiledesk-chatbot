const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { Filler } = require("../../variables/Filler");
const { DirIntent } = require("../flow/DirIntent");
const winston = require('../../utils/winston');
const { BaseDirective } = require("../BaseDirective");
const { Directives } = require('../Directives');
const whatsappService = require("../../services/WhatsappService");

class DirSendWhatsapp extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.SEND_WHATSAPP];

  constructor(context) {
    super(context);
    this.chatbot = context.chatbot;

    this.intentDir = new DirIntent(context);
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

    // A Send Whatsapp block saved before its template was picked carries no
    // payload at all. Reading `payload.receiver_list` off it threw a TypeError
    // out of this async go(), and execute() neither awaits nor catches the
    // promise: the rejection was unhandled, the callback never fired and the
    // conversation stalled there. Take the same exit as the "unexpected
    // resbody" branch below.
    if (!payload || !Array.isArray(payload.receiver_list) || payload.receiver_list.length === 0) {
      this.logger.error("[Send Whatsapp] payload has no receiver_list");
      winston.error("(DirSendWhatsapp) Error: payload is undefined or has no receiver_list");
      if (falseIntent) {
        await this._executeCondition(false, trueIntent, null, falseIntent, null);
        callback(true);
        return;
      }
      callback();
      return;
    }

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
    
    const { err, resbody } = await whatsappService.broadcast(payload, "(DirSendWhatsapp)");

    if (err) {
      winston.error("(DirSendWhatsapp)  error: ", err)
      await this.chatbot.addParameter("flowError", "SendWhatsapp Error: " + err);
      if (callback) {
        if (falseIntent) {
          await this._executeCondition(false, trueIntent, null, falseIntent, null);
          callback(true);
          return;
        }
        callback();
        return;
      }
    } else if (resbody.success === true) {
      if (callback) {
        if (trueIntent) {
          await this._executeCondition(true, trueIntent, null, falseIntent, null);
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
          await this._executeCondition(false, trueIntent, null, falseIntent, null);
          callback(true);
          return
        }
        callback();
        return;
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