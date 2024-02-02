const axios = require("axios").default;
const { TiledeskChatbot } = require("../../models/TiledeskChatbot");
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
let https = require("https");
require('dotenv').config();


class DirHubspot {

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
    if (this.log) { console.log("DirHubspot directive: ", directive); }
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      console.error("DirHubspot Incorrect directive: ", JSON.stringify(directive));
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    })
  }

  async go(action, callback) {
    if (this.log) { console.log("DirHubspot action:", JSON.stringify(action)); }
    if (!this.tdcache) {
      console.error("Error: DirHubspot tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;

    if (this.log) {
      console.log("DirAskGPT trueIntent", trueIntent)
      console.log("DirAskGPT falseIntent", falseIntent)
      console.log("DirAskGPT trueIntentAttributes", trueIntentAttributes)
      console.log("DirAskGPT falseIntentAttributes", falseIntentAttributes)
    }

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    //let token = action.token;
    let bodyParameters = action.bodyParameters;
    if (this.log) { console.log("DirHubspot bodyParameters: ", bodyParameters); }

    if (!bodyParameters || bodyParameters === '') {
      if (this.log) { console.error("DirHubspot ERROR - bodyParameters is undefined or null or empty string") };
      callback();
      return;
    }

    const server_base_url = process.env.API_ENDPOINT || process.env.API_URL;
    const hubspot_base_url = process.env.HUBSPOT_ENDPOINT;
    if (this.log) {
      console.log("DirHubspot server_base_url ", server_base_url);
      console.log("DirHubspot hubspot_base_url ", hubspot_base_url);
    }

    let key = await this.getKeyFromIntegrations(server_base_url);
    if (!key) {
      if (this.log) { console.log("DirGptTask - Key not found in Integrations."); }
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
    if (this.log) { console.log('DirHubspot bodyParameters filler: ', bodyParameters) }

    let json = {
      inputs: [
        { properties: bodyParameters, associations: [] }
      ]
    }
    const HUBSPOT_HTTPREQUEST = {
      url: hubspot_base_url + 'objects/contacts/batch/create',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      json: json,
      method: "POST"
    }
    if (this.log) { console.log("DirHubspot MAKE_HTTPREQUEST", JSON.stringify(HUBSPOT_HTTPREQUEST)); }

    this.#myrequest(
      HUBSPOT_HTTPREQUEST, async (err, resbody) => {
        if (err) {
          if (callback) {
            if (this.log) {
              console.error("(httprequest) DirHubspot err response:", err.response)
              console.error("(httprequest) DirHubspot err data:", err.response.data)
            };

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
              console.error("(httprequest) DirHubspot err data status:", status);
              console.error("(httprequest) DirHubspot err data error:", error);
            }

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
          if (this.log) { console.log("DirHubspot resbody: ", JSON.stringify(resbody, null, 2)); }

          let status = 201;
          let error = null;
          await this.#assignAttributes(action, status, error);
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

  async #assignAttributes(action, status, error) {
    if (this.log) {
      console.log("DirHubspot assignAttributes action:", action)
      console.log("DirHubspot assignAttributes status:", status)
      console.log("DirHubspot assignAttributes error:", error)
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
          if (this.log) { console.log("DirHubspot request parameter:", key, "value:", value, "type:", typeof value) }
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
    if (this.log) { console.log('DirHubspot executeCondition/result', result) }
    if (result === true) {
      if (trueIntentDirective) {
        this.intentDir.execute(trueIntentDirective, () => {
          callback();
        });
      }
      else {
        if (this.log) { console.log("No trueIntentDirective specified"); }
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
        if (this.log) { console.log("No falseIntentDirective specified"); }
        callback();
      }
    }
  }

  async getKeyFromIntegrations(server_base_url) {
    return new Promise((resolve) => {

      const INTEGRATIONS_HTTPREQUEST = {
        url: server_base_url + "/" + this.context.projectId + "/integration/name/hubspot",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        method: "GET"
      }
      if (this.log) { console.log("DirGptTask INTEGRATIONS_HTTPREQUEST ", INTEGRATIONS_HTTPREQUEST) }

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

module.exports = { DirHubspot }