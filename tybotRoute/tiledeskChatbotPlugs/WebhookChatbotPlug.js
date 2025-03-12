let axios = require('axios');
const winston = require('../utils/winston');

class WebhookChatbotPlug {

  constructor(supportRequest, webhookurl, token, log) {
    this.supportRequest = supportRequest;
    this.webhookurl = webhookurl;
    this.token = token;
    this.log = log;
  }

  exec(pipeline) {
    let answer = pipeline.message;
    let context = pipeline.context;
    winston.verbose("(WebhookChatbotPlug) webhook" + answer.attributes.webhook);
    if (answer.attributes && answer.attributes.webhook && answer.attributes.webhook === true) {
      winston.debug("(WebhookChatbotPlug) Executing webhook url " + this.webhookurl);
      winston.debug("(WebhookChatbotPlug) Executing webhook on context: " + JSON.stringify(context));
      if (!this.validWebhookURL(this.webhookurl)) {
        winston.error("(WebhookChatbotPlug) Error. Invalid webhook URL: " + this.webhookurl + " on context: " + JSON.stringify(context));
        pipeline.nextplug();
        return;
      }
      this.execWebhook(answer, context, this.webhookurl, (err, message_from_webhook) => {
        winston.debug("(WebhookChatbotPlug) message_from_webhook:", message_from_webhook);
        if (err) {
          winston.error("(WebhookChatbotPlug) Error calling webhook:", this.webhookurl)
          pipeline.nextplug();
        }
        else {
          winston.debug("(WebhookChatbotPlug) Webhook successfully end:", message_from_webhook);
          const pipeline_original_message = pipeline.message
          winston.debug("(WebhookChatbotPlug) pipeline.message before webhook" + JSON.stringify(pipeline.message));

          // **** setting message from webhook,
          // **** MERGING with original not overwritten data, manually
          pipeline.message = message_from_webhook;
          // restore on message the original intent_info, necessary FOR further processING the message in the plugs pipeline
          if (pipeline.message && !pipeline.message.attributes) {
            winston.debug("(WebhookChatbotPlug) !pipeline.message.attributes", pipeline.message.attributes);
            pipeline.message.attributes = {};
          }
          pipeline.message.attributes.intent_info = pipeline_original_message.attributes.intent_info;
          // restoring plugs processing flags
          if (pipeline.message.attributes.directives === undefined) {
            pipeline.message.attributes.directives = pipeline_original_message.attributes.directives;
          }
          if (pipeline.message.attributes.splits === undefined) {
            pipeline.message.attributes.splits = pipeline_original_message.attributes.splits;
          }
          if (pipeline.message.attributes.markbot === undefined) {
            pipeline.message.attributes.markbot = pipeline_original_message.attributes.markbot;
          }
          //if (pipeline.message.attributes.webhook === undefined) {
          //  pipeline.message.attributes.webhook = pipeline_original_message.attributes.webhook;
          //}
          pipeline.nextplug();
        }
      });
    }
    else {
      winston.verbose("(WebhookChatbotPlug) No Webhook!");
      pipeline.nextplug();
      return;
    }
    winston.verbose("(WebhookChatbotPlug) Start processing webhook...");
  }
  
  validWebhookURL(webhookurl) {
    if (!webhookurl) {
      return false;
    }
    return true;
  }

  execWebhook(reply_message, context, webhookurl, callback) {
    winston.debug("(WebhookChatbotPlug) Webhook on context" + JSON.stringify(context));
    winston.debug("(WebhookChatbotPlug) WEBHOOK on message" + JSON.stringify(reply_message));
    const HTTPREQUEST = {
      url: webhookurl,
      headers: {
        'Content-Type' : 'application/json', 
        'User-Agent': 'tiledesk-bot',
        'Origin': "pre"
      },
      json: context,
      method: 'POST'
    };
    WebhookChatbotPlug.myrequest(
      HTTPREQUEST,
      function(err, res) {
        if (err || (res && res.status >= 400) || (res && !res.data)) {
          winston.error("(WebhookChatbotPlug) An error occurred calling intent's webhook url:" + webhookurl);
          if (callback) {
            callback(reply_message);
          }
        }
        else {
          if (callback) {
            callback(null, res.data);
          }
        }
      }, this.log
    );
  }

  // ************************************************
  // ****************** HTTP REQUEST ****************
  // ************************************************

  static myrequest(options, callback, log) {
    if (log) {
      winston.debug("(WebhookChatbotPlug) myrequest API URL:" + options.url);
      winston.debug("(WebhookChatbotPlug) myrequest Options:" + JSON.stringify(options));
    }
    axios(
      {
        url: options.url,
        method: options.method,
        data: options.json,
        headers: options.headers
      })
    .then(function (res) {
      if (log) {
        winston.debug("(WebhookChatbotPlug) myrequest Response for url:", options.url);
        winston.debug("(WebhookChatbotPlug) myrequest Response headers:\n" + JSON.stringify(res.headers));
        winston.debug("(WebhookChatbotPlug) myrequest Response body:\n" + JSON.stringify(res.data));
      }
      if (callback) {
        callback(null, res);
      }
    })
    .catch(function (error) {
      winston.debug("(WebhookChatbotPlug) Axios error: ", JSON.stringify(error));
      if (callback) {
        callback(error, null, null);
      }
    });
  }
  
}

module.exports = { WebhookChatbotPlug };