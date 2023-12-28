const axios = require("axios").default;
const { TiledeskChatbot } = require("../../models/TiledeskChatbot");
const { Filler } = require("../Filler");
let https = require("https");
const { DirIntent } = require("./DirIntent");
require('dotenv').config();

class DirQapla {

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
    if (this.log) { console.log("DirQapla directive: ", directive); }
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      console.error("DirQapla Incorrect directive: ", JSON.stringify(directive));
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    })
  }

  async go(action, callback) {
    if (this.log) { console.log("DirQapla action:", JSON.stringify(action)); }
    if (!this.tdcache) {
      console.error("Error: DirQapla tdcache is mandatory");
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

    // let default values??
    let status = null;
    let result = null;
    let error;

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    const filler = new Filler();
    const tracking_number = filler.fill(action.trackingNumber, requestVariables);
    if (this.log) { console.log("DirQapla tracking number: ", tracking_number); }

    if (!tracking_number || tracking_number === '') {
      console.error("Error: DirQapla tracking number is undefined or null or empty string");
      error = "Tracking number is not defined";
      await this.#assignAttributes(action, status, result, error);
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

    const server_base_url = process.env.API_ENDPOINT || process.env.API_URL;
    const qapla_base_url = process.env.QAPLA_ENDPOINT || "https://api.qapla.it/1.2"
    if (this.log) { 
      console.log("DirQapla server_base_url: ", qapla_base_url); 
      console.log("DirQapla qapla_base_url: ", qapla_base_url); 
    }

    let key = action.apiKey;

    if (!key) {
      if (this.log) { console.log("DirQapla - Key not found into action. Searching in integrations..."); }
      key = await this.getKeyFromIntegrations(server_base_url);
    }

    if (!key) {
      console.error("Error: DirQapla api key is mandatory");
      error = "Invalid or empty ApiKey";
      await this.#assignAttributes(action, status, result, error);
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

    const QAPLA_HTTPREQUEST = {
      url: qapla_base_url + "/getShipment/",
      headers: {
        'Content-Type': 'application/json'
      },
      params: {
        apiKey: key,
        trackingNumber: tracking_number
      },
      method: "GET"
    }
    if (this.log) { console.log("DirQapla QAPLA_HTTPREQUEST", QAPLA_HTTPREQUEST); }

    this.#myrequest(
      QAPLA_HTTPREQUEST, async (err, resbody) => {
        if (err) {
          if (callback) {
            console.error("(httprequest) DirQapla getShipment err:", err);
            error = "Unable to get shipment";
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
          if (this.log) { console.log("DirQapla getShipment resbody: ", JSON.stringify(resbody, null, 2)); }

          if (resbody.getShipment &&
            resbody.getShipment.shipments &&
            resbody.getShipment.shipments[0] &&
            resbody.getShipment.shipments[0].status &&
            resbody.getShipment.shipments[0].status.qaplaStatus &&
            resbody.getShipment.shipments[0].status.qaplaStatus.status) {
            status = resbody.getShipment.shipments[0].status.qaplaStatus.status;
          }
          // status = resbody.getShipment?.shipments[0]?.status?.qaplaStatus?.status; // doesn't works
          
          if (resbody.getShipment && 
              resbody.getShipment.result)
          result = resbody.getShipment?.result;
          error = resbody.getShipment?.error;

          await this.#assignAttributes(action, status, result, error);
          if (trueIntent) {
            await this.#executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
            callback(true);
            return;
          }
          callback();
          return;
        }
      }
    )
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
        })
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

  async #assignAttributes(action, status, result, error) {
    if (this.log) {
      console.log("DirQapla assignAttributes action:", action)
      console.log("DirQapla assignAttributes status:", status)
      console.log("DirQapla assignAttributes result:", result)
      console.log("DirQapla assignAttributes error:", error)
    }
    if (this.context.tdcache) {
      if (action.assignStatusTo) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignStatusTo, status);
      }
      if (action.assignResultTo && result) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignResultTo, result);
      }
      if (action.assignErrorTo) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignErrorTo, error);
      }

      // Debug log
      if (this.log) {
        const all_parameters = await TiledeskChatbot.allParametersStatic(this.context.tdcache, this.context.requestId);
        for (const [key, value] of Object.entries(all_parameters)) {
          if (this.log) { console.log("DirQapla request parameter:", key, "value:", value, "type:", typeof value) }
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

  async getKeyFromIntegrations(server_base_url) {
    return new Promise((resolve) => {

      const INTEGRATIONS_HTTPREQUEST = {
        url: server_base_url + "/" + this.context.projectId + "/integration/name/openai",
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

module.exports = { DirQapla }