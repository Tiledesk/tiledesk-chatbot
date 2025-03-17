let axios = require('axios');
let https = require("https");
const { Filler } = require('../Filler');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { DirIntent } = require('./DirIntent');
const winston = require('../../utils/winston');

class DirWebRequestV2 {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.chatbot = context.chatbot;
    this.intentDir = new DirIntent(context);
    this.log = context.log;
  }

  execute(directive, callback) {
    winston.verbose("Execute WebRequestV2 directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.warn("DirWebRequestV2 Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    }).catch((err) => {
      // do not nothing
    });
  }

  async go(action, callback) {
    if (this.log) { console.log("DirWebRequest action:", JSON.stringify(action)); }
    if (!this.tdcache) {
      console.error("Error: DirWebRequest tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;

    if (this.log) {
      console.log("DirWebRequest trueIntent", trueIntent)
      console.log("DirWebRequest falseIntent", falseIntent)
      console.log("DirWebRequest trueIntentAttributes", trueIntentAttributes)
      console.log("DirWebRequest falseIntentAttributes", falseIntentAttributes)
    }

    let requestAttributes = null;
    requestAttributes =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );

    const filler = new Filler();
    const url = filler.fill(action.url, requestAttributes);

    let headers = await this.getHeadersFromAction(action, filler, requestAttributes).catch( async (err) => {
      await this.chatbot.addParameter("flowError", "Error getting headers");
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return Promise.reject(err);;
      }
      callback();
      return Promise.reject(err);
    });

    let json = await this.getJsonFromAction(action, filler, requestAttributes).catch( async (err) => {
      await this.chatbot.addParameter("flowError", "Error parsing json body");
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return Promise.reject(err);;
      }
      callback();
      return Promise.reject(err);
    });

    let timeout = this.#webrequest_timeout(action, 20000, 1, 300000);

    if (this.log) {console.log("webRequest URL", url);}

    const HTTPREQUEST = {
      url: url,
      headers: headers,
      json: json,
      method: action.method,
      timeout: timeout
    };
    if (this.log) { console.log("webRequest HTTPREQUEST", HTTPREQUEST); }
    
    this.#myrequest(
      HTTPREQUEST, async (err, res) => {
        if (this.log && err) {
          console.log("webRequest error:", err);
        }
        if (this.log) { console.log("DirWebRequest res:", res); }
        let resbody = res.data;
        let status = res.status;
        let error = res.error;
        await this.#assignAttributes(action, resbody, status, error)
        if (this.log) { console.log("webRequest resbody:", resbody); }
        
        if (err) {
          if (this.log) { console.error("webRequest error:", err); }
          if (callback) {
            if (falseIntent) {
              await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
              callback(true);
              return;
            }
            callback();
            return;
          }
        }
        else if (res.status >= 200 && res.status <= 299) {
          if (trueIntent) {
            await this.#executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
            callback(true);
            return;
          }
          callback();
          return;
        }
        else {
          if (falseIntent) {
            await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
            callback(true);
            return;
          }
          callback();
          return;
        }
      }
    );
  }


  async getHeadersFromAction(action, filler, requestAttributes) {
    return new Promise((resolve, reject) => {
      let headers = {};
      if (action.headersString) {
        try {
          let headersDict = action.headersString
          for (const [key, value] of Object.entries(headersDict)) {
            let filled_value = filler.fill(value, requestAttributes);
            headers[key] = filled_value;
          }
          resolve(headers)
        } catch(err) {
          reject("Error getting headers");
        }
      } else {
        resolve(headers)
      }

    })
  }
  async getJsonFromAction(action, filler, requestAttributes) {

    return new Promise( async (resolve, reject) => {

      if (action.jsonBody && action.bodyType == "json") {
        let jsonBody = filler.fill(action.jsonBody, requestAttributes);
        try {
          let json = JSON.parse(jsonBody);
          resolve(json);
        }
        catch (err) {
          if (this.log) { console.error("Error parsing webRequest jsonBody:", jsonBody, err) };
          reject("Error parsing jsonBody");
        }
      }
      else if (action.formData && action.bodyType == "form-data") {
        let formData = filler.fill(action.formData, requestAttributes);
        try {
          if (formData && formData.length > 0) {
            for (let i = 0; i < formData.length; i++) {
              let field = formData[i];
              if (field.value) {
                field.value = filler.fill(field.value, requestAttributes);
              }
            }
          }
          let json = {};
          for (let i = 0; i < formData.length; i++) {
            let field = formData[i];
            if (field.enabled && field.value && field.type === "URL") {
              let response = await axios.get(field.value,
                {
                  responseType: 'stream'
                }
              );
              let stream = response.data;
              json[field.name] = stream;
            }
            else if (field.enabled && field.value && field.type === "Text") {
              json[field.name] = field.value;
            }
          }
          resolve(json);
        } catch (err) {
          if (this.log) { console.error("Error parsing webRequest formData:", formData, err) };
          reject("Error parsing formData");
        }
      }
      else {
        resolve(null);
      }
    })
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
          if (callback) {
            callback();
          }
        });
      }
      else {
        if (this.log) { console.log("No trueIntentDirective specified"); }
        if (callback) {
          callback();
        }
      }
    }
    else {
      if (falseIntentDirective) {
        this.intentDir.execute(falseIntentDirective, () => {
          if (callback) {
            callback();
          }
        });
      }
      else {
        if (this.log) { console.log("No falseIntentDirective specified"); }
        if (callback) {
          callback();
        }
      }
    }
  }

  async #assignAttributes(action, resbody, status, error) {

    if (this.context.tdcache) {
      if (action.assignResultTo && resbody) {
        if (this.log) { console.log("assign assignResultTo:", resbody); }
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignResultTo, resbody);
      }
      if (action.assignErrorTo && error) {
        if (this.log) { console.log("assign assignResultTo:", error); }
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignErrorTo, error);
      }
      if (action.assignStatusTo && status) {
        if (this.log) { console.log("assign assignStatusTo:", status); }
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignStatusTo, status);
      }
      // Debug log
      if (this.log) {
        const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
        for (const [key, value] of Object.entries(all_parameters)) {
          if (this.log) { console.log("(webRequest) request parameter:", key, "value:", value, "type:", typeof value) }
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
        let str_Options = JSON.stringify(options, function (key, value) { // try to use a separate function
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
        .catch((err) => {
          if (this.log) {
            if (err.response) {
              console.log("Error Response data:", err.response.data);
            }
            // FIX THE STRINGIFY OF CIRCULAR STRUCTURE BUG - START
            let cache = [];
            let error_log = JSON.stringify(err, function (key, value) { // try to use a separate function
              if (typeof value === 'object' && value != null) {
                if (cache.indexOf(value) !== -1) {
                  return;
                }
                cache.push(value);
              }
              return value;
            });
            console.error("(DirWebRequestv2) An error occurred: ", error_log);
            // FIX THE STRINGIFY OF CIRCULAR STRUCTURE BUG - END
            // console.error("An error occurred:", JSON.stringify(err));
          }
          if (callback) {
            let status = 1000;
            let cache = [];
            let str_error = JSON.stringify(err, function (key, value) { // try to use a separate function
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
              data = err.response.data;
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
    catch (error) {
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
      }
    }
    return timeout
  }

}

module.exports = { DirWebRequestV2 };