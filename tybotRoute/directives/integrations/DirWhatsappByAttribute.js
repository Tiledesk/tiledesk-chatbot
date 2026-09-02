const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const winston = require('../../utils/winston');
const { BaseDirective } = require('../BaseDirective');
const { Directives } = require('../Directives');
const whatsappService = require("../../services/WhatsappService");

class DirWhatsappByAttribute extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.WHATSAPP_ATTRIBUTE];

  execute(directive, callback) {
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
      this.logger.native("[Whatsapp by Attribute] Executed");
      callback();
    })
  }

  async go(action, callback) {
    winston.debug("(DirWhatsappByAttribute) Action: ", action);

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

    // NOTE: the previous inline call passed a third argument (`true`) to
    // httpUtils.request. `HttpUtils.request(options, callback)` takes two
    // parameters and ignored it, so dropping it changes nothing.
    const { err, resbody } = await whatsappService.broadcast(attribute_value, "(DirWhatsappByAttribute)");

    // This used to return a promise that REJECTED whenever the whatsapp module
    // answered anything but a 2xx. execute() calls go() without a .catch(), so
    // that rejection was unhandled - which terminates a default node process -
    // even though the callback had already fired and the flow carried on. The
    // resolve/reject pair was vestigial in any case: execute() ignores the
    // returned promise entirely, and nothing else calls go().
    if (err) {
      winston.error("(DirWhatsappByAttribute) broadcast failed: ", err);
      if (callback) {
        callback(err);
      }
      return;
    }

    winston.debug("(DirWhatsappByAttribute) broadcast sent: ", resbody);
    if (callback) {
      callback(null, resbody);
    }
  }
}

module.exports = { DirWhatsappByAttribute }