const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { DirIntent } = require('./DirIntent');
const winston = require('../../utils/winston');

class DirIfOnlineAgents {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }

    this.context = context;
    this.API_ENDPOINT = context.API_ENDPOINT;
    this.log = context.log;
    
    this.intentDir = new DirIntent(context);
    this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___", log: this.log });
  }

  execute(directive, callback) {
    winston.verbose("Execute IfOnlineAgents directive");
    let action;
    if (directive.action) {
      action = directive.action
    }
    else {
      winston.warn("DirIfOnlineAgents Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    });
  }

  go(action, callback) {
    winston.debug("(DirIfOnlineAgents) Action: ", action);

    if (!action.trueIntent && !action.falseIntent) {
      winston.error("(DirIfOnlineAgents) Error: missing both action.trueIntent & action.falseIntent");
      callback();
      return;
    }
    const trueIntent = action.trueIntent;
    const falseIntent = action.falseIntent;
    const trueIntentAttributes = action.trueIntentAttributes;
    const falseIntentAttributes = action.falseIntentAttributes;

    winston.debug("(DirIfOnlineAgents) IfOnlineAgents:trueIntent: " + trueIntent);
    winston.debug("(DirIfOnlineAgents) IfOnlineAgents:falseIntent: " + falseIntent);

    let stopOnConditionMet = action.stopOnConditionMet;
    this.tdClient.openNow((err, result) => {
      winston.debug("(DirIfOnlineAgents) openNow(): ", result);
      if (err) {
        winston.error("(DirIfOnlineAgents) openNow Error: ", err);
        callback();
        return;
      }
      else {
        if (result && result.isopen) {
          this.tdClient.getProjectAvailableAgents((err, agents) => {
            if (err) {
              winston.error("(DirIfOnlineAgents) Error getting available agents: ", err);
              callback();
            }
            else {
              winston.debug("(DirIfOnlineAgents) Agents count: " + agents.length);
              if (agents.length > 0) {
                if (trueIntent) {
                  let intentDirective = DirIntent.intentDirectiveFor(trueIntent, trueIntentAttributes);
                  winston.debug("(DirIfOnlineAgents) agents (openHours) => trueIntent");
                  this.intentDir.execute(intentDirective, () => {
                    callback(stopOnConditionMet);
                  });
                }
                else {
                  winston.debug("(DirIfOnlineAgents) NO IfOnlineAgents trueIntent defined. callback()") // prod
                  callback();
                  return;
                }
              }
              else if (falseIntent) {
                let intentDirective = DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes);
                winston.debug("(DirIfOnlineAgents) !agents (openHours) => falseIntent: ", intentDirective);
                this.intentDir.execute(intentDirective, () => {
                  callback(stopOnConditionMet);
                });
              }
              else {
                callback();
              }
            }
          });
        }
        else if (result && !result.isopen) {
          if (falseIntent) {
            let intentDirective = DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes);
            winston.debug("(DirIfOnlineAgents) !agents (!openHours) => falseIntent BECAUSE CLOSED"); //PROD
            this.intentDir.execute(intentDirective, () => {
              callback();
            });
          }
          else {
            callback();
          }
        }
        else {
          winston.verbose("(DirIfOnlineAgents) undeterminate result.");
          callback();
        }
      }
    });
  }

}

module.exports = { DirIfOnlineAgents };