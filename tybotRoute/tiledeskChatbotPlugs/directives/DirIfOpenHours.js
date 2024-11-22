// const { TiledeskClient } = require('@tiledesk/tiledesk-client');
let axios = require('axios');
const { DirIntent } = require('./DirIntent');
let https = require("https");
const ms = require('minimist-string');

class DirIfOpenHours {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }

    this.context = context;
    this.API_ENDPOINT = context.API_ENDPOINT;
    this.intentDir = new DirIntent(context);
    this.log = context.log;
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action
    }
    else if (directive.parameter) {
      let params;
      params = this.parseParams(directive.parameter);
      if (!params.trueIntent && !params.falseIntent) {
        if (this.log) {
          console.log("missing both params.trueIntent & params.falseIntent");
        }
        callback();
        return;
      }
      action = {
        trueIntent: params.trueIntent,
        falseIntent: params.falseIntent
      }
    }
    else {
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    });
  }

  go(action, callback) {

    const trueIntent = action.trueIntent;
    const falseIntent = action.falseIntent;
    const trueIntentAttributes = action.trueIntentAttributes;
    const falseIntentAttributes = action.falseIntentAttributes;
    const stopOnConditionMet = action.stopOnConditionMet;
    
    if (trueIntent && trueIntent.trim() === "") {
      trueIntent = null;
    }
    if (falseIntent && falseIntent.trim() === "") {
      falseIntent = null;
    }
    if (this.log) {console.log("condition action:", action);}
    if (!trueIntent && !falseIntent) {
      if (this.log) {console.log("Invalid condition, no intents specified");}
      callback();
      return;
    }
    
    let slot_id = null;
    if (action.slotId) {
      slot_id = action.slotId;
    }
    
    let isopen_url = this.API_ENDPOINT + "/projects/" + this.context.projectId + "/isopen";
    if (slot_id) {
      isopen_url = isopen_url.concat("?timeSlot=" + slot_id);
    }

    const HTTPREQUEST = {
      url: isopen_url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'JWT ' + this.context.token
      },
      method: 'GET'
    }
    if (this.log) { console.log("DirIfOpenHours HTTPREQUEST", HTTPREQUEST); }
    
    this.#myrequest(
      HTTPREQUEST, async (err, resbody) => {
        if (this.log && err) {
          console.log("DirIfOpenHours error: ", err);
        }
        if (this.log) { console.log("DirIfOpenHours resbody:", resbody); }

        if (err) {
          if (callback) {
            if (falseIntent) {
              let intentDirective = DirIntent.intentDirectiveFor(falseIntent);
              if (this.log) {console.log("!agents (openHours) => falseIntent", falseIntent);}
              this.intentDir.execute(intentDirective, () => {
                callback(stopOnConditionMet);
              });
            }
          }
        } else {
          if (resbody.isopen && resbody.isopen === true) {
            if (trueIntent) {
              let intentDirective = DirIntent.intentDirectiveFor(trueIntent);
              if (this.log) {console.log("agents (openHours) => trueIntent");}
              this.intentDir.execute(intentDirective, () => {
                callback(stopOnConditionMet);
              });
            }
            callback();
            return;
          } else {
            if (falseIntent) {
              let intentDirective = DirIntent.intentDirectiveFor(falseIntent);
              if (this.log) {console.log("!agents (openHours) => falseIntent", falseIntent);}
              this.intentDir.execute(intentDirective, () => {
                callback(stopOnConditionMet);
              });
            }
            callback();
            return;
          }
        }
      }
    )

    // this.tdclient.openNow(action.slot_id, (err, result) => {
    //   console.log("openNow():", result);
    //   if (this.log) {console.log("openNow():", result);}
    //   if (err) {
    //     console.error("*** DirIfOpenHours Error:", err);
    //     callback();
    //   }
    //   else if (result && result.isopen) {
    //     console.log("yes is open")
    //     if (trueIntent) {
    //       let intentDirective = DirIntent.intentDirectiveFor(trueIntent);
    //       if (this.log) {console.log("agents (openHours) => trueIntent");}
    //       this.intentDir.execute(intentDirective, () => {
    //         callback(stopOnConditionMet);
    //       });
    //     }
    //     else {
    //       callback();
    //       return;
    //     }
    //   }
    //   else if (falseIntent) {
    //     let intentDirective = DirIntent.intentDirectiveFor(falseIntent);
    //     if (this.log) {console.log("!agents (openHours) => falseIntent", falseIntent);}
    //     this.intentDir.execute(intentDirective, () => {
    //       callback(stopOnConditionMet);
    //     });
    //   }
    //   else {
    //     callback();
    //   }
    // });
  }

  #myrequest(options, callback) {
    if (this.log) {
      console.log("API URL:", options.url);
      console.log("** Options:", JSON.stringify(options));
    }
    let axios_options = {
      url: options.url,
      method: options.method,
      params: options.params,
      headers: options.headers
    }
    if (options.json !== null) {
      axios_options.data = options.json
    }
    if (this.log) {
      console.log("axios_options:", JSON.stringify(axios_options));
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
            callback(new Error("Response status is not 200"), null);
          }
        }
      })
      .catch((error) => {
        console.error("(DirIfOpenHours) Axios error: ", JSON.stringify(error));
        if (callback) {
          callback(error, null);
        }
      });
  }

  parseParams(directive_parameter) {
    let trueIntent = null;
    let falseIntent = null;
    const params = ms(directive_parameter);
    if (params.trueIntent) {
      trueIntent = params.trueIntent;
    }
    if (params.falseIntent) {
      falseIntent = params.falseIntent;
    }
    return {
      trueIntent: trueIntent,
      falseIntent: falseIntent
    }
  }

}

module.exports = { DirIfOpenHours };