const axios = require("axios").default;
const { TiledeskChatbot } = require("../../models/TiledeskChatbot");
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
let https = require("https");
require('dotenv').config();


class DirN8N {

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
    if (this.log) { console.log("DirN8n directive: ", directive); }
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      console.error("DirN8n Incorrect directive: ", JSON.stringify(directive));
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    })
  }

  async go(action, callback) {
    if (this.log) { console.log("DirN8n action:", JSON.stringify(action)); }
    if (!this.tdcache) {
      console.error("Error: DirN8n tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;

    if (this.log) {
      console.log("DirN8n trueIntent", trueIntent)
      console.log("DirN8n falseIntent", falseIntent)
      console.log("DirN8n trueIntentAttributes", trueIntentAttributes)
      console.log("DirN8n falseIntentAttributes", falseIntentAttributes)
    }

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    //let token = action.token;
    let bodyParameters = action.bodyParameters;
    if (this.log) { console.log("DirN8n bodyParameters: ", bodyParameters); }

    if (!bodyParameters || bodyParameters === '') {
      if (this.log) { console.error("DirN8n ERROR - bodyParameters is undefined or null or empty string") };
      callback();
      return;
    }

    const server_base_url = process.env.API_ENDPOINT || process.env.API_URL;
    const n8n_base_url = process.env.N8N_ENDPOINT || "https://ninella.app.n8n.cloud/webhook-test/"
    if (this.log) {
      console.log("DirN8n server_base_url ", server_base_url);
      console.log("DirN8n n8n_base_url ", n8n_base_url);
    }

    let key = await this.getKeyFromIntegrations(server_base_url);
    if (this.log) { console.log('DirN8n key Debug1: ', key) }
    // ONLY FOR DEBUG CANCELLARE!!!!!
      if (process.env.N8N_DEBUG == '1') {
       key = process.env.N8N_TOKEN;
      }
    if (!key) {
      if (this.log) { console.log("DirN8n - Key not found in Integrations."); }
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
    if (this.log) { console.log('DirN8n bodyParameters filler: ', bodyParameters) }

    // CREATE THE JSON FOR N8N
    let n8n_bodyParameters = {};
    for (const [key, value] of Object.entries(bodyParameters)) {
      if (this.log) { console.log("bodyParam:", key, "value:", value) }
      n8n_bodyParameters[key] = value;
    }
    if (this.log) { console.log('DirN8n n8n_bodyParameters: ', n8n_bodyParameters) }


    let json = n8n_bodyParameters;
    if (this.log) { console.log('DirN8n key Debug2: ', key) }
    //----------------
    if (this.log) {console.log("DirN8n n8n_base_url ",n8n_base_url);}
    if (this.log) { console.log('DirN8n json: ', json) }
    const N8N_HTTPREQUEST = {
      url: n8n_base_url + '/' + action.url,
      headers: {
        'Authorization': 'Basic ' + key,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      json: json,
      method: "POST"
    }
    if (this.log) { console.log("DirN8n N8N_HTTPREQUEST", JSON.stringify(N8N_HTTPREQUEST)); }

    this.#myrequest(
      N8N_HTTPREQUEST, async (err, resbody) => {
        if (err) {
          if (callback) {
            if (this.log) {
              console.error("(httprequest) DirN8n err response:", err.response)
              console.error("(httprequest) DirN8n err data:", err.response.data)
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
              console.error("(httprequest) DirN8n err data result:", result); // CONTROLLA IL VALORE
              console.error("(httprequest) DirN8n err data status:", status);
              console.error("(httprequest) DirN8n err data error:", error);
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
          if (this.log) { console.log("DirN8n resbody: ", JSON.stringify(resbody, null, 2).slice(2, -1)); }

          let status = 201;
          let error = null;
          let result = JSON.stringify(resbody, null, 2).slice(2, -1);
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
      console.log("DirN8n assignAttributes action:", action)
      console.log("DirN8n assignAttributes status:", status)
      console.log("DirN8n assignAttributes result:", result)
      console.log("DirN8n assignAttributes error:", error)
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
          if (this.log) { console.log("DirN8n request parameter:", key, "value:", value, "type:", typeof value) }
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
    if (this.log) { console.log('DirN8n executeCondition/result', result) }
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
        url: server_base_url + "/" + this.context.projectId + "/integration/name/N8n",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        method: "GET"
      }
      if (this.log) { console.log("N8n INTEGRATIONS_HTTPREQUEST ", INTEGRATIONS_HTTPREQUEST) }

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

module.exports = { DirN8N }