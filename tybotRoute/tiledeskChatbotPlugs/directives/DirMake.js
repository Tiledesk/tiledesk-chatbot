const axios = require("axios").default;
const { TiledeskChatbot } = require("../../models/TiledeskChatbot");
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
let https = require("https");
require('dotenv').config();


class DirMake {

  constructor(context) {
    console.log('context object LOG: ', context.log)
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.log = context.log;
    this.intentDir = new DirIntent(context);
  }

  execute(directive, callback) {
    if (this.log) { console.log("DirMake directive: ", directive); }
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      console.error("DirMake Incorrect directive: ", JSON.stringify(directive));
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    })
  }

  async go(action, callback) {
    if (this.log) { console.log("DirMake action:", JSON.stringify(action)); }
    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    //console.log('DirMake trueIntent',trueIntent)
    if (!this.tdcache) {
      console.error("Error: DirMake tdcache is mandatory");
      callback();
      return;
    }
    //console.log('DirMake work!');
    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    if (this.log) {
      const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
      for (const [key, value] of Object.entries(all_parameters)) {
        if (this.log) { console.log("DirMake request parameter:", key, "value:", value, "type:", typeof value) }
      }
    }
    
    let webhook_url = action.url;
    let bodyParameters = action.bodyParameters;
    if (this.log) {
      console.log("DirMake webhook_url: ", webhook_url);
      console.log("DirMake bodyParameters: ", bodyParameters);
    }
    if (!bodyParameters || bodyParameters === '') {
      console.error("DirMake ERROR - bodyParameters is undefined or null or empty string");
      callback();
      return;
    }
    if (!webhook_url || webhook_url === '') {
      console.error("DirMake ERROR - webhook_url is undefined or null or empty string");
      let status = 422;   
      let error = 'Missing make webhook url';
      await this.#assignAttributes(action, status, error);
      this.#executeCondition(false, trueIntent, null, falseIntent, null, () => {
        callback(); // stop the flow
      });
      return;
    }
    let url;
    try {
    let make_base_url = process.env.MAKE_ENDPOINT;
      if (make_base_url) {
        url = make_base_url + "/make/";
      } else {
        url = action.url;
      }
      const filler = new Filler();
      for (const [key, value] of Object.entries(bodyParameters)) {
        //if (this.log) {console.log("bodyParam:", key, "value:", value)}
        let filled_value = filler.fill(value, requestVariables);
        bodyParameters[key] = filled_value;
      }
      if (this.log) {console.log('DirMake bodyParameters filler: ',bodyParameters)}
    

    
    // Condition branches
    //let trueIntent = action.trueIntent;
    //let falseIntent = action.falseIntent;
    //console.log('DirMake trueIntent',trueIntent)
 
    if (this.log) { console.log("DirMake MakeEndpoint URL: ", url); }
    const MAKE_HTTPREQUEST = {
      url: url,
      headers: {
        'Content-Type': 'application/json'
      },
      json: bodyParameters,
      method: "POST"
    }
  
    if (this.log) { console.log("myrequest/DirMake MAKE_HTTPREQUEST", MAKE_HTTPREQUEST); }
    this.#myrequest(
      MAKE_HTTPREQUEST, async (err, resbody) => {
        if (err) {
          if (callback) {
            console.error("myrequest/(httprequest) DirMake make err:", err);
            let status = 404;   
            let error = 'Not found';
            await this.#assignAttributes(action, status, error);
            this.#executeCondition(false, trueIntent, null, falseIntent, null, () => {
              callback(false); // continue the flow
            });
            callback();
          }
        } else if (callback) {
          if (this.log) { console.log("myrequest/DirMake Make resbody: ", resbody); }
          let status = 200;   
          let error = null;
          await this.#assignAttributes(action, status, error); 
          await this.#executeCondition(true, trueIntent, null, falseIntent, null, () => {
            callback(); // stop the flow
          });
          if (this.log) {console.log('myrequest/status: ',status)}
          //callback();
        }
      }
    );
  } catch(e) {
    console.error('error: ', e)
  }
  }

  async #assignAttributes(action, status, error) {
    if (this.log) {
      console.log("DirMake assignAttributes action:", action)
      console.log("DirMake assignAttributes status:", status)
      console.log("DirMake assignAttributes error:", error)
    }
    if (this.context.tdcache) {
      if (action.assignStatusTo) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignStatusTo, status);
      }
      if (action.assignErrorTo) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignErrorTo, error);
      }

      // Debug log
      if (this.log) {
        const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
        for (const [key, value] of Object.entries(all_parameters)) {
          if (this.log) { console.log("DirMake request parameter:", key, "value:", value, "type:", typeof value) }
        }
      }
    }
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
          console.log("Response status:", res.status);
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
        // console.error("An error occurred:", JSON.stringify(error.data));
        if (callback) {
          callback(error, null);
        }
      });
  }
  async #executeCondition(result, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, callback) {
    let trueIntentDirective = null;
   
    if (trueIntent) {
      //console.log('executeCondition/trueIntent',trueIntent)
      trueIntentDirective = DirIntent.intentDirectiveFor(trueIntent, trueIntentAttributes);
      //console.log('executeCondition/trueIntentDirective',trueIntentDirective)
      //console.log('executeCondition/trueIntentAttributes',trueIntentAttributes)
    }
    let falseIntentDirective = null;
    if (falseIntent) {
      falseIntentDirective = DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes);
    }
    if (this.log) {console.log('DirMake executeCondition/result',result)}
    if (result === true) {
      if (trueIntentDirective) {
        this.intentDir.execute(trueIntentDirective, () => {
          callback();
        });
      }
      else {
        if (this.log) {console.log("No trueIntentDirective specified");}
        callback();
      }
    }
    else {
      if (falseIntentDirective) {
        this.intentDir.execute(falseIntentDirective, () => {
          callback();
        });
      }
      else {
        if (this.log) {console.log("No falseIntentDirective specified");}
        callback();
      }
    }
  }
}

module.exports = { DirMake }