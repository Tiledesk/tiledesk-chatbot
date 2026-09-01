const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../../variables/Filler");
const { DirIntent } = require("../flow/DirIntent");
require('dotenv').config();
const winston = require('../../utils/winston');
const integrationService = require("../../services/IntegrationService");
const { BaseDirective } = require("../BaseDirective");
const customerioService = require("../../services/CustomerioService");
const { Directives } = require('../Directives');

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

    const { err, resbody } = await customerioService.submitForm(
      formid, bodyParameters, key, "(DirCustomerio)"
    );

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

  }

}

module.exports = { DirCustomerio }