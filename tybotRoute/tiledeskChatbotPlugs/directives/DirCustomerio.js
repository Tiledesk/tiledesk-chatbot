const axios = require("axios").default;
const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
let https = require("https");
require('dotenv').config();
const winston = require('../../utils/winston');
const integrationService = require("../../services/IntegrationService");
const { Logger } = require("../../Logger");

class DirCustomerio {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.projectId = this.context.projectId;
    this.token = this.context.token;
    this.API_ENDPOINT = this.context.API_ENDPOINT;
    
    this.intentDir = new DirIntent(context);
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    winston.verbose("Execute Customerio directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirCustomerio Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Customer.io] Executed");
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("(DirCustomerio) Action: ", action);
    if (!this.tdcache) {
      winston.error("(DirCustomerio) Error: tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;

    winston.debug("(DirCustomerio) trueIntent " + trueIntent)
    winston.debug("(DirCustomerio) falseIntent " + falseIntent)

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    let formid = action.formid;
    let bodyParameters = action.bodyParameters;

    winston.debug("(DirCustomerio) formid: " + formid);
    winston.debug("(DirCustomerio) bodyParameters: ", bodyParameters);

    if (!bodyParameters || bodyParameters === '') {
      this.logger.error("[Customer.io] bodyParameters is undefined or null or empty string");
      winston.debug("(DirCustomerio) Error: bodyParameters is undefined or null or empty string");
      callback();
      return;
    }

    const customerio_base_url = process.env.CUSTOMERIO_ENDPOINT || "https://track.customer.io/api/v1";
    winston.debug("(DirCustomerio) customerio_base_url: " + customerio_base_url); 

    let key = await integrationService.getKeyFromIntegrations(this.projectId, 'customerio', this.token);
    if (!key) {
      this.logger.error("[Customer.io] Key not found in Integrations");
      winston.debug("(DirCustomerio) - Key not found in Integrations.");
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
      winston.debug("(DirCustomerio) bodyParam: " + key + " value: " + value) 
      let filled_value = filler.fill(value, requestVariables);
      bodyParameters[key] = filled_value;
    }
    winston.debug("(DirCustomerio)  bodyParameters filler: ", bodyParameters)

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
    winston.debug("(DirCustomerio) HttpRequest: ", CUSTOMERIO_HTTPREQUEST); 

    this.#myrequest(
      CUSTOMERIO_HTTPREQUEST, async (err, resbody) => {
        if (err) {
          if (callback) {
            this.logger.error("[Customer.io] Error response: ", err.response);
            winston.debug("(DirCustomerio) err response:", err.response)
            winston.debug("(DirCustomerio) err data:", err.response.data)

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

            winston.debug("(DirCustomerio) err data status: " + status);
            winston.debug("(DirCustomerio) err data error: ", error);

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
          winston.debug("(DirCustomerio) DirCustomerio resbody: ", resbody); 

          let status = 204;
          let error = null;
          this.logger.error("[Customer.io] Response status: ", status);
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
    winston.debug("(DirCustomerio)  assignAttributes action: ", action)
    winston.debug("(DirCustomerio)  assignAttributes status: " + status)
    winston.debug("(DirCustomerio)  assignAttributes error: ", error)
    if (this.context.tdcache) {
      if (action.assignStatusTo) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignStatusTo, status);
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
    if (result === true) {
      if (trueIntentDirective) {
        this.intentDir.execute(trueIntentDirective, () => {
          if (callback) {
            callback();
          }
        });
      }
      else {
        winston.debug("(DirCustomerio) No trueIntentDirective specified");
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
        winston.debug("(DirCustomerio) No falseIntentDirective specified"); 
        if (callback) {
          callback();
        }
      }
    }
  }
}

module.exports = { DirCustomerio }