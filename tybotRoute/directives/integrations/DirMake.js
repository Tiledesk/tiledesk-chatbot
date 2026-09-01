const { TiledeskChatbot } = require("../../engine/TiledeskChatbot");
const { Filler } = require("../../variables/Filler");
const { DirIntent } = require("../flow/DirIntent");
require('dotenv').config();
const winston = require('../../utils/winston');
const { BaseDirective } = require("../BaseDirective");
const makeService = require("../../services/MakeService");
const { Directives } = require('../Directives');

class DirMake extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.MAKE];

  constructor(context) {
    super(context);
    this.intentDir = new DirIntent(context);
  }

  execute(directive, callback) {
    winston.verbose("Execute Make directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirMake Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Make] Executed");
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("(DirMake) Action: ", action);
    if (!this.tdcache) {
      winston.error("(DirMake) Error: tdcache is mandatory");
      callback();
      return;
    }

    let trueIntent = action.trueIntent;
    let falseIntent = action.falseIntent;
    let trueIntentAttributes = action.trueIntentAttributes;
    let falseIntentAttributes = action.falseIntentAttributes;

    // default values?
    let status = null;
    let error = null;

    let requestVariables = null;
    requestVariables =
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      )

    let webhook_url = action.url;
    let bodyParameters = action.bodyParameters;

    winston.debug("(DirMake) webhook_url: " + webhook_url);

    if (!bodyParameters) {
      winston.error("(DirMake) Error: bodyParameters is undefined");
      error = "Missing body parameters";
      await this._assignAttributes(action, [
        ['assignStatusTo', status],
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

    if (!webhook_url || webhook_url === '') {
      winston.error("(DirMake) Error: webhook_url is undefined or null or empty string:")
      let status = 422;   
      let error = 'Missing make webhook url';
      await this._assignAttributes(action, [
        ['assignStatusTo', status],
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

    const filler = new Filler();
    for (const [key, value] of Object.entries(bodyParameters)) {
      let filled_value = filler.fill(value, requestVariables);
      bodyParameters[key] = filled_value;
    }

    // MakeService picks the url: the MAKE_ENDPOINT test override when it is
    // set, the bot author's webhook url otherwise. It also keeps Make's own
    // request contract - no status check, the whole axios response handed
    // back, and a failed request delivered as a synthetic success payload with
    // a null `err`. The `if (err)` branch below is therefore dead code, as it
    // already was before the move.
    const { err, res } = await makeService.trigger(webhook_url, bodyParameters, "(DirMake)");

    if (err) {
      if (callback) {
        winston.error("(DirMake) err: ", err);
        // let status = 404;
        // let error = 'Make url not found';
        status = res.status;
        error = res.error;
        await this._assignAttributes(action, [
          ['assignStatusTo', status],
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
      winston.debug("(DirMake)  resbody ", res);

      status = res.status;
      error = null;
      if (res.error) {
        error = res.error
      }
      await this._assignAttributes(action, [
        ['assignStatusTo', status],
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

module.exports = { DirMake }