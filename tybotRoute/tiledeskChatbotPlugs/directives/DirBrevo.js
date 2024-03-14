const axios = require("axios").default;
const { TiledeskChatbot } = require("../../models/TiledeskChatbot");
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
let https = require("https");
require('dotenv').config();


class DirBrevo {

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
    if (this.log) { console.log("DirBrevo directive: ", directive); }
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      console.error("DirBrevo Incorrect directive: ", JSON.stringify(directive));
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    })
  }

  async go(action, callback) {
    if (this.log) { console.log("DirBrevo action:", JSON.stringify(action)); }
    if (!this.tdcache) {
      console.error("Error: DirBrevo tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;

    if (this.log) {
      console.log("DirBrevo trueIntent", trueIntent)
      console.log("DirBrevo falseIntent", falseIntent)
      console.log("DirBrevo trueIntentAttributes", trueIntentAttributes)
      console.log("DirBrevo falseIntentAttributes", falseIntentAttributes)
    }

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    //let token = action.token;
    let bodyParameters = action.bodyParameters;
    if (this.log) { console.log("DirBrevo bodyParameters: ", bodyParameters); }

    if (!bodyParameters || bodyParameters === '') {
      if (this.log) { console.error("DirBrevo ERROR - bodyParameters is undefined or null or empty string") };
      callback();
      return;
    }

    const server_base_url = process.env.API_ENDPOINT || process.env.API_URL;
    const brevo_base_url = process.env.BREVO_ENDPOINT;
    if (this.log) {
      console.log("DirBrevo server_base_url ", server_base_url);
      console.log("DirBrevo brevo_base_url ",brevo_base_url);
    }

    let key = await this.getKeyFromIntegrations(server_base_url);
    if (this.log) { console.log('DirBrevo key Debug1: ', key) }
    // ONLY FOR DEBUG CANCELLARE!!!!!
    key = process.env.BREVO_TOKEN;
    if (!key) {
      if (this.log) { console.log("DirBrevo - Key not found in Integrations."); }
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
    }

    const filler = new Filler();
    for (const [key, value] of Object.entries(bodyParameters)) {
      if (this.log) { console.log("bodyParam:", key, "value:", value) }
      let filled_value = filler.fill(value, requestVariables);
      bodyParameters[key] = filled_value;
    }
    if (this.log) { console.log('DirBrevo bodyParameters filler: ', bodyParameters) }

    let json =  bodyParameters
    if (this.log) { console.log('DirBrevo key Debug2: ', key) }
    //----------------
    if (this.log) {console.log("DirBrevo brevo_base_url ",brevo_base_url);}
    if (this.log) { console.log('DirBrevo json: ', json) }
    const BREVO_HTTPREQUEST = {
      url: brevo_base_url + '/contacts',
      headers: {
        'api-key': key,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      json: json,
      method: "POST"
    }
    if (this.log) { console.log("DirBrevo BREVO_HTTPREQUEST", JSON.stringify(BREVO_HTTPREQUEST)); }

    this.#myrequest(
      BREVO_HTTPREQUEST, async (err, resbody) => {
        if (err) {
          if (callback) {
            if (this.log) {
              console.error("(httprequest) DirBrevo err response:", err.response)
              console.error("(httprequest) DirBrevo err data:", err.response.data)
            };

            let result = null;
            let status = null;
            let error;

            if (err.response &&
                err.response.status) {
                  status = err.response.status;
            }

            if (err.response &&
                err.response.data &&
                err.response.data.message) {
                  error = err.response.data.message;
            }

            if (this.log) {
              console.error("(httprequest) DirBrevo err data result:", result); // CONTROLLA IL VALORE
              console.error("(httprequest) DirBrevo err data status:", status);
              console.error("(httprequest) DirBrevo err data error:", error);
            }

            await this.#assignAttributes(action, status, result, error);
            if (falseIntent) {
              await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
              callback(true);
              return;
            }
            callback();
            return;
          }
        } else if (callback) {
          if (this.log) { console.log("DirBrevo resbody: ", JSON.stringify(resbody, null, 2)); }

          let status = 201;
          let error = null;
          let result = resbody;
          await this.#assignAttributes(action, status, result, error);
          if (trueIntent) {
            await this.#executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes)
            callback(true);
            return;
          }
          callback();
          return;
        }
      }
    );

  }

  async #assignAttributes(action, status, result, error) {
    if (this.log) {
      console.log("DirBrevo assignAttributes action:", action)
      console.log("DirBrevo assignAttributes status:", status)
      console.log("DirBrevo assignAttributes result:", result)
      console.log("DirBrevo assignAttributes error:", error)
    }
    if (this.context.tdcache) {
      if (action.assignStatusTo) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignStatusTo, status);
      }
      if (action.assignResultTo) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignResultTo, result);
      }
      if (action.assignErrorTo) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignErrorTo, error);
      }

      // Debug log
      if (this.log) {
        const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
        for (const [key, value] of Object.entries(all_parameters)) {
          if (this.log) { console.log("DirBrevo request parameter:", key, "value:", value, "type:", typeof value) }
        }
      }
    }
  }

  #myrequest(options, callback) {
    if (this.log) {
      console.log("** API URL:", options.url);
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
          console.log("Response status:", JSON.stringify(res.status));
        }
        if (res && (res.status == 200 || res.status == 201) && res.data) {
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
        if (callback) {
          callback(error, null);
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
    if (this.log) { console.log('DirBrevo executeCondition/result', result) }
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

  async getKeyFromIntegrations(server_base_url) {
    return new Promise((resolve) => {

      const INTEGRATIONS_HTTPREQUEST = {
        url: server_base_url + "/" + this.context.projectId + "/integration/name/Brevo",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        method: "GET"
      }
      if (this.log) { console.log("Brevo INTEGRATIONS_HTTPREQUEST ", INTEGRATIONS_HTTPREQUEST) }

      this.#myrequest(
        INTEGRATIONS_HTTPREQUEST, async (err, integration) => {
          if (err) {
            resolve(null);
          } else {

            if (integration &&
              integration.value) {
              resolve(integration.value.apikey)
            }
            else {
              resolve(null)
            }
          }
        })
    })
  }

}

module.exports = { DirBrevo }