//const { HelpCenter } = require('./HelpCenter');
const { HelpCenterQuery } = require('@tiledesk/helpcenter-query-client');
const { param } = require('express/lib/request');
const ms = require('minimist-string');

class DirSendEmail {

  constructor(config) {
    if (!config.tdclient) {
      throw new Error('config.tdclient (TiledeskClient) object is mandatory.');
    }
    this.tdclient = config.tdclient;
    this.log = config.log;
  }

  async execute(directive, pipeline, completion) {
    // return new Promise( (resolve, reject) => {
      let params = null;
      if (directive.parameter) {
        console.log("processing sendEmail parameters");
        params = this.parseParams(directive.parameter);
        console.log("parameters found", params);
      }
      else {
        console.log("sendEmail missing parameter error. Skipping");
        const error = new Error("sendEmail missing 'parameter' error. Skipping");
        if (completion) {
          completion(error);
        }
        // reject(error);
        throw error;
      }
      if (params.subject && params.body && params.to) {
        console.log("-....---")
        try {
          // console.log("...", params)
          const message_echo = await this.tdclient.sendEmail({
            subject: params.subject,
            body: params.body,
            to: params.to
          });
          // console.log("echo", message_echo)
          if (completion) {
            completion(null, message_echo);
          }
          // resolve(message_echo);
          return message_echo;
        }
        catch(err) {
          // console.error("sendEmail error:", err);
          if (completion) {
            completion(err);
          }
          // reject(error);
          throw err;
        }
      }
      else {
        // console.log("sendEmail missing mandatory parameters (to|subject|body):");
        const error = new Error("sendEmail missing mandatory parameters (to|subject|body)");
        if (completion) {
          completion(error);
        }
        // reject(err);
        throw error;
      }
    // });
  }

  parseParams(directive_parameter) {
    let subject = null;
    let body = null;
    let to = null
    const params = ms(directive_parameter);
    if (params.subject) {
      subject = params.subject
    }
    if (params.body) {
      body = params.body.replace(/\\n/g, "\n");
    }    
    if (params.to) {
      to = params.to;
    }
    return {
      subject: subject,
      to: to,
      body: body
    }
  }
}

module.exports = { DirSendEmail };