// const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { DirIntent } = require('./DirIntent');
const ms = require('minimist-string');

class DirIfOnlineAgents {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.chatbot = context.chatbot;
    this.tdclient = context.tdclient;
    this.intentDir = new DirIntent(context);
    this.log = context.log;
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action
    }
    else {
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    });
  }

  async go(action, callback) {
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
    let stopOnConditionMet = true; //action.stopOnConditionMet;

    try {
      const result = await this.openNow();
      if (result && result.isopen) {
        let checkCurrentDepartment = action.checkCurrentDepartment;
        let checkSelectedDepartment = action.checkSelectedDepartment;
        let selectedDepartment = action.selectedDepartmentId;
        let agents;

        if (checkCurrentDepartment || checkSelectedDepartment) {
          const depId = checkCurrentDepartment ? this.context.departmentId : selectedDepartment;
          agents = await this.getDepartmentAvailableAgents(depId);
        }
        else { // go project-wide
          agents = await this.getProjectAvailableAgents();
        }

        if (agents && agents.length > 0) {
          if (trueIntent) {
            let intentDirective = DirIntent.intentDirectiveFor(trueIntent, trueIntentAttributes);
            if (this.log) {console.log("agents (openHours) => trueIntent");}
            this.intentDir.execute(intentDirective, () => {
              callback(stopOnConditionMet);
            });
          }
          else {
            console.log("(DirIfOnlineAgents) NO IfOnlineAgents trueIntent defined. callback()") // prod
            this.chatbot.addParameter("flowError", "(If online Agents) No IfOnlineAgents success path defined.");
            callback();
            return;
          }
        }
        else if (falseIntent) { // no agents available
          let intentDirective = DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes);
          if (this.log) {console.log("(DirIfOnlineAgents) !agents (openHours) => falseIntent", intentDirective);}
          this.intentDir.execute(intentDirective, () => {
            callback(stopOnConditionMet);
          });
        }
        else {
          if (this.log) {console.log("(DirIfOnlineAgents) Error: No falseIntent defined", intentDirective);}
          this.chatbot.addParameter("flowError", "(If online Agents) No path for 'no available agents' defined.");
          callback();
        }
      }
    }
    catch(err) {
      console.error("(DirIfOnlineAgents) An error occurred:", err);
      this.chatbot.addParameter("flowError", "(If online Agents) An error occurred: " + JSON.stringify(err));
      callback();
    }
  }

  async openNow() {
    return new Promise( (resolve, reject) => {
      this.tdclient.openNow(async (err, result) => {
        if (this.log) {console.log("openNow():", result);}
        if (err) {
          reject(err);
        }
        else {
          resolve(result);
        }
      });
    });
  }

  async getProjectAvailableAgents() {
    this.tdclient.getProjectAvailableAgents((err, agents) => {
      if (err) {
        reject(err);
      }
      else {
        resolve(agents);
      }
    });
  }

  async getDepartmentAvailableAgents(depId) {
    return new Promise( (resolve, reject) => {
      this.tdclient.getDepartment(depId, async (error, dep) => {
        if (error) {
          reject(error);
        }
        else {
          console.log("got department:", JSON.stringify(dep));
          const groupId = dep.id_group;
          console.log("department.groupId:", groupId);
          try {
            if (groupId) {
              const group = await this.getGroup(groupId);
              console.log("got group info:", group);
              if (group) {
                if (group.members) {
                  console.log("group members ids:", group.members);
                  let group_members = await getTeammates(group.members);
                  console.log("group members details:", group_members);
                  let all_teammates = await this.getAllTeammates();
                  console.log("all teammates:", all_teammates);
                  if (all_teammates && all_teammates.length > 0){
                    // [
                    //   {
                    //       "user_available": false,
                    //       "number_assigned_requests": 0,
                    //       "last_login_at": "2023-10-26T16:18:54.048Z",
                    //       "status": "active",
                    //       "_id": "653a9baff34cdb002cf97fa9",
                    //       "id_project": "65203e12f8c0cf002cf4110b",
                    //       "id_user": {
                    //           "status": 100,
                    //           "_id": "62b317986993970035f0697e",
                    //           "email": "michele@tiledesk.com",
                    //           "firstname": "Michele",
                    //           "lastname": "Pomposo",
                    //           "emailverified": true,
                    //           "createdAt": "2022-06-22T13:22:32.604Z",
                    //           "updatedAt": "2023-01-31T16:43:36.166Z",
                    //           "__v": 0,
                    //           "attributes": null
                    //       },
                    //       "role": "admin",
                    //       "createdBy": "5e09d16d4d36110017506d7f",
                    //       "tags": [],
                    //       "createdAt": "2023-10-26T17:02:39.876Z",
                    //       "updatedAt": "2023-11-16T12:37:31.994Z",
                    //       "__v": 0,
                    //       "presence": {
                    //           "status": "offline",
                    //           "changedAt": "2023-11-16T12:37:31.990Z"
                    //       },
                    //       "isAuthenticated": true,
                    //       "id": "653a9baff34cdb002cf97fa9",
                    //       "isBusy": false
                    //   },
                    // filter on availability
                    console.log("getting available agents for dep:", dep);
                    let available_agents = [];
                    available_agents.forEach((agent) => {
                      if (agent.user_available === true && group_members.includes(agent.id)) {
                        available_agents.push(agent);
                      }
                    });
                    resolve(available_agents);
                  }
                }
                else {
                  return [];
                }
              }
              else {
                return [];
              }
            }
            else {
              // no group => assigned to all teammates
              agents = await this.getProjectAvailableAgents();
              return agents;
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

  // async getGroup(groupId, callback) {
  //   return new Promise ( (resolve, reject) => {
  //     const URL = `${this.APIURL}/${this.projectId}/groups/${groupId}`
  //     const HTTPREQUEST = {
  //       url: URL,
  //       headers: {
  //         'Content-Type' : 'application/json',
  //         'Authorization': this.context.token
  //       },
  //       method: 'GET',
  //       httpsOptions: this.httpsOptions
  //     };
  //     TiledeskClient.myrequest(
  //       HTTPREQUEST,
  //       function(err, resbody) {
  //         if (err) {
  //           reject(err);
  //           if (callback) {
  //             callback(err);
  //           }
  //         }
  //         else {
  //           resolve(resbody);
  //           if (callback) {
  //             callback(null, resbody);
  //           }
  //         }
  //       }, this.log
  //     );
  //   });
  // }

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
          //   {
          //     "members": [
          //         "62b317986993970035f0697e",
          //         "5aaa99024c3b110014b478f0"
          //     ],
          //     "_id": "65ddec23fd8dc3003295cdd7",
          //     "name": "Sales",
          //     "trashed": false,
          //     "id_project": "65203e12f8c0cf002cf4110b",
          //     "createdBy": "5e09d16d4d36110017506d7f",
          //     "createdAt": "2024-02-27T14:05:23.373Z",
          //     "updatedAt": "2024-02-27T14:05:29.137Z",
          //     "__v": 0
          // }
            resolve(resbody);
            if (callback) {
              callback(null, resbody);
            }
          }
        }, this.log
      );
    });
  }

  async getAllTeammates(members, callback) {
    return new Promise ( (resolve, reject) => {
      const URL = `${this.APIURL}/${this.projectId}/project_users`
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
          //   {
          //     "members": [
          //         "62b317986993970035f0697e",
          //         "5aaa99024c3b110014b478f0"
          //     ],
          //     "_id": "65ddec23fd8dc3003295cdd7",
          //     "name": "Sales",
          //     "trashed": false,
          //     "id_project": "65203e12f8c0cf002cf4110b",
          //     "createdBy": "5e09d16d4d36110017506d7f",
          //     "createdAt": "2024-02-27T14:05:23.373Z",
          //     "updatedAt": "2024-02-27T14:05:29.137Z",
          //     "__v": 0
          // }
            resolve(resbody);
            if (callback) {
              callback(null, resbody);
            }
          }
        }, this.log
      );
    });
  }

  // parseParams(directive_parameter) {
  //   let trueIntent = null;
  //   let falseIntent = null;
  //   const params = ms(directive_parameter);
  //   if (params.trueIntent) {
  //     trueIntent = params.trueIntent;
  //   }
  //   if (params.falseIntent) {
  //     falseIntent = params.falseIntent;
  //   }
  //   return {
  //     trueIntent: trueIntent,
  //     falseIntent: falseIntent
  //   }
  // }
}

module.exports = { DirIfOnlineAgents };