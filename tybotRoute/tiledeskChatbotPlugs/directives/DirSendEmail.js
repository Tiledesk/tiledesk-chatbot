const { HelpCenterQuery } = require('@tiledesk/helpcenter-query-client');
const { param } = require('express/lib/request');
const ms = require('minimist-string');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { Filler } = require('../Filler');

class DirSendEmail {

  constructor(config) {
    if (!config.tdclient) {
      throw new Error('config.tdclient (TiledeskClient) is mandatory.');
    }
    this.tdclient = config.tdclient;
    this.tdcache = config.tdcache;
    this.requestId = config.requestId;
    this.log = config.log;
  }

  async execute(directive, completion) {
      let params = null;
      if (directive.parameter) {
        params = this.parseParams(directive.parameter);
      }
      else {
        const error = new Error("sendEmail missing 'parameter' error. Skipping");
        if (completion) {
          completion(error);
        }
      }
      if (params.subject && params.text && params.to) {
        try {
          let requestVariables = null;
          if (this.tdcache) {
            requestVariables = 
            await TiledeskChatbot.allParametersStatic(
              this.tdcache, this.requestId
            );
          }
          const filler = new Filler();
          const message_echo = await this.tdclient.sendEmail({
            subject: filler.fill(params.subject, requestVariables),
            text: filler.fill(params.text, requestVariables),
            to: filler.fill(params.to, requestVariables)
          });
          if (completion) {
            completion(null, message_echo);
          }
          return message_echo;
        }
        catch(err) {
          console.error("sendEmail error:", err);
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