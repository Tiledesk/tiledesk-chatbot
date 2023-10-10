let axios = require('axios');
let https = require("https");
const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { DirIntent } = require('./DirIntent');

class DirWebRequestV2 {
  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdclient = context.tdclient;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.intentDir = new DirIntent(context);
    this.log = context.log;
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      console.error("Incorrect directive:", JSON.stringify(directive));
      callback();
      return;
    }
    this.go(action, (stop) => {
      if (this.log) {console.log("(webrequestv2, stop?", stop); }
      callback(stop);
    });
  }

  async go(action, callback) {
    if (this.log) {console.log("webRequest action:", JSON.stringify(action));}
    let requestVariables = null;
    if (this.tdcache) {
      requestVariables = 
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );
    }
    const filler = new Filler();
    const url = filler.fill(action.url, requestVariables);

    let headers = {};
    if (action.headersString) {
      let headersDict = action.headersString
      for (const [key, value] of Object.entries(headersDict)) {
        if (this.log) {console.log("header:", key, "value:", value)}
        let filled_value = filler.fill(value, requestVariables);
        headers[key] = filled_value;
      }
    }
    let json = null;
    if (action.body && action.bodyType == "json") {
      if (this.log) {console.log("action.body is:", action.body);}
      let body = filler.fill(action.body, requestVariables);
      try {
        json = JSON.parse(body);
        if (this.log) {console.log("json is:", json);}
      }
      catch(err) {
        console.error("Error parsing webRequest jsonBody:", body);
      }
    }
    
    // Condition branches
    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    const trueIntentAttributes = action.trueIntentAttributes;
    const falseIntentAttributes = action.falseIntentAttributes;
    let stopOnConditionMet = action.stopOnConditionMet;
    if (trueIntent && trueIntent.trim() === "") {
      trueIntent = null;
    }
    if (falseIntent && falseIntent.trim() === "") {
      falseIntent = null;
    }

    if (this.log) {console.log("webRequest URL", url);}
    const HTTPREQUEST = {
      url: url,
      headers: headers,
      json: json,
      method: action.method
    };
    if (this.log) {console.log("webRequest HTTPREQUEST", HTTPREQUEST);}
    this.#myrequest(
      HTTPREQUEST, async (err, res) => {
        if (this.log && err) {
          console.log("webRequest error:", err);
        }
        if (this.log) {console.log("got res:", res);}
        let resbody = res.data;
        let status = res.status;
        let error = res.error;
        await this.#assignAttributes(action, resbody, status, error)
        if (this.log) {console.log("webRequest resbody:", resbody);}
        if (err) {
          if (this.log) {console.error("webRequest error:", err);}
          if (callback) {
            this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
              callback(false); // continue the flow
            });
          }
        }
        else if(res.status >= 200 && res.status <= 299) {
          await this.#executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
            callback(stopOnConditionMet); // stop the flow
          });
        }
        else {
          await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
            callback(false); // continue the flow
          });
        }
      }
    );
  }

  async #executeCondition(result, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, callback) {
    let trueIntentDirective = null;
    if (trueIntent) {
      trueIntentDirective = DirIntent.intentDirectiveFor(trueIntent, trueIntentAttributes);
    }
    let falseIntentDirective = null;
    if (falseIntent) {
      falseIntentDirective = DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes);
    }
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

  async #assignAttributes(action, resbody, status, error) {
    if (this.log) {
      console.log("assignAttributes resbody:", resbody)
      console.log("assignAttributes error:", error)
      console.log("assignAttributes status:", status)
      console.log("assignAttributes action:", action)
    }
    if (this.context.tdcache) {
      if (action.assignResultTo && resbody) {
        if (this.log) {console.log("assign assignResultTo:", resbody);}
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignResultTo, resbody);
      }
      if (action.assignErrorTo && error) {
        if (this.log) {console.log("assign assignResultTo:", error);}
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignErrorTo, error);
      }
      if (action.assignStatusTo && status) {
        if (this.log) {console.log("assign assignStatusTo:", status);}
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignStatusTo, status);
      }
      // Debug log
      if (this.log) {
        const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
        for (const [key, value] of Object.entries(all_parameters)) {
          if (this.log) {console.log("(webRequest) request parameter:", key, "value:", value, "type:", typeof value)}
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
      headers: options.headers,
      timeout: 20000
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
      if (callback) {
        callback(null, res);
      }
        // if (callback) {
        //   let data = null;
        //   let status = 1000;
        //   if (res) {
        //     status = res.status;
        //     data = res.data;
        //   }
        //   callback(
        //     {
        //       status: status,
        //       data: data
        //     }, null
        //   );
        // }
      
    })
    .catch( (err) => {
      if (this.log) {
        // FIX THE STRINGIFY OF CIRCULAR STRUCTURE BUG - START
        let cache = [];
        let error_log = JSON.stringify(err, function(key, value) { // try to use a separate function
          if (typeof value === 'object' && value != null) {
            if (cache.indexOf(value) !== -1) {
              return;
            }
            cache.push(value);
          }
          return value;
        });
        console.error("An error occurred: ", error_log);
        // FIX THE STRINGIFY OF CIRCULAR STRUCTURE BUG - END
        // console.error("An error occurred:", JSON.stringify(err));
      }
      if (callback) {
        let status = 1000;
        let cache = [];
        let str_error = JSON.stringify(err, function(key, value) { // try to use a separate function
          if (typeof value === 'object' && value != null) {
            if (cache.indexOf(value) !== -1) {
              return;
            }
            cache.push(value);
          }
          return value;
        });
        let error = JSON.parse(str_error) // "status" disappears without this trick
        let errorMessage = JSON.stringify(error);
        if (error.status) {
          status = error.status;
        }
        if (error.message) {
          errorMessage = error.message;
        }
        callback(
          null, {
            status: status,
            data: null,
            error: errorMessage
          }
        );
      }
    });
  }

}

module.exports = { DirWebRequestV2 };