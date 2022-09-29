let axios = require('axios');

class ExtApi {

  constructor(options) {
    if (!options.ENDPOINT) {
      throw new Error("options.ENDPOINT is mandatory");
      //this.extEndpoint = `${options.TYBOT_ENDPOINT}/;
    }
    if (options.log) {
      this.log = options.log;
    }
    else {
      this.log = false;
    }
    this.ENDPOINT = options.ENDPOINT;
  }

  fixToken(token) {
    if (token.startsWith('JWT ')) {
      return token;
    }
    else {
      return 'JWT ' + token;
    }
  }

  /**
   * A stub to send message to the "ext" endpoint, hosted by tilebot on:
   * /${TILEBOT_ROUTE}/ext/${projectId}/requests/${requestId}/messages
   *
   * @param {Object} message. The message to send
   * @param {string} projectId. Tiledesk projectId
   * @param {string} requestId. Tiledesk requestId
   * @param {string} token. User token
   */
  sendSupportMessageExt(message, projectId, requestId, token, callback) {
    const jwt_token = this.fixToken(token);
    const url = `${this.ENDPOINT}/ext/${projectId}/requests/${requestId}/messages`;
    if (this.log) {console.log("sendSupportMessageExt URL", url);}
    console.log("sendSupportMessageExt:", url);
    const HTTPREQUEST = {
      url: url,
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': jwt_token
      },
      json: message,
      method: 'POST'
    };
    this.myrequest(
      HTTPREQUEST,
      function(err, resbody) {
        console.log("sendSupportMessageExt resbody:", resbody);
        if (err) {
          if (callback) {
            callback(err);
          }
        }
        else {
          if (callback) {
            callback(null, resbody);
          }
        }
      }, this.log
    );
  }


  myrequest(options, callback, log) {
    if (this.log) {
      console.log("API URL:", options.url);
      console.log("** Options:", options);
    }
    axios(
      {
        url: options.url,
        method: options.method,
        data: options.json,
        params: options.params,
        headers: options.headers
      })
    .then((res) => {
      if (this.log) {
        console.log("Response for url:", options.url);
        console.log("Response headers:\n", res.headers);
        //console.log("******** Response for url:", res);
      }
      if (res && res.status == 200 && res.data) {
        if (callback) {
          callback(null, res.data);
        }
      }
      else {
        if (callback) {
          callback(TiledeskClient.getErr({message: "Response status not 200"}, options, res), null, null);
        }
      }
    })
    .catch( (error) => {
      console.error("An error occurred:", error);
      if (callback) {
        callback(error, null, null);
      }
    });
  }
/*
  static async execPipelineExt(static_bot_answer, directivesPlug) {
    const messagePipeline = new MessagePipeline(static_bot_answer, null);
    //const webhookurl = bot.webhook_url;
    //messagePipeline.addPlug(new WebhookChatbotPlug(message.request, webhookurl, token));
    messagePipeline.addPlug(directivesPlug);
    messagePipeline.addPlug(new SplitsChatbotPlug(this.log));
    messagePipeline.addPlug(new MarkbotChatbotPlug(this.log));
    const bot_answer = await messagePipeline.exec();
    if (this.log) {console.log("End pipeline ext, bot_answer:", JSON.stringify(bot_answer));}
    return bot_answer;
  }*/
}

module.exports = { ExtApi };