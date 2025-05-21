let axios = require('axios');
let https = require("https");
const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { DirIntent } = require('./DirIntent');

class DirWebRequestV2 {
  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.chatbot = context.chatbot;
    this.log = context.log;
    
    this.intentDir = new DirIntent(context);
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

    let requestAttributes = null;
    if (this.tdcache) {
      requestAttributes = 
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );
    }
    const filler = new Filler();
    const url = filler.fill(action.url, requestAttributes);

    let headers = {};
    if (action.headersString) {
      let headersDict = action.headersString
      for (const [key, value] of Object.entries(headersDict)) {
        if (this.log) {console.log("header:", key, "value:", value)}
        let filled_value = filler.fill(value, requestAttributes);
        headers[key] = filled_value;
      }
    }

    let json = null;
    try {
      if (action.jsonBody && action.bodyType == "json") {
        if (this.log) {console.log("action.body is:", action.jsonBody);}
        let jsonBody = filler.fill(action.jsonBody, requestAttributes);
        try {
          json = JSON.parse(jsonBody);
          if (this.log) {console.log("json is:", json);}
        }
        catch(err) {
          console.error("Error parsing webRequest jsonBody:", jsonBody);
          if (callback) {
            if (falseIntent) {
              await this.chatbot.addParameter("flowError", "Error parsing jsonBody");
              this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
                console.log('herrrrr 11111' )
                callback(true); // stop the flow
                return;
              });
            }
            else {
              console.log('herrrrr 2222' )
              callback(false); // continue the flow
              return;
            }
          }
        }
      }
      else if (action.formData && action.bodyType == "form-data") {
        let formData = filler.fill(action.formData, requestAttributes);
        if (this.log) {console.log("action.body is form-data:", formData);}
        // // fill
        if (formData && formData.length > 0) {
          for (let i = 0; i < formData.length; i++) {
            let field = formData[i];
            if (field.value) {
              field.value = filler.fill(field.value, requestAttributes);
              if (this.log) {console.log("field filled:", field.value);}
            }
          }
        }
        json = {};
        for (let i = 0; i < formData.length; i++) {
          let field = formData[i];
          if (field.enabled && field.value && field.type === "URL") {
            if (this.log) {console.log("Getting file:", field.value);}
            let response = await axios.get(field.value,
              {
                responseType: 'stream'
              }
            );
            let stream = response.data;
            // if (this.log) {console.log("Stream data:", stream);}
            json[field.name] = stream;
            // process.exit(0);
          }
          else if (field.enabled && field.value && field.type === "Text") {
            json[field.name] = field.value;
          }
        }
        if (this.log) {console.log("final json:", json);}
      }
      else {
        if (this.log) {console.log("no action upload parts");}
      }

    }
    catch(error) {
      console.error("Error", error);
      if (callback) {
        if (falseIntent) {
          await this.chatbot.addParameter("flowError", "Error: " + error);
          this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
            callback(true); // stop the flow
            return;
          });
        }
        else {
          callback(false); // continue the flow
          return;
        }
      }
    }
    
    

    let timeout = this.#webrequest_timeout(action, 20000, 1, 300000);
    
    if (this.log) {console.log("webRequest URL", url);}
    
    const HTTPREQUEST = {
      url: url,
      headers: headers,
      json: json,
      method: action.method,
      timeout: timeout
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
            if (falseIntent) {
              this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
                callback(true); // stop the flow
              });
            }
            else {
              callback(false); // continue the flow
            }
          }
        }
        else if(res.status >= 200 && res.status <= 299) {
          if (trueIntent) {
            await this.#executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
              callback(true); // stop the flow
            });
          }
          else {
            callback(false); // continue the flow
          }
        }
        else {
          if (falseIntent) {
            this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes, () => {
              callback(true); // stop the flow
            });
          }
          else {
            callback(false); // continue the flow
          }
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
    try {
      if (this.log) {
        console.log("API URL:", options.url);
        //console.log("** Options:", JSON.stringify(options));
        // Stringify "options". FIX THE STRINGIFY OF CIRCULAR STRUCTURE BUG - START
        let cache = [];
        let str_Options = JSON.stringify(options, function(key, value) { // try to use a separate function
          if (typeof value === 'object' && value != null) {
            if (cache.indexOf(value) !== -1) {
              return;
            }
            cache.push(value);
          }
          return value;
        });
        console.log("** Options:", str_Options);
      }
      let axios_options = {
        url: options.url,
        method: options.method,
        params: options.params,
        headers: options.headers,
        timeout: options.timeout,
        maxContentLength: 10000000, // max 10mb response size
        maxBodyLength: 10000000 // max 10mb request body size
      }
    
      if (options.json !== null) {
        axios_options.data = options.json
      }
      // if (this.log) {
      //   console.log("axios_options:", JSON.stringify(axios_options));
      // }
      if (options.url.startsWith("https:")) {
        const httpsAgent = new https.Agent({
          rejectUnauthorized: false,
        });
        axios_options.httpsAgent = httpsAgent;
      }
    
      axios(axios_options)
      .then((res) => {
        if (this.log) {
          console.log("Success Response:", res);
          console.log("Response for url:", options.url);
          console.log("Response headers:\n", JSON.stringify(res.headers));
        }
        if (callback) {
          callback(null, res);
        }
      })
      .catch( (err) => {
        if (this.log) {
          if (err.response) {
            console.log("Error Response data:", err.response.data);
          }
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
          let data = null;
          if (err.response) {
            data =  err.response.data;
          }
          callback(
            null, {
              status: status,
              data: data,
              error: errorMessage
            }
          );
        }
      });
    }
    catch(error) {
      console.error("Error:", error);
    }
  }

  #webrequest_timeout(action, default_timeout, min, max) {
    let timeout = default_timeout;
    if (!action.settings) {
      return timeout;
    }
    // console.log("default timeout:", timeout);
    // console.log("action.settings:", action.settings);
    // console.log("action.settings.timeout:", action.settings.timeout);
    // console.log("typeof action.settings.timeout:", typeof action.settings.timeout);
    // console.log("action.settings.timeout > min", action.settings.timeout > min)
    // console.log("action.settings.timeout < max", action.settings.timeout < max)  
    
    if (action.settings.timeout) {
      if ((typeof action.settings.timeout === "number") && action.settings.timeout > min && action.settings.timeout < max) {
        timeout = Math.round(action.settings.timeout)
        // console.log("new timeout:", timeout);
      }
    }
    // console.log("returning timeout:", timeout);
    return timeout
  }

}

module.exports = { DirWebRequestV2 };