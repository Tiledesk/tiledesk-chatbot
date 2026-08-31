let axios = require('axios');
const winston = require('./winston');

/**
 * Thin HTTP client used to read chatbot/request parameters from the tilebot
 * "ext/reserved" endpoint. These are instance (not static) methods: they are
 * inherited by TiledeskChatbotUtil so that `new TiledeskChatbotUtil()` keeps
 * exposing getChatbotParameters()/myrequest() exactly as before.
 * Extracted from TiledeskChatbotUtil (Phase 6a). Behaviour unchanged.
 */

class ChatbotParametersClient {


    /**
     * A stub to get the request parameters, hosted by tilebot on:
     * /${TILEBOT_ROUTE}/ext/parameters/requests/${requestId}?all
     *
     * @param {string} requestId. Tiledesk chatbot/requestId parameters
     */
    getChatbotParameters(requestId, callback) {
        const url = `${process.env.TILEBOT_ENDPOINT}/ext/reserved/parameters/requests/${requestId}?all`;
        const HTTPREQUEST = {
            url: url,
            headers: {
                'Content-Type': 'application/json'
            },
            method: 'get'
        };
        this.myrequest(
            HTTPREQUEST,
            function (err, resbody) {
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
        if (log) {
          winston.debug("(TiledeskChatbotUtil) myrequest API URL: " + options.url);
          winston.debug("(TiledeskChatbotUtil) myrequest Options URL: ", options);
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
            if (log) {
                winston.debug("(TiledeskChatbotUtil) Response for url: " + options.url);
                winston.debug("(TiledeskChatbotUtil) Response headers:\n", options);
            }
            if (res && res.status == 200 && res.data) {
              if (callback) {
                callback(null, res.data);
              }
            }
            else {
              if (callback) {
                callback(TiledeskClient.getErr({ message: "Response status not 200" }, options, res), null, null);
              }
            }
          })
          .catch((error) => {
            winston.error("(TiledeskChatbotUtil) Axios error: ", error.response.data);
            if (callback) {
              callback(error, null, null);
            }
          });
      }

}

module.exports = { ChatbotParametersClient };
