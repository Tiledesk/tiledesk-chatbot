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
    });
  }

  async go(action, callback) {
    winston.debug("(DirWebRequestV2) Action: ", action);
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
        let filled_value = filler.fill(value, requestAttributes);
        headers[key] = filled_value;
      }
    }

    let json = null;
    try {
      if (action.jsonBody && action.bodyType == "json") {
        let jsonBody = filler.fill(action.jsonBody, requestAttributes);
        try {
          json = JSON.parse(jsonBody);
        }
        catch(err) {
          winston.error("(DirWebRequestV2) Error parsing webRequest jsonBody: ", jsonBody);
        }
      }
      else if (action.formData && action.bodyType == "form-data") {
        let formData = filler.fill(action.formData, requestAttributes);
        winston.debug("(DirWebRequestV2) action.body is form-data: ", formData);
        // // fill
        if (formData && formData.length > 0) {
          for (let i = 0; i < formData.length; i++) {
            let field = formData[i];
            if (field.value) {
              field.value = filler.fill(field.value, requestAttributes);
            }
          }
        }
        json = {};
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
            // process.exit(0);
          }
          else if (field.enabled && field.value && field.type === "Text") {
            json[field.name] = field.value;
          }
        }
        winston.debug("(DirWebRequestV2) final json: ", json);
      }
      else {
        winston.debug("(DirWebRequestV2) no action upload parts");
      }

    }
    catch(error) {
      winston.error("(DirWebRequestV2) Error: ", error);
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

    let timeout = this.#webrequest_timeout(action, 20000, 1, 300000);
    
    winston.debug("(DirWebRequestV2) webRequest URL " + url);
    
    const HTTPREQUEST = {
      url: url,
      headers: headers,
      json: json,
      method: action.method,
      timeout: timeout
    };

    winston.debug("(DirWebRequestV2) HttpRequest: ", HTTPREQUEST);
    this.#myrequest(
      HTTPREQUEST, async (err, res) => {
        winston.debug("(DirWebRequestV2) got res: ", res);
        let resbody = res.data;
        let status = res.status;
        let error = res.error;
        await this.#assignAttributes(action, resbody, status, error)

        winston.debug("(DirWebRequestV2) resbody:", resbody);

        if (err) {
          winston.error("(DirWebRequestV2)  error:", err);
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
        winston.debug("(DirWebRequestV2) No trueIntentDirective specified");
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
        winston.debug("(DirWebRequestV2) No falseIntentDirective specified");
        callback();
      }
    }
  }

  async #assignAttributes(action, resbody, status, error) {

    if (this.context.tdcache) {
      if (action.assignResultTo && resbody) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignResultTo, resbody);
      }
      if (action.assignErrorTo && error) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignErrorTo, error);
      }
      if (action.assignStatusTo && status) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignStatusTo, status);
      }
    }
  }

  #myrequest(options, callback) {
    try {
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
        if (callback) {
          callback(null, res);
        }
      })
      .catch( (err) => {
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
      winston.error("Error: ", error);
    }
  }

  #webrequest_timeout(action, default_timeout, min, max) {
    let timeout = default_timeout;
    if (!action.settings) {
      return timeout;
    }
   
    
    if (action.settings.timeout) {
      if ((typeof action.settings.timeout === "number") && action.settings.timeout > min && action.settings.timeout < max) {
        timeout = Math.round(action.settings.timeout)
      }
    }
    return timeout
  }

}

module.exports = { DirWebRequestV2 };