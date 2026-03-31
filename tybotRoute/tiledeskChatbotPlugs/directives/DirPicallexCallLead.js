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

class DirPicallexCallLead {

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
    winston.verbose("Execute PicallexCallLead directive");
    let action;
    if (directive.action) {
      action = directive.action;
    } else {
      this.logger.error("Incorrect action for ", directive.name, directive);
      winston.warn("DirPicallexCallLead Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[PicallEx CallLead] Executed");
      callback(stop);
    });
  }

  async go(action, callback) {
    winston.debug("(DirPicallexCallLead) Action: ", action);
    if (!this.tdcache) {
      winston.error("(DirPicallexCallLead) Error: tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;

    let requestVariables = await TiledeskChatbot.allParametersStatic(this.tdcache, this.requestId);
    const filler = new Filler();

    // Get PicallEx API key from integrations
    let apiKey = await integrationService.getKeyFromIntegrations(this.projectId, 'picallex', this.token);
    if (!apiKey) {
      this.logger.error("[PicallEx CallLead] API key not found in integrations");
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

    // Build request body
    const leadId = filler.fill("{{lead.id}}", requestVariables);

    let body = {
      leadId: leadId,
      agentId: filler.fill(action.agentId, requestVariables),
      fromNumber: filler.fill(action.fromNumber, requestVariables),
      prompt: filler.fill(action.prompt, requestVariables)
    };

    // Optional: context (key-value pairs)
    if (action.context && Object.keys(action.context).length > 0) {
      body.context = {};
      for (const [key, value] of Object.entries(action.context)) {
        body.context[key] = filler.fill(value, requestVariables);
      }
    }

    // Optional: salesforce fields
    if (action.salesforce && action.salesforce.length > 0) {
      body.salesforce = action.salesforce.map(sf => ({
        object: filler.fill(sf.object, requestVariables),
        field: filler.fill(sf.field, requestVariables),
        name: filler.fill(sf.name, requestVariables)
      }));
    }

    // Optional: nextStep
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

    // Optional: stopPolicies
    if (action.stopPolicies && action.stopPolicies.length > 0) {
      body.stopPolicies = action.stopPolicies.map(policy => {
        let filledPolicy = { name: policy.name };
        if (policy.data) {
          filledPolicy.data = {};
          for (const [key, value] of Object.entries(policy.data)) {
            filledPolicy.data[key] = filler.fill(value, requestVariables);
          }
        }
        return filledPolicy;
      });
    }

    winston.debug("(DirPicallexCallLead) body: ", body);

    const url = PICALLEX_ENDPOINT + "/v1/api/automations/calls/callLeadViaVoicebot";

    const HTTPREQUEST = {
      url: url,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      json: body,
      method: "POST"
    };

    winston.debug("(DirPicallexCallLead) HttpRequest: ", HTTPREQUEST);

    this.#myrequest(HTTPREQUEST, async (err, res) => {
      if (err) {
        winston.error("(DirPicallexCallLead) err: ", err);
        let status = res ? res.status : 500;
        let errorMsg = res ? res.error : (err.message || "Unknown error");
        this.logger.error("[PicallEx CallLead] API error: ", errorMsg);
        await this.#assignAttributes(action, status, errorMsg);
        if (falseIntent) {
          await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
          callback(true);
          return;
        }
        callback();
        return;
      }

      winston.debug("(DirPicallexCallLead) response: ", res);
      let resultData = res.data ? JSON.stringify(res.data) : "";
      await this.#assignAttributes(action, res.status, null, resultData);

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

module.exports = { DirPicallexCallLead };
