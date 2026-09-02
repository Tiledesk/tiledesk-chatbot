const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../../variables/Filler");
const { DirIntent } = require("../flow/DirIntent");
require('dotenv').config();
const winston = require('../../utils/winston');
const integrationService = require("../../services/IntegrationService");
const { BaseDirective } = require("../BaseDirective");
const brevoService = require("../../services/BrevoService");
const { Directives } = require('../Directives');

class DirBrevo extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.BREVO];

  constructor(context) {
    super(context);
    this.intentDir = new DirIntent(context);
  }

  execute(directive, callback) {
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
      this.logger.native("[Brevo] Executed");
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

    let key = await integrationService.getKeyFromIntegrations(this.projectId, 'Brevo', this.token);
    winston.debug("(DirBrevo) key: ", key)
    if (!key) {
      this.logger.error("[Brevo] Key not found in Integrations");
      winston.debug("(DirBrevo)  - Key not found in Integrations.");
      if (falseIntent) {
        await this._executeCondition(false, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      // Without a false connector this fell through and POSTed the contact
      // anyway with `api-key: undefined`. A missing integration is not a
      // reason to call Brevo: stop here and carry the flow on, the way every
      // other no-connector exit in this directive does.
      callback();
      return;
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


    const { err, resbody } = await brevoService.createContact(
      brevo_email, brevo_bodyParameters, key, "(DirBrevo)"
    );

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
      winston.debug("(DirBrevo) resbody: ", resbody);

      let status = 201;
      let error = null;
      let result = JSON.stringify(resbody, null, 2).slice(2, -1);
      this.logger.error("[Brevo] Result: ", result);
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

  }

}

module.exports = { DirBrevo }