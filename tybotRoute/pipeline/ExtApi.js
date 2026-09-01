let axios = require('axios');
let https = require("https");
const winston = require('../utils/winston');
const httpUtils = require('../utils/HttpUtils');

class ExtApi {

  constructor(options) {
    if (!options.TILEBOT_ENDPOINT) {
      throw new Error("options.TILEBOT_ENDPOINT is mandatory");
      //this.extEndpoint = `${options.TILEBOT_ENDPOINT}/;
    }
    this.TILEBOT_ENDPOINT = options.TILEBOT_ENDPOINT;
  }

  /**
   * Prefix the caller's token with "JWT " unless it already carries it.
   *
   * The guard is not decoration. sendSupportMessageExt() is called from the
   * async express handlers in routes/messageRoutes.js for every plain-text
   * (no-actions) reply, and express 4 does not forward a rejected handler
   * promise anywhere. Before the guard, a missing token made the first line of
   * this method raise "Cannot read properties of undefined (reading
   * 'startsWith')" and the reply disappeared with no log at all - which is why
   * running the suite without CHATBOT_TOKEN looked like a timeout rather than
   * an error (see scripts/run-tests.js). It still throws, because there is no
   * reply to send without a token, but it now says so and logs it.
   *
   * @param {string} token  a non-empty token, with or without the "JWT " prefix
   * @returns {string} the token, prefixed
   * @throws {Error} if the token is missing or is not a non-empty string
   */
  fixToken(token) {
    if (typeof token !== 'string' || token.length === 0) {
      const message =
        "(ExtApi) fixToken: a non-empty string token is mandatory, got " +
        (typeof token) + " '" + String(token) + "'. The reply cannot be sent.";
      winston.error(message);
      throw new Error(message);
    }
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
      });
  }

}

module.exports = { ExtApi };