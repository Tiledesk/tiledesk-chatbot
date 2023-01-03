//const { ExtApi } = require('../../ExtApi.js');
let axios = require('axios');
let https = require("https");
const { v4: uuidv4 } = require('uuid');

class DirIntent {

  constructor(settings) {
    if (!settings.API_ENDPOINT) {
      throw new Error("settings.API_ENDPOINT is mandatory!");
    }
    this.API_ENDPOINT = settings.API_ENDPOINT;
    this.TILEBOT_ENDPOINT = settings.TILEBOT_ENDPOINT;
    this.log = settings.log;
    this.supportRequest = settings.supportRequest;
    this.token = settings.token;
  }

  execute(directive, callback) {
    console.log("exec intent:", JSON.stringify(directive));
    let action;
    if (directive.action) {
      console.log("got intent action:", JSON.stringify(action));
      action = directive.action;
    }
    else if (directive.parameter && directive.parameter.trim() !== "") {
      action.body = {
        intentName: directive.parameter.trim()
      }
    }
    else {
      console.error("Incorrect directive:", directive);
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    });
  }

  go(action, callback) {
    const projectId = this.supportRequest.id_project;
    const requestId = this.supportRequest.request_id;
    const botId = this.supportRequest.bot_id;
    if (action.intentName) {
      let intent_command = "/" + action.intentName;
      let intent_command_request = {
        "payload": {
          "_id": uuidv4(),
          "senderFullname": "_tdinternal",
          "type": "text",
          "sender": "_tdinternal",
          "recipient": requestId,
          "text": intent_command,
          "id_project": projectId,
          "request": {
            "request_id": requestId,
            "id_project": projectId
          }
        },
        "token": token
      }

      // let intent_command_message = {
      //   //sender: "_tdsender", // bot doesn't reply to "himself" and "system"
      //   text: intent_command,
      //   attributes: {
      //     subtype: "info"
      //   }
      // };
      // send message to /ext/botId
      // const req_body = {
      //   payload: message_to_bot,
      //   token: token
      // }
      // let extEndpoint = `${this.API_ENDPOINT}/modules/tilebot`;
      // if (this.TILEBOT_ENDPOINT) {
      //   extEndpoint = `${this.TILEBOT_ENDPOINT}`;
      // }
      // const extapi = new ExtApi({
      //   ENDPOINT: extEndpoint,
      //   log: this.log
      // });
      if (this.log) {console.log("move to intent message:", intent_command_request);}
      // extapi.sendSupportMessageExt(intent_command_message, projectId, requestId, token, () => {
      //   if (this.log) {console.log("command " + intent_command + " sent.");}
      //   callback();
      // });
      let TILEBOT_ENDPOINT;
      // if (process.env.CHATBOT_ENDPOINT) {
      //   CHATBOT_ENDPOINT = process.env.CHATBOT_ENDPOINT;
      // }
      // else 
      if (this.TILEBOT_ENDPOINT) {
        TILEBOT_ENDPOINT = this.TILEBOT_ENDPOINT;
      }
      else {
        TILEBOT_ENDPOINT = `${this.API_ENDPOINT}/modules/tilebot`
      }
      
      this.sendMessageToBot(TILEBOT_ENDPOINT, intent_command_request, botId, () => {
        console.log("sendMessageToBot() req_body sent:", intent_command_request);
        callback();
      });
    }
    else {
      callback();
    }
  }

  /**
   * A stub to send message to the "ext/botId" endpoint, hosted by tilebot on:
   * /${TILEBOT_ROUTE}/ext/${botId}
   *
   * @param {Object} message. The message to send
   * @param {string} botId. Tiledesk botId
   * @param {string} token. User token
   */
  sendMessageToBot(CHATBOT_ENDPOINT, message, botId, callback) {
    // const jwt_token = this.fixToken(token);
    const url = `${CHATBOT_ENDPOINT}/ext/${botId}`;
    // console.log("sendMessageToBot URL", url);
    const HTTPREQUEST = {
      url: url,
      headers: {
        'Content-Type' : 'application/json'
      },
      json: message,
      method: 'POST'
    };
    this.myrequest(
      HTTPREQUEST,
      function(err, resbody) {
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
      }, false
    );
  }

  myrequest(options, callback, log) {
    if (this.log) {
      console.log("API URL:", options.url);
      console.log("** Options:", options);
    }
    let axios_options = {
      url: options.url,
      method: options.method,
      data: options.json,
      params: options.params,
      headers: options.headers
    }
    if (options.url.startsWith("https:")) {
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });
      axios_options.httpsAgent = httpsAgent;
    }
    axios(axios_options)
    .then((res) => {
      if (this.log) {
        console.log("Response for url:", options.url);
        console.log("Response headers:\n", res.headers);
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
}

module.exports = { DirIntent };