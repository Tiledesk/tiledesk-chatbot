const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
require('dotenv').config();
const winston = require('../../utils/winston');
const integrationService = require("../../services/IntegrationService");
const { BaseDirective } = require("../BaseDirective");
const http = require("../../utils/http");
const { Directives } = require('./Directives');

// Customer.io answers a successful form submit with 204 and an empty body, so
// the *request* body is handed back to the callback in that case.
const REQUEST_CONFIG = {
  acceptedStatusCodes: [200, 204],
  fallbackToRequestData: true,
  statusErrorMessage: "Response status is not 204"
};

class DirCustomerio extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.CUSTOMERIO];

  constructor(context) {
    super(context);
    this.intentDir = new DirIntent(context);
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
      await this._assignAttributes(action, [
        ['assignStatusTo', status],
        ['assignErrorTo', error]
      ]);
      if (falseIntent) {
        await this._executeCondition(false, trueIntent, null, falseIntent, null);
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

    http.request(
      CUSTOMERIO_HTTPREQUEST,
      async (err, resbody) => {
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

            await this._assignAttributes(action, [
              ['assignStatusTo', status],
              ['assignErrorTo', error]
            ]);
            if (falseIntent) {
              await this._executeCondition(false, trueIntent, null, falseIntent, null);
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
          await this._assignAttributes(action, [
            ['assignStatusTo', status],
            ['assignErrorTo', error]
          ]);
          if (trueIntent) {
            await this._executeCondition(true, trueIntent, null, falseIntent, null);
            callback(true);
            return;
          }
          callback();
          return;
        }
      },
      REQUEST_CONFIG
    );

  }

}

module.exports = { DirCustomerio }