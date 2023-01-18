let axios = require('axios');
let https = require("https");

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
        //console.log("sendSupportMessageExt resbody:", resbody);
        if (err) {
          //console.error("sendSupportMessageExt error:", err)
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

  /**
   * A stub to send message to the "ext/botId" endpoint, hosted by tilebot on:
   * /${TILEBOT_ROUTE}/ext/${botId}
   *
   * @param {Object} message. The message to send
   * @param {string} botId. Tiledesk botId
   * @param {string} token. User token
   */
  // sendMessageToBot(message, botId, token, callback) {
  //   const jwt_token = this.fixToken(token);
  //   const url = `${this.ENDPOINT}/ext/${botId}`;
  //   if (this.log) {console.log("sendMessageToBot URL", url);}
  //   const HTTPREQUEST = {
  //     url: url,
  //     headers: {
  //       'Content-Type' : 'application/json',
  //       'Authorization': jwt_token
  //     },
  //     json: message,
  //     method: 'POST'
  //   };
  //   this.myrequest(
  //     HTTPREQUEST,
  //     function(err, resbody) {
  //       if (err) {
  //         if (callback) {
  //           callback(err);
  //         }
  //       }
  //       else {
  //         if (callback) {
  //           callback(null, resbody);
  //         }
  //       }
  //     }, this.log
  //   );
  // }

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

module.exports = { ExtApi };