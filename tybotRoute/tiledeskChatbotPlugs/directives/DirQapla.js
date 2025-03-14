const axios = require("axios").default;
const { TiledeskChatbot } = require("../../models/TiledeskChatbot");
const { Filler } = require("../Filler");
let https = require("https");
const { DirIntent } = require("./DirIntent");
require('dotenv').config();
const winston = require('../../utils/winston');

class DirQapla {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.intentDir = new DirIntent(context);
    this.API_ENDPOINT = this.context.API_ENDPOINT;
    this.log = context.log;
  }

  execute(directive, callback) {
    winston.verbose("Execute Qapla directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.warn("DirQapla Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("(DirQapla) Action: ", action);
    if (!this.tdcache) {
      winston.error("(DirQapla) Error: tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;

    winston.debug("(DirQapla) trueIntent " + trueIntent)
    winston.debug("(DirQapla)  falseIntent " + falseIntent)
    winston.debug("(DirQapla) trueIntentAttributes " + trueIntentAttributes)
    winston.debug("(DirQapla) falseIntentAttributes " + falseIntentAttributes)

    // Set default values
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

    if (!tracking_number || tracking_number === '') {
      winston.debug("(DirQapla) Error: tracking number is undefined or null or empty string");
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

    const qapla_base_url = process.env.QAPLA_ENDPOINT || "https://api.qapla.it/1.2"
    winston.debug("(DirQapla) DirQapla qapla_base_url: " + qapla_base_url);

    let key = action.apiKey;

    if (!key) {
      winston.debug("(DirQapla) DirQapla - Key not found into action. Searching in integrations...");
      key = await this.getKeyFromIntegrations();
    }

    if (!key) {
      winston.debug("(DirQapla) Error: api key is mandatory");
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
    winston.debug("(DirQapla) HttpRequest ", QAPLA_HTTPREQUEST);

    this.#myrequest(
      QAPLA_HTTPREQUEST, async (err, resbody) => {
        if (err) {
          if (callback) {
            winston.debug("(DirQapla) getShipment err: " + err.message);
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
          winston.debug("(DirQapla)  getShipment resbody: ", resbody);

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
        winston.debug("(DirQapla) No trueIntentDirective specified");
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
        winston.debug("(DirQapla)No falseIntentDirective specified");
        if (callback) {
          callback();
        }
      }
    }
  }

  async #assignAttributes(action, status, result, error) {
   
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
    }
  }

  #myrequest(options, callback) {
    let axios_options = {
      url: options.url,
      method: options.method,
      params: options.params,
      headers: options.headers
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
        winston.error("(DirQapla) Axios error: ", error.response.data);
        if (callback) {
          callback(error, null);
        }
      });
  }

  async getKeyFromIntegrations() {
    return new Promise((resolve) => {

      const INTEGRATIONS_HTTPREQUEST = {
        url: this.API_ENDPOINT + "/" + this.context.projectId + "/integration/name/qapla",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'JWT ' + this.context.token
        },
        method: "GET"
      }
      winston.debug("(DirQapla) Integrations HttpRequest ", INTEGRATIONS_HTTPREQUEST)

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