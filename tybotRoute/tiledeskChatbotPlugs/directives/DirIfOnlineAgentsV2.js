// const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { rejects } = require('assert');
const { DirIntent } = require('./DirIntent');
const axios = require("axios").default;
let https = require("https");
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');

class DirIfOnlineAgentsV2 {

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
    console.log("(DirIfOnlineAgents) action:", action);
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
      const ignoreProjectWideOperatingHours = action.ignoreOperatingHours;
      let isOpen = false;
      if (ignoreProjectWideOperatingHours === true) {
        // always go on to only check agents availability
        isOpen = true;
      }
      else {
        const result = await this.openNow();
        if (result && result.isopen) {
          isOpen = true;
        }
        else {
          isOpen = false;
        }
      }
      
      // if (result && result.isopen) {
      if (isOpen === true) { // always true if ignoreProjectWideOperatingHours = true
        const selectedOption = action.selectedOption;
        
        let agents;
        if (selectedOption === "currentDep") {
          console.log("(DirIfOnlineAgents) currentDep"); 
          // let departmentId;
          let departmentId = await this.chatbot.getParameter("department_id");
          console.log("this.context.departmentId:", departmentId);

          // if (this.context.tdcache) {
          //   let attributes = 
          //   await TiledeskChatbot.allParametersStatic(
          //     this.context.tdcache, this.context.requestId
          //   );
          //   if (this.log) {console.log("Attributes:::", JSON.stringify(attributes))}
          //   departmentId = attributes["department_id"];
          //   if (this.log) {console.log("Attributes.departmentId:::", departmentId)}
          // }

          if (departmentId) {
            // departmentId = this.context.departmentId;
            // if (this.log) {console.log("(DirIfOnlineAgents) selectedOption === currentDep. Current department:", departmentId, typeof(departmentId)); }
            agents = await this.getDepartmentAvailableAgents(departmentId);
            if (this.log) {console.log("(DirIfOnlineAgents) agents:", agents); }
          } else {
            console.error("(DirIfOnlineAgents) no departmentId found in attributes");
            await this.chatbot.addParameter("flowError", "(If online Agents) No departmentId found in attributes.");
            if (this.log) {console.log("(DirIfOnlineAgents) flowError added in attributes", await this.chatbot.getParameter("flowError") ); }
            if (falseIntent) { // no agents available
              let intentDirective = DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes);
              this.intentDir.execute(intentDirective, () => {
                callback(stopOnConditionMet);
              });
              return;
            }
            else {
              callback(false);
              return;
            }
          }
        }
        else if (selectedOption === "selectedDep") {
          if (this.log) {console.log("(DirIfOnlineAgents) selectedOption === selectedDep", action.selectedDepartmentId); }
          agents = await this.getDepartmentAvailableAgents(action.selectedDepartmentId);
          if (this.log) {console.log("(DirIfOnlineAgents) agents:", agents); }
        }
        else { // if (checkAll) => go project-wide
          if (this.log) {console.log("(DirIfOnlineAgents) selectedOption === all"); }
          agents = await this.getProjectAvailableAgents(true);
          if (this.log) {console.log("(DirIfOnlineAgents) agents:", agents); }
        }

        console.log("anyway qui...");
        if (agents && agents.length > 0) {
          if (trueIntent) {
            let intentDirective = DirIntent.intentDirectiveFor(trueIntent, trueIntentAttributes);
            if (this.log) {console.log("agents (openHours) => trueIntent");}
            this.intentDir.execute(intentDirective, () => {
              callback(stopOnConditionMet);
            });
          }
          else {
            if (this.log) { console.log("(DirIfOnlineAgents) No IfOnlineAgents trueIntent defined. callback()"); } // prod
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
      } else {
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
    }
    catch(err) {
      console.error("(DirIfOnlineAgents) An error occurred:", err);
      this.chatbot.addParameter("flowError", "(If online Agents) An error occurred: " + err);
      callback();
    }
  }

  async openNow() {
    return new Promise( (resolve, reject) => {
      this.tdclient.openNow(async (err, result) => {
        if (this.log) {console.log("(DirIfOnlineAgents) openNow():", result);}
        if (err) {
          reject(err);
        }
        else {
          resolve(result);
        }
      });
    });
  }

