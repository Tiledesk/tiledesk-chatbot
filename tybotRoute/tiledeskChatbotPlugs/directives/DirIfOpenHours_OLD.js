const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { DirIntent } = require('./DirIntent');
const ms = require('minimist-string');
const winston = require('../../utils/winston');

class DirIfOpenHours {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }

    this.context = context;
    this.intentDir = new DirIntent(context);

    this.API_ENDPOINT = context.API_ENDPOINT;
    this.tdClient = new TiledeskClient({
      projectId: this.context.projectId,
      token: this.context.token,
      APIURL: this.API_ENDPOINT,
      APIKEY: "___"
    });
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action
    }
    else if (directive.parameter) {
      let params;
      params = this.parseParams(directive.parameter);
      if (!params.trueIntent && !params.falseIntent) {
        callback();
        return;
      }
      action = {
        trueIntent: params.trueIntent,
        falseIntent: params.falseIntent
      }
    }
    else {
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    });
  }

  go(action, callback) {

    const trueIntent = action.trueIntent;
    const falseIntent = action.falseIntent;
    const trueIntentAttributes = action.trueIntentAttributes;
    const falseIntentAttributes = action.falseIntentAttributes;
    const stopOnConditionMet = action.stopOnConditionMet;

    if (trueIntent && trueIntent.trim() === "") {
      trueIntent = null;
    }
    if (falseIntent && falseIntent.trim() === "") {
      falseIntent = null;
    }
    winston.verbose("(DirIfOpenHours) Action:", action);
    if (!trueIntent && !falseIntent) {
      winston.error("(DirIfOpenHours) Error: missing both action.trueIntent & action.falseIntent");
            callback();
      return;
    }
    this.tdClient.openNow((err, result) => {
      winston.error("(DirIfOpenHours) openNow():", result)
      if (err) {
        console.error("*** DirIfOpenHours Error:", err);
        callback();
      }
      else if (result && result.isopen) {
        if (trueIntent) {
          let intentDirective = DirIntent.intentDirectiveFor(trueIntent);
          winston.debug("(DirIfOpenHours) (openHours) => trueIntent ");
          this.intentDir.execute(intentDirective, () => {
            callback(stopOnConditionMet);
          });
        }
        else {
          callback();
          return;
        }
      }
      else if (falseIntent) {
        let intentDirective = DirIntent.intentDirectiveFor(falseIntent);
        winston.debug("(DirIfOpenHours) (openHours) => falseIntent ");
        this.intentDir.execute(intentDirective, () => {
          callback(stopOnConditionMet);
        });
      }
      else {
        callback();
      }
    });
  }

  parseParams(directive_parameter) {
    let trueIntent = null;
    let falseIntent = null;
    const params = ms(directive_parameter);
    if (params.trueIntent) {
      trueIntent = params.trueIntent;
    }
    if (params.falseIntent) {
      falseIntent = params.falseIntent;
    }
    return {
      trueIntent: trueIntent,
      falseIntent: falseIntent
    }
  }

}

module.exports = { DirIfOpenHours };