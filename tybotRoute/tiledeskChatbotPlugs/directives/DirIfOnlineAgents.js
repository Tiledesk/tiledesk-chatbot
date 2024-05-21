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
    this.tdclient.openNow(async (err, result) => {
      if (this.log) {console.log("openNow():", result);}
      if (err) {
        console.error("IfOnlineAgents:tdclient.openNow Error:", err);
        callback();
        return;
      }
      else {
        if (result && result.isopen) {
          let checkCurrentDepartment = action.checkCurrentDepartment;
          let selectedDepartment = action.selectedDepartmentId;
          if (checkCurrentDepartment) {
            const depId = this.context.departmentId;
            const agents = await this.getDepartmentAvailableAgents(depId);
            // check
          }
          else if (selectedDepartment) {
            const agents = await this.getDepartmentAvailableAgents(selectedDepartment);
            // check
          }
          else {
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

  async getDepartmentAvailableAgents(depId) {
    return new Promise( (resolve, reject) => {
      this.tdclient.getDepartment(depId, async (error, dep) => {
        if (error) {
          console.error("(DirIfOnlineAgents) Error:", error);
        }
        else {
          const groupId = dep.groupId;
          try {
            if (groupId) {
              const group = await this.getGroup(groupId);
              const agents = await this.getGroupAvailableAgents(group.members);
              resolve(agents);
            }
            else { // go project-wide
              this.tdclient.getProjectAvailableAgents((err, agents) => {
                if (this.log) {console.log("Agents", agents);}
                if (err) {
                  console.error("IfOnlineAgents:Error getting available agents:", err);
                  reject(error);
                }
                else {
                  if (this.log) {console.log("Agents count:", agents.length);}
                  resolve(agents);
                }
              });
            }
          }
          catch(error) {
            console.error("(DirIfOnlineAgents) Error:", error);
            reject(error);
          }
        }
      });
    });
  }

  async getGroup(groupId, callback) {
    return new Promise ( (resolve, reject) => {
      const URL = `${this.APIURL}/${this.projectId}/groups/${groupId}`
      const HTTPREQUEST = {
        url: URL,
        headers: {
          'Content-Type' : 'application/json',
          'Authorization': this.context.token
        },
        method: 'GET',
        httpsOptions: this.httpsOptions
      };
      TiledeskClient.myrequest(
        HTTPREQUEST,
        function(err, resbody) {
          if (err) {
            reject(err);
            if (callback) {
              callback(err);
            }
          }
          else {
            resolve(resbody);
            if (callback) {
              callback(null, resbody);
            }
          }
        }, this.log
      );
    });
  }

  async getGroup(groupId, callback) {
    return new Promise ( (resolve, reject) => {
      const URL = `${this.APIURL}/${this.projectId}/groups/${groupId}`
      const HTTPREQUEST = {
        url: URL,
        headers: {
          'Content-Type' : 'application/json',
          'Authorization': this.context.token
        },
        method: 'GET',
        httpsOptions: this.httpsOptions
      };
      TiledeskClient.myrequest(
        HTTPREQUEST,
        function(err, resbody) {
          if (err) {
            reject(err);
            if (callback) {
              callback(err);
            }
          }
          else {
            resolve(resbody);
            if (callback) {
              callback(null, resbody);
            }
          }
        }, this.log
      );
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