  async getProjectAvailableAgents(raw, callback) {
    return new Promise( (resolve, reject) => {
      const APIURL = process.env.API_ENDPOINT || process.env.API_URL;
      const URL = `${APIURL}/projects/${this.projectId}/users/availables?raw=${raw}`
      const HTTPREQUEST = {
        url: URL,
        headers: {
          'Content-Type' : 'application/json',
          'Authorization': this.fixToken(this.context.token)
        },
        // json: true,
        method: 'GET',
      };
      this.#myrequest(
        HTTPREQUEST,
        function(err, resbody) {
          if (err) {
            if (callback) {
              callback(err);
            }
            reject(err);
          }
          else {
            if (callback) {
              callback(null, resbody);
            }
            resolve(resbody);
          }
        }, this.log);
    });
    
  }

  // async getProjectAvailableAgents() {
  //   return new Promise( (resolve, reject) => {
  //     this.tdclient.getProjectAvailableAgents((err, agents) => {
  //       if (err) {
  //         reject(err);
  //       }
  //       else {
  //         resolve(agents);
  //       }
  //     });
  //   })
  // }

  async getDepartmentAvailableAgents(depId) {
    return new Promise( (resolve, reject) => {
      this.tdclient.getDepartment(depId, async (error, dep) => {
        if (error) {
          reject(error);
        }
        else {
          if (this.log) {console.log("(DirIfOnlineAgents) got department:", JSON.stringify(dep)); }
          const groupId = dep.id_group;
          if (this.log) {console.log("(DirIfOnlineAgents) department.groupId:", groupId); }
          try {
            if (groupId) {
              const group = await this.getGroup(groupId);
              if (this.log) { console.log("(DirIfOnlineAgents) got group info:", group); }
              if (group) {
                if (group.members) {
                  if (this.log) { console.log("(DirIfOnlineAgents) group members ids:", group.members);}
                  // let group_members = await getTeammates(group.members);
                  // console.log("group members details:", group_members);
                  let all_teammates = await this.getAllTeammates();
                  if (this.log) { console.log("(DirIfOnlineAgents) all teammates:", all_teammates); }
                  if (all_teammates && all_teammates.length > 0){
                    // [
                    //   {
                    //       "user_available": false,
                    // ...
                    //       "id_user": {
                    //           "status": 100,
                    //           "email": "michele@tiledesk.com",
                    //           "firstname": "Michele",
                    //           "lastname": "Pomposo",
                    // ...
                    //       },
                    //       "role": "admin",
                    //       "tags": [],
                    //       "presence": {
                    //           "status": "offline",
                    //           "changedAt": "2023-11-16T12:37:31.990Z"
                    //       },
                    //       "isBusy": false
                    //   }, ... ]
                    // filter on availability
                    console.log("(DirIfOnlineAgents) filtering available agents for group:", groupId);
                    let available_agents = [];
                    all_teammates.forEach((agent) => {
                      if (this.log) { console.log("Checking teammate:", agent.id_user._id, "(", agent.id_user.email ,") Available:", agent.user_available, ") with members:",group.members ); }
                      if (agent.user_available === true && group.members.includes(agent.id_user._id)) {
                        console.log("Adding teammate:", agent.id_user._id);
                        available_agents.push(agent);
                      }
                    });
                    if (this.log) { console.log("(DirIfOnlineAgents) available agents in group:", available_agents); }
                    resolve(available_agents);
                  }
                }
                else {
                  this.chatbot.addParameter("flowError", "(If online Agents) Empty group:" + groupId);
                  resolve([]);
                }
              }
              else {
                this.chatbot.addParameter("flowError", "(If online Agents) Error: no group for groupId:" + groupId);
                resolve([]);
              }
            }
            else {
              // no group => assigned to all teammates
              const agents = await this.getProjectAvailableAgents(true);
              resolve(agents);
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
      const URL = `${this.context.TILEDESK_APIURL}/${this.context.projectId}/groups/${groupId}`
      const HTTPREQUEST = {
        url: URL,
        headers: {
          'Content-Type' : 'application/json',
          'Authorization': this.fixToken(this.context.token)
        },
        method: 'GET',
        httpsOptions: this.httpsOptions
      };
      this.#myrequest(
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
      const URL = `${this.context.TILEDESK_APIURL}/${this.context.projectId}/project_users`
      const HTTPREQUEST = {
        url: URL,
        headers: {
          'Content-Type' : 'application/json',
          'Authorization': this.fixToken(this.context.token)
        },
        method: 'GET',
        httpsOptions: this.httpsOptions
      };
      this.#myrequest(
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

  #myrequest(options, callback) {
    if (this.log) {
      console.log("API URL:", options.url);
      console.log("** Options:", JSON.stringify(options));
    }
    let axios_options = {
      url: options.url,
      method: options.method,
      params: options.params,
      headers: options.headers
    }
    if (options.json !== null) {
      axios_options.data = options.json
    }
    if (this.log) {
      console.log("axios_options:", JSON.stringify(axios_options));
    }
    if (options.url.startsWith("https:")) {
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });
      axios_options.httpsAgent = httpsAgent;
    }
    axios(axios_options)
      .then((res) => {
        if (this.log) {
          console.log("Response for url:", options.url);
          console.log("Response headers:\n", JSON.stringify(res.headers));
        }
        if (res && res.status == 200 && res.data) {
          if (callback) {
            callback(null, res.data);
          }
        }
        else {
          if (callback) {
            callback(new Error("Response status is not 200"), null);
          }
        }
      })
      .catch((error) => {
        if (callback) {
          callback(error, null);
        }
      });
  }

  fixToken(token) {
    if (token.startsWith('JWT ')) {
      return token
    }
    else {
      return 'JWT ' + token
    }
  }
}

module.exports = { DirIfOnlineAgentsV2 };