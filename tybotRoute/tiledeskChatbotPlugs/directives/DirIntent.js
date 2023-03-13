//const { ExtApi } = require('../../ExtApi.js');
let axios = require('axios');
let https = require("https");
const { v4: uuidv4 } = require('uuid');
const ms = require('minimist-string');

class DirIntent {

  // constructor(settings) {
    // if (!settings.API_ENDPOINT) {
    //   throw new Error("settings.API_ENDPOINT is mandatory!");
    // }
    // this.API_ENDPOINT = settings.API_ENDPOINT;
    // this.TILEBOT_ENDPOINT = settings.TILEBOT_ENDPOINT;
    // this.log = settings.log;
    // this.supportRequest = settings.supportRequest;
    // this.token = settings.token;
  // }
  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.API_ENDPOINT = context.TILEDESK_APIURL,
    this.TILEBOT_ENDPOINT = context.TILEBOT_ENDPOINT;
    this.supportRequest = context.supportRequest;
    this.token = context.token;
    this.log = context.log;
    // let context =  {
    //   projectId: projectId,
    //   token: token,
    //   supportRequest: supportRequest,
    //   requestId: supportRequest.request_id,
    //   TILEDESK_APIURL: API_URL,
    //   TILEBOT_ENDPOINT: TILEBOT_ENDPOINT,
    //   departmentId: depId,
    //   tdcache: tdcache,
    //   tdclient: tdclient,
    //   log: true
    // }
  }

  execute(directive, callback) {
    // console.log("exec intent:", JSON.stringify(directive));
    let action;
    if (directive.action) {
      // console.log("got intent action:", JSON.stringify(directive.action));
      action = directive.action;
    }
    else if (directive.parameter && directive.parameter.trim() !== "") {
      action = {
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
    // console.log("action intent:", action);
    const intentName = action.intentName;
    // const intentId = action.intentId;
    const projectId = this.supportRequest.id_project;
    const requestId = this.supportRequest.request_id;
    const botId = this.supportRequest.bot_id;
    let intent_command;
    if (intentName) {
      intent_command = "/" + intentName;
    }
    // else if (intentId) {
    //   intent_command = "/#" + intentId;
    // }
    else {
      console.error("Invalid intent");
      callback();
    }

    // if (intentName) {
    //   let intent_command = "/" + intentName;
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
      "token": this.token
    }
    if (this.log) {console.log("move to intent message:", intent_command_request);}
    let TILEBOT_ENDPOINT;
    if (this.TILEBOT_ENDPOINT) {
      TILEBOT_ENDPOINT = this.TILEBOT_ENDPOINT;
    }
    else {
      TILEBOT_ENDPOINT = `${this.API_ENDPOINT}/modules/tilebot`
    }
    this.sendMessageToBot(TILEBOT_ENDPOINT, intent_command_request, botId, () => {
      // console.log("sendMessageToBot() req_body sent:", intent_command_request);
      callback();
    });

    // }
    // else {
    //   callback();
    // }
  }

  static intentDirectiveFor(intent, json_params) {
    let string_params = null;
    if (json_params) {
      try {
        string_params = JSON.stringify(json_params);
      }
      catch (error) {
        console.error("Error stringigying JSON PARAMS", json_params);
      }
    }
    if (string_params != null) {
      intent += string_params
    }
    let intentDirective = {
      action: {
        intentName: intent
      }
    }
    return intentDirective;
  }

  static fullIntentDirectiveFor(intent, json_params) {
    let string_params = JSON.stringify(params);
    let intentDirective = {
      action: {
        intentName: intent
      }
    }
    return intentDirective;
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
      console.log("** Options:", JSON.stringify(options));
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
        console.log("Response headers:\n", JSON.stringify(res.headers));
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