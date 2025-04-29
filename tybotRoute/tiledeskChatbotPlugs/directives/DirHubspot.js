const axios = require("axios").default;
const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
let https = require("https");
require('dotenv').config();
const winston = require('../../utils/winston');
const integrationService = require("../../services/IntegrationService");

class DirHubspot {

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
    this.API_ENDPOINT = this.context.API_ENDPOINT;
  }

  execute(directive, callback) {
    winston.verbose("Execute Hubspot directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      winston.warn("DirHubspot Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
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
      winston.error("(DirHubspot) Error: bodyParameters is undefined or null or empty string");
      callback();
      return;
    }

    const hubspot_base_url = process.env.HUBSPOT_ENDPOINT || "https://api.hubapi.com/crm/v3/";
    winston.debug("(DirHubspot) hubspot_base_url " + hubspot_base_url);

    let key = await integrationService.getKeyFromIntegrations(this.projectId, 'hubspot', this.token);
    if (!key) {
      winston.debug("(DirHubspot)  - Key not found in Integrations.");
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
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

    this.#myrequest(
      HUBSPOT_HTTPREQUEST, async (err, resbody) => {
        if (err) {
          if (callback) {
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
          winston.debug("(DirHubspot) resbody: ", resbody);

          let status = 201;
          let error = null;
          let result = resbody;
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
    winston.debug("(DirHubspot) assignAttributes action: ", action)
    winston.debug("(DirHubspot) assignAttributes status: " + status)
    winston.debug("(DirHubspot) assignAttributes result: ", result)
    winston.debug("(DirHubspot) assignAttributes error: ", error)
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
    if (result === true) {
      if (trueIntentDirective) {
        this.intentDir.execute(trueIntentDirective, () => {
          if (callback) {
            callback();
          }
        });
      }
      else {
        winston.debug("(DirHubspot) No trueIntentDirective specified"); 
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
        winston.debug("(DirHubspot) No falseIntentDirective specified"); 
        if (callback) {
          callback();
        }
      }
    }
  }
}

module.exports = { DirHubspot }