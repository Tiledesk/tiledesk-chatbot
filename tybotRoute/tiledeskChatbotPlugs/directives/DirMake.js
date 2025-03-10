const axios = require("axios").default;
const { TiledeskChatbot } = require("../../models/TiledeskChatbot");
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
let https = require("https");
require('dotenv').config();

class DirMake {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.intentDir = new DirIntent(context);
    this.log = context.log;
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
    this.go(action, (stop) => {
      callback(stop);
    })
  }

  async go(action, callback) {
    if (this.log) { console.log("DirMake action:", JSON.stringify(action)); }
    if (!this.tdcache) {
      console.error("Error: DirMake tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;

    if (this.log) {
      console.log("DirMake trueIntent", trueIntent)
      console.log("DirMake falseIntent", falseIntent)
      console.log("DirMake trueIntentAttributes", trueIntentAttributes)
      console.log("DirMake falseIntentAttributes", falseIntentAttributes)
    }

    // default values?
    let status = null;
    let error = null;

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    let webhook_url = action.url;
    let bodyParameters = action.bodyParameters;

    if (this.log) {
      console.log("DirMake webhook_url: ", webhook_url);
      console.log("DirMake bodyParameters: ", JSON.stringify(bodyParameters));
    }

    if (!bodyParameters) {
      console.error("Error: DirMake bodyParameters is undefined");
      error = "Missing body parameters";
      await this.#assignAttributes(action, status, error);
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

    if (!webhook_url || webhook_url === '') {
      if (this.log) {console.error("DirMake ERROR - webhook_url is undefined or null or empty string:")};
      let status = 422;   
      let error = 'Missing make webhook url';
      await this.#assignAttributes(action, status, error);
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

    /**
     * process.env.MAKE_ENDPOINT is used for testing purposes only.
     * This variable must be not defined in Production Env.
    */
    let make_base_url = process.env.MAKE_ENDPOINT;
    let url;

    if (make_base_url) {
      url = make_base_url + "/make/";
    } else {
      url = action.url;
    }
    if (this.log) { console.log("DirMake MakeEndpoint URL: ", url); }

    const filler = new Filler();
    for (const [key, value] of Object.entries(bodyParameters)) {
      let filled_value = filler.fill(value, requestVariables);
      bodyParameters[key] = filled_value;
    }
    if (this.log) { console.log('DirMake bodyParameters filler: ', bodyParameters) }

    const MAKE_HTTPREQUEST = {
      url: url,
      headers: {
        'Content-Type': 'application/json'
      },
      json: bodyParameters,
      method: "POST"
    }
    if (this.log) { console.log("DirMake MAKE_HTTPREQUEST", MAKE_HTTPREQUEST); }
    this.#myrequest(
      MAKE_HTTPREQUEST, async (err, res) => {
        if (err) {
          if (callback) {
            console.error("(httprequest) DirMake err:", err);
            // let status = 404;
            // let error = 'Make url not found';
            status = res.status;
            error = res.error;
            await this.#assignAttributes(action, status, error);
            if (falseIntent) {
              await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
              callback(true);
              return;
            }
            callback();
            return;
          }
        } else if (callback) {
          if (this.log) { console.log("(httprequest) DirMake resbody ", res); }
          // let status = 200;
          // let error = null;
          status = res.status;
          error = null;
          if (res.error) {
            error = res.error
          }
          await this.#assignAttributes(action, status, error);
          if (trueIntent) {
            await this.#executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
              callback(true);
              return;
          }
          callback();
          return;
        }
      }
    );

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

  // Advanced #myrequest function
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

      })
      .catch((err) => {
        if (this.log) {
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
          console.error("(DirMake) An error occurred: ", error_log);
          // FIX THE STRINGIFY OF CIRCULAR STRUCTURE BUG - END
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
}

module.exports = { DirMake }