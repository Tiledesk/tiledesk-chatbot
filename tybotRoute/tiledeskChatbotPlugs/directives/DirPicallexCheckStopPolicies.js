const axios = require("axios").default;
const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
let https = require("https");
require('dotenv').config();
const winston = require('../../utils/winston');
const integrationService = require("../../services/IntegrationService");
const { Logger } = require("../../Logger");

const PICALLEX_ENDPOINT = process.env.PICALLEX_ENDPOINT || "https://crm.picallex.com";

class DirPicallexCheckStopPolicies {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory');
    }
    this.context = context;
    this.tdcache = this.context.tdcache;
    this.requestId = this.context.requestId;
    this.projectId = this.context.projectId;
    this.token = this.context.token;

    this.intentDir = new DirIntent(context);
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.intent_id || this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    winston.verbose("Execute PicallexCheckStopPolicies directive");
    let action;
    if (directive.action) {
      action = directive.action;
    } else {
      this.logger.error("Incorrect action for ", directive.name, directive);
      winston.warn("DirPicallexCheckStopPolicies Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[PicallEx CheckStopPolicies] Executed");
      callback(stop);
    });
  }

  async go(action, callback) {
    winston.debug("(DirPicallexCheckStopPolicies) Action: ", action);
    if (!this.tdcache) {
      winston.error("(DirPicallexCheckStopPolicies) Error: tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;
    winston.info("(DirPicallexCheckStopPolicies) trueIntent: " + trueIntent + " falseIntent: " + falseIntent);

    let requestVariables = await TiledeskChatbot.allParametersStatic(this.tdcache, this.requestId);
    const filler = new Filler();

    let apiKey = await integrationService.getKeyFromIntegrations(this.projectId, 'picallex', this.token);
    if (!apiKey) {
      this.logger.error("[PicallEx CheckStopPolicies] API key not found in integrations");
      let errorMsg = "PicallEx API key is not configured";
      await this.#assignAttributes(action, null, errorMsg);
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }

    const leadId = filler.fill("{{attributes.lead.id}}", requestVariables);

    let body = {
      leadId: leadId
    };

    if (action.nextStep) {
      body.nextStep = {};
      if (action.nextStep.timezone) {
        body.nextStep.timezone = filler.fill(action.nextStep.timezone, requestVariables);
      }
      if (action.nextStep.hour) {
        body.nextStep.hour = filler.fill(action.nextStep.hour, requestVariables);
      }
      if (action.nextStep.days !== undefined && action.nextStep.days !== null) {
        body.nextStep.days = action.nextStep.days;
      }
    }

    if (action.stopPolicies && action.stopPolicies.length > 0) {
      body.stopPolicies = action.stopPolicies.map(policy => {
        let filledPolicy = { name: policy.name };
        if (policy.data) {
          filledPolicy.data = {};
          for (const [key, value] of Object.entries(policy.data)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
              filledPolicy.data[key] = {};
              for (const [subKey, subValue] of Object.entries(value)) {
                filledPolicy.data[key][subKey] = filler.fill(subValue, requestVariables);
              }
            } else {
              filledPolicy.data[key] = filler.fill(value, requestVariables);
            }
          }
        }
        return filledPolicy;
      });
    }

    const sfObjectInput = action.salesforceObject;
    if (sfObjectInput && (sfObjectInput.update || sfObjectInput.log)) {
      const sfObject = {};
      if (sfObjectInput.update) {
        sfObject.update = {
          objectType: filler.fill(sfObjectInput.update.objectType, requestVariables),
          params: {}
        };
        if (sfObjectInput.update.params) {
          for (const [key, value] of Object.entries(sfObjectInput.update.params)) {
            sfObject.update.params[key] = filler.fill(value, requestVariables);
          }
        }
      }
      if (sfObjectInput.log) {
        sfObject.log = {
          activityType: sfObjectInput.log.activityType,
          entityType: sfObjectInput.log.entityType,
          subject: filler.fill(sfObjectInput.log.subject, requestVariables),
          description: filler.fill(sfObjectInput.log.description, requestVariables)
        };
      }
      body.salesforce = { object: sfObject };
    }

    winston.debug("(DirPicallexCheckStopPolicies) body: ", body);

    const url = PICALLEX_ENDPOINT + "/v1/api/automations/check-stop-policies";

    const HTTPREQUEST = {
      url: url,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      json: body,
      method: "POST"
    };

    winston.debug("(DirPicallexCheckStopPolicies) HttpRequest: ", HTTPREQUEST);

    this.#myrequest(HTTPREQUEST, async (err, res) => {
      if (err) {
        winston.error("(DirPicallexCheckStopPolicies) err: ", err && err.message);
        let status = res ? res.status : 500;
        let errorMsg = res ? res.error : (err.message || "Unknown error");
        this.logger.error("[PicallEx CheckStopPolicies] API error: ", errorMsg);
        await this.#assignAttributes(action, status, errorMsg);
        winston.info("(DirPicallexCheckStopPolicies) dispatching falseIntent=" + falseIntent);
        if (falseIntent) {
          await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
          callback(true);
          return;
        }
        callback();
        return;
      }

      winston.debug("(DirPicallexCheckStopPolicies) response: ", res && res.status);
      let resultData = res.data ? res.data : null;
      await this.#assignAttributes(action, res.status, null, resultData);

      winston.info("(DirPicallexCheckStopPolicies) dispatching trueIntent=" + trueIntent);
      if (trueIntent) {
        await this.#executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    });
  }

  async #assignAttributes(action, status, error, result) {
    if (this.context.tdcache) {
      if (action.assignStatusTo && status !== undefined && status !== null) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignStatusTo, status);
      }
      if (action.assignErrorTo && error) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignErrorTo, error);
      }
      if (action.assignResultTo && result) {
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, action.assignResultTo, result);
      }
    }
  }

  #myrequest(options, callback) {
    let axios_options = {
      url: options.url,
      method: options.method,
      headers: options.headers,
      timeout: 20000
    };
    if (options.json !== null) {
      axios_options.data = options.json;
    }
    if (options.url.startsWith("https:")) {
      const httpsAgent = new https.Agent({ rejectUnauthorized: false });
      axios_options.httpsAgent = httpsAgent;
    }
    axios(axios_options)
      .then((res) => {
        if (callback) {
          callback(null, res);
        }
      })
      .catch((err) => {
        if (callback) {
          let status = err.response?.status || 500;
          let errorMessage = err.response?.data?.message || err.response?.data?.error || err.message || "Unknown error";
          callback(err, { status: status, data: null, error: errorMessage });
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
        this.intentDir.execute(trueIntentDirective, () => { if (callback) callback(); });
      } else {
        if (callback) callback();
      }
    } else {
      if (falseIntentDirective) {
        this.intentDir.execute(falseIntentDirective, () => { if (callback) callback(); });
      } else {
        if (callback) callback();
      }
    }
  }
}

module.exports = { DirPicallexCheckStopPolicies };
