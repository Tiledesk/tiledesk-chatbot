const { TiledeskChatbot } = require("../../../engine/TiledeskChatbot");
const { Filler } = require("../../Filler");
const { DirIntent } = require("../flow/DirIntent");
require('dotenv').config();
const winston = require('../../../utils/winston');
const qaplaService = require("../../../services/QaplaService");
const integrationService = require("../../../services/IntegrationService");
const { BaseDirective } = require("../../BaseDirective");
const { Directives } = require('../Directives');

class DirQapla extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.QAPLA];

  constructor(context) {
    super(context);
    this.intentDir = new DirIntent(context);
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirQapla Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Qapla] Executed");
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
      await this._assignAttributes(action, [
        ['assignStatusTo', status],
        ['assignResultTo', result, { onlyIfTruthy: true }],
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

    let key = action.apiKey;

    if (!key) {
      winston.debug("(DirQapla) DirQapla - Key not found into action. Searching in integrations...");
      key = await integrationService.getKeyFromIntegrations(this.projectId, 'qapla', this.token);
    }

    if (!key) {
      winston.debug("(DirQapla) Error: api key is mandatory");
      error = "Invalid or empty ApiKey";
      await this._assignAttributes(action, [
        ['assignStatusTo', status],
        ['assignResultTo', result, { onlyIfTruthy: true }],
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

    const { err, resbody } = await qaplaService.getShipment(key, tracking_number, "(DirQapla)");

    if (err) {
      if (callback) {
        winston.debug("(DirQapla) getShipment err: " + err.message);
        error = "Unable to get shipment";
        await this._assignAttributes(action, [
          ['assignStatusTo', status],
          ['assignResultTo', result, { onlyIfTruthy: true }],
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

      await this._assignAttributes(action, [
        ['assignStatusTo', status],
        ['assignResultTo', result, { onlyIfTruthy: true }],
        ['assignErrorTo', error]
      ]);
      if (trueIntent) {
        await this._executeCondition(true, trueIntent, trueIntentAttributes, falseIntent, falseIntentAttributes);
        callback(true);
        return;
      }
      callback();
      return;
    }
  }

}

module.exports = { DirQapla }