const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
require('dotenv').config();
const winston = require('../../utils/winston');
const integrationService = require("../../services/IntegrationService");
const { BaseDirective } = require("../BaseDirective");
const http = require("../../utils/http");

const ACCEPTED_STATUS_CODES = [200, 201];

class DirHubspot extends BaseDirective {

  constructor(context) {
    super(context);
    this.intentDir = new DirIntent(context);
  }

  execute(directive, callback) {
    winston.verbose("Execute Hubspot directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirHubspot Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Hubspot] Executed");
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("(DirHubspot) Action: ", action);
    if (!this.tdcache) {
      winston.error("(DirHubspot) Error: tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;

    winston.debug("(DirHubspot) trueIntent " + trueIntent)
    winston.debug("(DirHubspot) falseIntent " + falseIntent)
    winston.debug("(DirHubspot) trueIntentAttributes " + trueIntentAttributes)
    winston.debug("(DirHubspot) falseIntentAttributes " + falseIntentAttributes)

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    //let token = action.token;
    let bodyParameters = action.bodyParameters;
    winston.debug("(DirHubspot) bodyParameters: ", bodyParameters);

    if (!bodyParameters || bodyParameters === '') {
      this.logger.error("[Hubspot] bodyParameters is undefined or null or empty string");
      winston.error("(DirHubspot) Error: bodyParameters is undefined or null or empty string");
      callback();
      return;
    }

    const hubspot_base_url = process.env.HUBSPOT_ENDPOINT || "https://api.hubapi.com/crm/v3/";
    winston.debug("(DirHubspot) hubspot_base_url " + hubspot_base_url);

    let key = await integrationService.getKeyFromIntegrations(this.projectId, 'hubspot', this.token);
    if (!key) {
      this.logger.error("[Hubspot] Key not found in Integrations");
      winston.debug("(DirHubspot) - Key not found in Integrations.");
      if (falseIntent) {
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
    }

    const filler = new Filler();
    for (const [key, value] of Object.entries(bodyParameters)) {
      let filled_value = filler.fill(value, requestVariables);
      bodyParameters[key] = filled_value;
    }
    winston.debug("(DirHubspot) bodyParameters filled: ", bodyParameters);

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
    winston.debug("(DirHubspot) HttpRequest ", HUBSPOT_HTTPREQUEST);

    http.request(
      HUBSPOT_HTTPREQUEST,
      async (err, resbody) => {
        if (err) {
          if (callback) {
            this.logger.error("[Hubspot] Error response: ", err.response);
            winston.error("(DirHubspot)  err response: ", err.response.data)
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

            winston.debug("(DirHubspot) err data result: " + result);
            winston.debug("(DirHubspot) err data status: " + status);
            winston.debug("(DirHubspot) err data error: ", error);

            await this._assignAttributes(action, [
              ['assignStatusTo', status],
              ['assignResultTo', result],
              ['assignErrorTo', error]
            ]);
            if (falseIntent) {
              await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
              callback(true);
              return;
            }
            callback();
            return;
          }
        } else if (callback) {
          winston.debug("(DirHubspot) resbody: ", resbody);

          let status = 201;
          let error = null;
          let result = resbody;
          this.logger.error("[Hubspot] Result: ", result);
          await this._assignAttributes(action, [
            ['assignStatusTo', status],
            ['assignResultTo', result],
            ['assignErrorTo', error]
          ]);
          if (trueIntent) {
            await this._executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes)
            callback(true);
            return;
          }
          callback();
          return;
        }
      },
      { acceptedStatusCodes: ACCEPTED_STATUS_CODES }
    );

  }

}

module.exports = { DirHubspot }