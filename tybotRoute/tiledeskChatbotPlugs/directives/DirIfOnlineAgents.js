// const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { DirIntent } = require('./DirIntent');
const ms = require('minimist-string');

class DirIfOnlineAgents {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.tdclient = context.tdclient;
    // this.tdclient = new TiledeskClient({
    //   projectId: context.projectId,
    //   token: context.token,
    //   APIURL: context.TILEDESK_APIURL,
    //   APIKEY: "___",
    //   log: context.log
    // });
    // let context =  {
    //   projectId: projectId,
    //   token: token,
    //   requestId: supportRequest,
    //   APIURL: API_URL,
    //   TILEBOT_ENDPOINT:TILEBOT_ENDPOINT,
    //   departmentId: depId,
    //   log: false
    // }
    this.intentDir = new DirIntent(context);
    //   {
    //     API_ENDPOINT: context.TILEDESK_APIURL,
    //     TILEBOT_ENDPOINT: context.TILEBOT_ENDPOINT,
    //     supportRequest: context.supportRequest,
    //     token: context.token,
    //     log: context.log
    //   }
    // );
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
    this.go(action, () => {
      callback();
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
    this.tdclient.openNow((err, result) => {
      if (this.log) {console.log("openNow():", result);}
      if (err) {
        console.error("tdclient.openNow Error:", err);
        callback();
        return;
      }
      else {
        if (result && result.isopen) {
          this.tdclient.getProjectAvailableAgents((err, agents) => {
            if (this.log) {console.log("Agents", agents);}
            if (err) {
              console.error("Error getting available agents:", err);
              callback();
            }
            else {
              if (this.log) {console.log("Agents count:", agents.length);}
              if (agents.length > 0) {
                if (trueIntent) {
                  let intentDirective = DirIntent.intentDirectiveFor(trueIntent);
                  if (this.log) {console.log("agents (openHours) => trueIntent");}
                  this.intentDir.execute(intentDirective, () => {
                    callback();
                  });
                }
                else {
                  callback();
                  return;
                }
              }
              else if (falseIntent) {
                let intentDirective = DirIntent.intentDirectiveFor(falseIntent);
                if (this.log) {console.log("!agents (openHours) => falseIntent", falseIntent);}
                this.intentDir.execute(intentDirective, () => {
                  callback();
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
            let intentDirective = DirIntent.intentDirectiveFor(falseIntent);
            if (this.log) {console.log("!agents (!openHours) => falseIntent");}
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
          callback();
        }
      }
    });
  }

  // intentDirectiveFor(intent) {
  //   let intentDirective = {
  //     action: {
  //       body: {
  //         intentName: intent
  //       }
  //     }
  //   }
  //   return intentDirective;
  // }

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