const axios = require("axios").default;
const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../Filler");
const { DirIntent } = require("./DirIntent");
let https = require("https");
require('dotenv').config();
const winston = require('../../utils/winston');
const integrationService = require("../../services/IntegrationService");
const { Logger } = require("../../Logger");

class DirBrevo {

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
    this.logger.info("[Brevo] Executing action");
    winston.verbose("Execute DirBrevo directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("(DirBrevo) Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.info("[Brevo] Action completed");
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("(DirBrevo) Action: ", action);
    if (!this.tdcache) {
      winston.error("(DirBrevo) Error: tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;

    winston.debug("(DirBrevo) trueIntent " + trueIntent)
    winston.debug("(DirBrevo) falseIntent " + falseIntent)
    winston.debug("(DirBrevo) trueIntentAttributes " + trueIntentAttributes)
    winston.debug("(DirBrevo) falseIntentAttributes " + falseIntentAttributes)


    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    //let token = action.token;
    let bodyParameters = action.bodyParameters;
    winston.debug("(DirBrevo)  bodyParameters: ", bodyParameters);

    if (!bodyParameters || bodyParameters === '') {
      this.logger.error("[Brevo] bodyParameters is undefined or null or empty string");
      winston.error("(DirBrevo) Error: bodyParameters is undefined or null or empty string");
      callback();
      return;
    }

    const brevo_base_url = process.env.BREVO_ENDPOINT || "https://api.brevo.com/v3"
    winston.debug("(DirBrevo) brevo_base_url: " + brevo_base_url);

    let key = await integrationService.getKeyFromIntegrations(this.projectId, 'Brevo', this.token);
    winston.debug("(DirBrevo) key: ", key)
    if (!key) {
      this.logger.error("[Brevo] Key not found in Integrations");
      winston.debug("(DirBrevo)  - Key not found in Integrations.");
      if (falseIntent) {
        await this.#executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
    }

    const filler = new Filler();
    for (const [key, value] of Object.entries(bodyParameters)) {
      winston.debug("(DirBrevo) bodyParam: " + key + " value: " + value)
      let filled_value = filler.fill(value, requestVariables);
      bodyParameters[key] = filled_value;
    }
    winston.debug("(DirBrevo) bodyParameters filler: ", bodyParameters)

    // CREATE THE JSON FOR BREVO
    let brevo_email = '';
    let brevo_bodyParameters = {};
    for (const [key, value] of Object.entries(bodyParameters)) {
      winston.debug("(DirBrevo) bodyParam: " + key + " value: " + value)
      if (key === 'email') {brevo_email = value}
      else { brevo_bodyParameters[key] = value;}
    }
    winston.debug("(DirBrevo)  brevo_email: " + brevo_email) 
    winston.debug("(DirBrevo)  brevo_bodyParameters: ", brevo_bodyParameters)


    let json = {
      email: brevo_email,
      attributes: brevo_bodyParameters,
      "emailBlacklisted": false,
			"smsBlacklisted": false,
			"listIds": [
					  0
			],
			"updateEnabled": false,
			"smtpBlacklistSender": [
					"info@mytest.com"
			]
    }

    winston.debug("(DirBrevo)  brevo_base_url: " + brevo_base_url);
    winston.debug("(DirBrevo)  json: ", json);
    const BREVO_HTTPREQUEST = {
      url: brevo_base_url + '/contacts',
      headers: {
        'api-key': key,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      json: json,
      method: "POST"
    }
    winston.debug("(DirBrevo) HttpRequest ", BREVO_HTTPREQUEST);

    this.#myrequest(
      BREVO_HTTPREQUEST, async (err, resbody) => {
        if (err) {
          if (callback) {
            this.logger.error("[Brevo] Error response: ", err.response);
            winston.debug("(DirBrevo) err response: ", err.response)
            winston.debug("(DirBrevo)  err data:", err.response.data)

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
          winston.debug("(DirBrevo) resbody: ", resbody);

          let status = 201;
          let error = null;
          let result = JSON.stringify(resbody, null, 2).slice(2, -1);
          this.logger.error("[Brevo] Result: ", result);
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
    winston.debug("(DirBrevo) assignAttributes action: ", action)
    winston.debug("(DirBrevo) assignAttributes status: " + status)
    winston.debug("(DirBrevo) assignAttributes result: ", result)
    winston.debug("(DirBrevo) assignAttributes error: ", error)
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
        winston.debug("(DirBrevo) No trueIntentDirective specified");
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
        winston.debug("(DirBrevo) No falseIntentDirective specified"); 
        if (callback) {
          callback();
        }
      }
    }
  }
}

module.exports = { DirBrevo }