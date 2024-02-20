const axios = require("axios").default;
const { TiledeskChatbot } = require("../../models/TiledeskChatbot");
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
let https = require("https");
require('dotenv').config();


class DirCustomerio {

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
    if (this.log) { console.log("DirCustomerio directive: ", directive); }
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      console.error("DirCustomerio Incorrect directive: ", JSON.stringify(directive));
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    })
  }

  async go(action, callback) {
    if (this.log) { console.log("DirCustomerio action:", JSON.stringify(action)); }
    if (!this.tdcache) {
      console.error("Error: DirCustomerio tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    if (this.log) {
      console.log("DirCustomerio trueIntent", trueIntent)
      console.log("DirCustomerio falseIntent", falseIntent)
    }

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    let formid = action.formid;
    let bodyParameters = action.bodyParameters;
    if (this.log) {
      console.log("DirCustomerio formid: ", formid);
      console.log("DirCustomerio bodyParameters: ", bodyParameters);
    }

    if (!bodyParameters || bodyParameters === '') {
      if (this.log) { console.error("DirCustomerio ERROR - bodyParameters is undefined or null or empty string") };
      callback();
      return;
    }

    const server_base_url = process.env.API_ENDPOINT || process.env.API_URL;
    const customerio_base_url = process.env.CUSTOMERIO_ENDPOINT || "https://track.customer.io/api/v1";
    if (this.log) {
      console.log("DirCustomerio server_base_url: ", server_base_url);
      console.log("DirCustomerio customerio_base_url: ", customerio_base_url);
    }

    let key = await this.getKeyFromIntegrations(server_base_url);
    if (!key) {
      if (this.log) { console.log("DirCustomerio - Key not found in Integrations."); }
      let status = 422;
      let error = 'Missing customerio access token';
      await this.#assignAttributes(action, status, error);
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, null, falseIntent, null);
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
    if (this.log) { console.log('DirCustomerio bodyParameters filler: ', bodyParameters) }

    let json = {
      data: bodyParameters
    }

    const CUSTOMERIO_HTTPREQUEST = {
      url: customerio_base_url + "/forms/" + formid + "/submit",
      headers: {
        'authorization': 'Basic ' + key,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'User-Agent': 'TiledeskBotRuntime',
        'Accept': '*/*'
      },
      json: json,
      method: "POST"
    }
    if (this.log) { console.log("DirCustomerio CUSTOMERIO_HTTPREQUEST", JSON.stringify(CUSTOMERIO_HTTPREQUEST)); }

    this.#myrequest(
      CUSTOMERIO_HTTPREQUEST, async (err, resbody) => {
        if (err) {
          if (callback) {
            if (this.log) {
              console.error("(httprequest) DirCustomerio err response:", err.response)
              console.error("(httprequest) DirCustomerio err data:", err.response.data)
            };
            let status = null;
            let error;

            if (err.response &&
              err.response.status) {
              status = err.response.status;
            }
            if (err.response &&
              err.response.data &&
              err.response.data.meta && err.response.data.meta.error) {
              error = err.response.data.meta.error;
            }

            if (this.log) {
              console.error("(httprequest) DirCustomerio err data status:", status);
              console.error("(httprequest) DirCustomerio err data error:", error);
            }
            await this.#assignAttributes(action, status, error);
            if (falseIntent) {
              await this.#executeCondition(false, trueIntent, null, falseIntent, null);
              callback(true);
              return;
            }
            callback();
            return;

          }
        } else if (callback) {
          if (this.log) { console.log("DirCustomerio resbody: ", JSON.stringify(resbody, null, 2)); }

          let status = 204;
          let error = null;
          await this.#assignAttributes(action, status, error);
          if (trueIntent) {
            await this.#executeCondition(true, trueIntent, null, falseIntent, null);
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
      console.log("DirCustomerio assignAttributes action:", action)
      console.log("DirCustomerio assignAttributes status:", status)
      console.log("DirCustomerio assignAttributes error:", error)
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
          if (this.log) { console.log("DirCustomerio request parameter:", key, "value:", value, "type:", typeof value) }
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
        if (res && (res.status == 200 || res.status == 204) && (res.data || res.config.data)) {
          if (callback) {
            if (res.data) {
              callback(null, res.data);
            }
            if (res.config.data) {
              callback(null, res.config.data);
            }
          }
        }
        else {
          if (callback) {
            callback(new Error("Response status is not 204"), null);
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
    if (this.log) { console.log('DirCustomerio executeCondition/result', result) }
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
        url: server_base_url + "/" + this.context.projectId + "/integration/name/customerio",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        method: "GET"
      }
      if (this.log) { console.log("Customerio INTEGRATIONS_HTTPREQUEST ", INTEGRATIONS_HTTPREQUEST) }

      this.#myrequest(
        INTEGRATIONS_HTTPREQUEST, async (err, integration) => {
          if (err) {
            resolve(null);
          } else {
            if (this.log) { console.log('Integration: ', integration); }
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

module.exports = { DirCustomerio }