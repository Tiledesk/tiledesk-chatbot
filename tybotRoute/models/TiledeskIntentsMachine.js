
let axios = require('axios');

class TiledeskIntentsMachine {

  constructor(config) {
    if (!config.API_ENDPOINT) {
      throw new Error("config.API_ENDPOINT is mandatory");
    }
    this.API_ENDPOINT = config.API_ENDPOINT;
    this.log = config.log;
  }

  /**
   * intentsFinder Adapter
   * @param {String} text 
   * @returns the matching intents' names array
   */
  async decode(botId, text) {
    return new Promise( (resolve, reject) => {
      if (this.log) {console.log("NLP AI...");}
      const url = `${this.API_ENDPOINT}/model/parse`;
      if (this.log) {console.log("AI URL", url);}
      const HTTPREQUEST = {
        url: url,
        headers: {
          'Content-Type' : 'application/json'
        },
        json: {
          "text": text,
          "botId": botId
        },
        method: 'POST'
      };
      this.myrequest(
        HTTPREQUEST,
        function(err, resbody) {
          if (err) {
            console.error("error:", err)
            reject(err);
          }
          else {
            resolve(resbody);
          }
        }, false
      );
    })
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
  
}

module.exports = { TiledeskIntentsMachine }