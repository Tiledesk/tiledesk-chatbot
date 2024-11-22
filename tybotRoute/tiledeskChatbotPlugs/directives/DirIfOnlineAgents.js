// const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { DirIntent } = require('./DirIntent');
const ms = require('minimist-string');

class DirIfOnlineAgents {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.tdclient = context.tdclient;
    this.intentDir = new DirIntent(context);
    this.log = context.log;
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action
    }
    else if (directive.parameter) {
      let params;
      params = this.parseParams(directive.parameter);
      // if (!params.trueIntent && !params.falseIntent) {
      //   if (this.log) {
      //     console.log("missing both params.trueIntent & params.falseIntent");
      //   }
      //   callback();
      //   return;
      // }
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
    if (!action.trueIntent && !action.falseIntent) {
      if (this.log) {
        console.log("Error DirIfOnlineAgents: missing both action.trueIntent & action.falseIntent");
      }
      callback();
      return;
    }
    const trueIntent = action.trueIntent;
    const falseIntent = action.falseIntent;
    if (this.log) {
      console.log("(DirIfOnlineAgents) IfOnlineAgents:trueIntent:", trueIntent);
      console.log("(DirIfOnlineAgents) IfOnlineAgents:falseIntent:", falseIntent);
    }
    const trueIntentAttributes = action.trueIntentAttributes;
    const falseIntentAttributes = action.falseIntentAttributes;
    let stopOnConditionMet = action.stopOnConditionMet;
    this.tdclient.openNow((err, result) => {
      if (this.log) {console.log("openNow():", result);}
      if (err) {
        console.error("IfOnlineAgents:tdclient.openNow Error:", err);
        callback();
        return;
      }
      else {
        if (result && result.isopen) {
          this.tdclient.getProjectAvailableAgents((err, agents) => {
            if (this.log) {console.log("Agents", agents);}
            if (err) {
              console.error("IfOnlineAgents:Error getting available agents:", err);
              callback();
            }
            else {
              if (this.log) {console.log("Agents count:", agents.length);}
              if (agents.length > 0) {
                if (trueIntent) {
                  let intentDirective = DirIntent.intentDirectiveFor(trueIntent, trueIntentAttributes);
                  if (this.log) {console.log("agents (openHours) => trueIntent");}
                  this.intentDir.execute(intentDirective, () => {
                    callback(stopOnConditionMet);
                  });
                }
                else {
                  console.log("NO IfOnlineAgents trueIntent defined. callback()") // prod
                  callback();
                  return;
                }
              }
              else if (falseIntent) {
                let intentDirective = DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes);
                if (this.log) {console.log("!agents (openHours) => falseIntent", intentDirective);}
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
            if (this.log) {console.log("!agents (!openHours) => falseIntent");}
            console.log("!agents (!openHours) => falseIntent BECAUSE CLOSED"); //PROD
            this.intentDir.execute(intentDirective, () => {
              callback();
            });
          }
          else {
            callback();
          }
        }
        else {
          if (this.log) {console.log("undeterminate result.");}
          console.log("undeterminate result.");
          callback();
        }
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

module.exports = { DirIfOnlineAgents };