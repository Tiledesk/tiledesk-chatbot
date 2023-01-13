let axios = require('axios');

class WebhookChatbotPlug {

  /**
   * @example
   * const { DirectivesChatbotPlug } = require('./DirectivesChatbotPlug');
   * 
   */

  constructor(supportRequest, webhookurl, token, log) {
    this.supportRequest = supportRequest;
    this.webhookurl = webhookurl;
    this.token = token;
    this.log = log;
  }

  exec(pipeline) {
    let answer = pipeline.message;
    let context = pipeline.context;
    if (this.log) {console.log("WEBHOOK?", answer.attributes.webhook);}
    if (answer.attributes && answer.attributes.webhook && answer.attributes.webhook === true) {
      if (this.log) {console.log("EXECUTING WEBHOOK URL!", this.webhookurl);}
      if (this.log) {console.log("EXECUTING WEBHOOK ON CONTEXT:", context);}
      this.execWebhook(message, context, this.webhookurl, (err, message_from_webhook) => {
        if (this.log) {console.log("message", message_from_webhook);}
        if (err) {
          console.error("Error calling webhook:", this.webhookurl)
          pipeline.nextplug();
        }
        else {
          if (this.log) {console.log("Webhook successfully end:", message_from_webhook);}
          const pipeline_original_message = pipeline.message
          if (this.log) {console.log("pipeline.message before webhook", pipeline.message);}

          // **** setting message from webhook,
          // **** MERGING with original not overwritten data, manually
          pipeline.message = message_from_webhook;
          // restore on message the original intent_info, necessary FOR further processING the message in the plugs pipeline
          if (pipeline.message && !pipeline.message.attributes) {
            if (this.log) {console.log("!pipeline.message.attributes", pipeline.message.attributes);}
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
      if (this.log) {console.log("NO WEBHOOK!");}
      pipeline.nextplug();
      return;
    }
    if (this.log) {console.log("Start processing webhook...");}
  }
  
  execWebhook(reply_message, context, webhookurl, callback) {
    if (this.log) {
      console.log("WEBHOOK. on context", context)
      console.log("WEBHOOK. on message", reply_message)
    }
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
          console.error("An error occurred calling intent's webhook url:", webhookurl);
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

    /*
    return request({                    
                    uri :  webhookurl,
                    headers: {
                        'Content-Type' : 'application/json', 
                        'User-Agent': 'tiledesk-bot',
                        'Origin': webhook_origin
                         //'x-hook-secret': s.secret
                       },
                    method: 'POST',
                    json: true,
                    body: {payload:{text: text, bot: bot, message: message, intent: faq}, token: token},
                    // }).then(response => {
                    }, function(err, response, json){
                        if (err) {
                            winston.error("Error from webhook reply of getParsedMessage. Return standard reply", err);

                            return resolve(messageReply);

                            // return error
                            
                        }
                         if (response.statusCode >= 400) {      
                            winston.verbose("The ChatBot webhook return error http status code. Return standard reply", response);            
                            return resolve(messageReply);
                        }

                        if (!json) { //the webhook return empty body
                            winston.verbose("The ChatBot webhook return no json. Return standard reply", response);
                            return resolve(messageReply);
                        }
                       
                        winston.debug("webhookurl repl_message ", response);

                        var text = undefined;
                        if(json && json.text===undefined) {
                            winston.verbose("webhookurl json is defined but text not. return standard reply",{json:json, response:response});
                            // text = 'Field text is not defined in the webhook respose of the faq with id: '+ faq._id+ ". Error: " + JSON.stringify(response);
                            return resolve(messageReply);
                        }else {
                            text = json.text;
                        }
                        winston.debug("webhookurl text:  "+ text);

                        // // let cloned_message = Object.assign({}, messageReply);
                        // let cloned_message =  message;
                        // winston.debug("cloned_message :  ",cloned_message);

                        // if (json.attributes) {
                        //     if (!cloned_message.attributes) {
                        //         cloned_message.attributes = {}
                        //     }
                        //     winston.debug("ChatBot webhook json.attributes: ",json.attributes);
                        //     for(const [key, value] of Object.entries(json.attributes)) {
                        //         cloned_message.attributes[key] = value
                        //     }
                        // }

                        // winston.debug("cloned_message after attributes:  ",cloned_message);

                        that.parseMicrolanguage(text, message, bot, faq, true, json).then(function(bot_answer) {
                            return resolve(bot_answer);
                        });
                    });
    */
  }

  // ************************************************
  // ****************** HTTP REQUEST ****************
  // ************************************************

  static myrequest(options, callback, log) {
    if (log) {
      console.log("API URL:", options.url);
      console.log("** Options:", options);
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
        console.log("Response for url:", options.url);
        console.log("Response headers:\n", res.headers);
        console.log("******** Response for url:", res);
        console.log("Response body:\n", res.data);
      }
      if (callback) {
        callback(null, res);
      }
    })
    .catch(function (error) {
      console.error("An error occurred:", error);
      if (callback) {
        callback(error, null, null);
      }
    });
  }
  
}

module.exports = { WebhookChatbotPlug };