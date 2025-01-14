
let axios = require('axios');

class TiledeskIntentsMachine {

  constructor(config) {
    if (!config.API_ENDPOINT) {
      //throw new Error("config.API_ENDPOINT is mandatory");
      this.API_ENDPOINT = "http://34.65.210.38";
    }
    else {
      this.API_ENDPOINT = config.API_ENDPOINT;
    }
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
          "model": "models/" + botId,
          "text": text
        },
        method: 'POST'
      };
      this.myrequest(
        HTTPREQUEST,
        (err, resbody) => {
          if (err) {
            // console.error("An error occurred on /model/parse:", err)
            reject(err);
          }
          else {
            console.log("Tiledesk AI replied:", resbody)
            resolve(this.translateForTiledesk(resbody));
          }
        }, false
      );
    })
  }

  translateForTiledesk(intents) {
    // example reply
    // {
    //   "text": "chi sei",
    //   "intent": {
    //     "name": "chisei",
    //     "confidence": 0.6671510338783264
    //   },
    //   "intent_ranking": [
    //     {
    //         "name": "chisei",
    //         "confidence": 0.6671510338783264
    //     },
    //     {
    //         "name": "saluti",
    //         "confidence": 0.2318711280822754
    //     },
    //     {
    //         "name": "dovesei",
    //         "confidence": 0.09430444240570068
    //     },
    //     {
    //         "name": "taxi",
    //         "confidence": 0.006536041386425495
    //     },
    //     {
    //         "name": "ristorante",
    //         "confidence": 0.00013731778017245233
    //     }
    //   ]
    // }
    let intents_array = intents.intent_ranking;
    let tiledesk_intents = [];
    for (let i = 0; i < intents_array.length; i++) {
      let td_intent = {
        "intent_display_name": intents_array[i].name
      }
      tiledesk_intents.push(td_intent);
    }
    return tiledesk_intents;
  }

  myrequest(options, callback, log) {
    if (this.log) {
      console.log("API URL:", options.url);
      console.log("** Options:", JSON.stringify(options));
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
        console.log("Response headers:\n", JSON.stringify(res.headers));
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
      console.error("(TiledeskIntentsMachine) Axios error: ", JSON.stringify(error));
      if (callback) {
        callback(error, null, null);
      }
    });
  }
  
}

module.exports = { TiledeskIntentsMachine }