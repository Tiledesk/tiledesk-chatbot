const { param } = require('express/lib/request');
const { TiledeskChatbot } = require('../../../engine/TiledeskChatbot');
const { Filler } = require('../../Filler');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const winston = require('../../../utils/winston');
const { BaseDirective } = require('../../BaseDirective');
const { Directives } = require('../Directives');
// const { TiledeskClient } = require('@tiledesk/tiledesk-client');

class DirSendEmail extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.SEND_EMAIL];

  constructor(context) {
    super(context);

    this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___" });
  }

  execute(directive, callback) {
    winston.verbose("Execute SendEmail directive");
    let action;
    if (directive.action) {
      action = directive.action;
    } else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirSendEmail Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, () => {
      this.logger.native("[Send Email] Executed");
      callback();
    });
  }

  async go(action, completion) {
    winston.debug("(DirSendEmail) Action: ", action);
      if (action.subject && action.text && action.to) {
        try {
          let requestVariables = null;
          if (this.tdcache) {
            requestVariables = 
            await TiledeskChatbot.allParametersStatic(
              this.tdcache, this.requestId
            );
          }
          const filler = new Filler();
          const filled_subject = filler.fill(action.subject, requestVariables);
          const filled_text = filler.fill(action.text, requestVariables);
          const filled_to = filler.fill(action.to, requestVariables);
          const reply_to = filler.fill(action.replyto, requestVariables);
          const message = {
            subject: filled_subject,
            text: filled_text,
            to: filled_to,
            replyto: reply_to
          }
          const message_echo = await this.tdClient.sendEmail(message);
          winston.debug("(DirSendEmail) filled_subject: " + filled_subject);
          winston.debug("(DirSendEmail) filled_text: " + filled_text);
          winston.debug("(DirSendEmail) filled_to: " + filled_to);
          winston.debug("(DirSendEmail) reply_to: " + reply_to);
          if (completion) {
            completion(null, message_echo);
          }
          return message_echo;
        }
        catch(err) {
          winston.error("(DirSendEmail) sendEmail error: ", err);
          if (completion) {
            completion(err);
          }
        }
      }
      else {
        const error = new Error("sendEmail missing mandatory parameters (to|subject|text)");
        if (completion) {
          completion(error);
        }
      }
  }
}

module.exports = { DirSendEmail };