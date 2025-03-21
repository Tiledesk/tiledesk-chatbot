const { param } = require('express/lib/request');
const ms = require('minimist-string');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { Filler } = require('../Filler');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const winston = require('../../utils/winston');
// const { TiledeskClient } = require('@tiledesk/tiledesk-client');

class DirSendEmail {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.log = context.log;    

    this.API_ENDPOINT = context.API_ENDPOINT;
    this.tdClient = new TiledeskClient({
      projectId: this.context.projectId,
      token: this.context.token,
      APIURL: this.API_ENDPOINT,
      APIKEY: "___",
      log: this.log
    });
  }

  execute(directive, callback) {
    winston.verbose("Execute SendEmail directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else if (directive.parameter && directive.parameter.trim() !== "") {
      const params = this.parseParams(directive.parameter);
      action = {
        subject: params.subject,
        text: params.text,
        to: params.to
      }
    }
    else {
      winston.warn("DirSendEmail Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, () => {
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

  parseParams(directive_parameter) {
    let subject = null;
    let text = null;
    let to = null
    const params = ms(directive_parameter);
    if (params.subject) {
      subject = params.subject
    }
    if (params.text) {
      text = params.text.replace(/\\n/g, "\n");
    }
    if (params.to) {
      to = params.to;
    }
    return {
      subject: subject,
      to: to,
      text: text
    }
  }
}

module.exports = { DirSendEmail };