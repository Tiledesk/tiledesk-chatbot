let axios = require('axios');
let https = require("https");
const winston = require('./utils/winston');
const httpUtils = require('./utils/HttpUtils');

class ExtApi {

  constructor(options) {
    if (!options.TILEBOT_ENDPOINT) {
      throw new Error("options.TILEBOT_ENDPOINT is mandatory");
      //this.extEndpoint = `${options.TILEBOT_ENDPOINT}/;
    }
    if (options.log) {
      this.log = options.log;
    }
    else {
      this.log = false;
    }
    this.TILEBOT_ENDPOINT = options.TILEBOT_ENDPOINT;
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
   * A stub to send messages to the "ext" endpoint, hosted by tilebot on:
   * /${TILEBOT_ROUTE}/ext/${projectId}/requests/${requestId}/messages
   *
   * @param {Object} message. The message to send
   * @param {string} projectId. Tiledesk projectId
   * @param {string} requestId. Tiledesk requestId
   * @param {string} token. User token
   */
  sendSupportMessageExt(message, projectId, requestId, token, callback) {
    const jwt_token = this.fixToken(token);
    const url = `${this.TILEBOT_ENDPOINT}/ext/${projectId}/requests/${requestId}/messages`;
    winston.verbose("(ExtApi) sendSupportMessageExt URL" + url);
    const HTTPREQUEST = {
      url: url,
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': jwt_token
      },
      json: message,
      method: 'POST'
    };
    httpUtils.request(
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
      }, this.log
    );
  }

}

module.exports = { ExtApi };