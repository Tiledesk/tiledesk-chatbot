let axios = require('axios');
let https = require("https");
const { v4: uuidv4 } = require('uuid');
const winston = require('../../utils/winston')

class DirMessageToBot {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.API_ENDPOINT = context.API_ENDPOINT,
    this.TILEBOT_ENDPOINT = context.TILEBOT_ENDPOINT;
    this.supportRequest = context.supportRequest;
    this.token = context.token;
    this.log = context.log;
  }

  execute(directive, callback) {
    winston.verbose("Execute MessageToBot directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.warn("DirMessageToBot Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    });
  }

  go(action, callback) {
    winston.debug("(DirMessageToBot) Action: ", action);
    
    const message = action.message;
    const botId = this.supportRequest.bot_id;

    let outgoing_message = {
      "payload": message,
      "token": this.token
    }
    winston.debug("(DirMessageToBot) sending message: ", outgoing_message);
    
    this.sendMessageToBot(this.TILEBOT_ENDPOINT, outgoing_message, botId, () => {
      callback(true);
    });
  }

  /**
   * A stub to send message to the "ext/botId" endpoint, hosted by tilebot on:
   * /${TILEBOT_ROUTE}/ext/${botId}
   *
   * @param {Object} message. The message to send
   * @param {string} botId. Tiledesk botId
   * @param {string} token. User token
   */
  sendMessageToBot(TILEBOT_ENDPOINT, message, botId, callback) {
    const url = `${TILEBOT_ENDPOINT}/ext/${botId}`;
    winston.verbose("sendMessageToBot URL" + url);
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
    axios(axios_options).then((res) => {
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
      winston.error("(DirMessageToBot) Axios error: ", error.response.data);
      if (callback) {
        callback(error, null, null);
      }
    });
  }
}

module.exports = { DirMessageToBot };