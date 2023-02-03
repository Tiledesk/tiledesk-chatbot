const { HelpCenterQuery } = require('@tiledesk/helpcenter-query-client');
const { param } = require('express/lib/request');
const ms = require('minimist-string');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { Filler } = require('../Filler');
// const { TiledeskClient } = require('@tiledesk/tiledesk-client');

class DirSendEmail {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdclient = context.tdclient;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.log = context.log;
    // let context =  {
    //   projectId: projectId,
    //   token: token,
    //   supportRequest: supportRequest,
    //   requestId: supportRequest.request_id,
    //   TILEDESK_APIURL: API_URL,
    //   TILEBOT_ENDPOINT:TILEBOT_ENDPOINT,
    //   departmentId: depId,
    //   tdcache: tdcache,
    //   log: false
    // }
    // this.tdclient = new TiledeskClient({
    //   projectId: context.projectId,
    //   token: context.token,
    //   APIURL: context.TILEDESK_APIURL,
    //   APIKEY: "___",
    //   log: context.log
    // });
    
  }

  execute(directive, callback) {
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
      console.error("Incorrect directive:", JSON.stringify(directive));
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    });
  }

  async go(action, completion) {
      // let params = action.body;
      if (this.log) {console.log("email action:", JSON.stringify(action));}
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
          const message_echo = await this.tdclient.sendEmail({
            subject: filled_subject,
            text: filled_text,
            to: filled_to
          });
          if (this.log) {console.log("email sent. filled_subject:", filled_subject);}
          if (this.log) {console.log("email sent. filled_text:", filled_text);}
          if (this.log) {console.log("email sent. filled_to:", filled_to);}
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