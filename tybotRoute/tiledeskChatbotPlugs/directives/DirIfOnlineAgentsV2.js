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
    this.API_ENDPOINT = context.API_ENDPOINT;
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
    // console.log("(DirIfOnlineAgents) action:", action);
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
          if (this.log) {console.log("(DirIfOnlineAgents) currentDep"); }
          let departmentId = await this.chatbot.getParameter("department_id");
          if (this.log) {console.log("this.context.departmentId:", departmentId);}

          if (departmentId) {
            if (this.log) {console.log("(DirIfOnlineAgents) agents = await this.getProjectAvailableAgents(", departmentId, ", true);"); }
            agents = await this.getProjectAvailableAgents(departmentId, true);
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
          if (this.log) {console.log("(DirIfOnlineAgents) agents = await this.getProjectAvailableAgents(", action.selectedDepartmentId, ", true);"); }
          
          agents = await this.getProjectAvailableAgents(action.selectedDepartmentId, true);
          if (this.log) {console.log("(DirIfOnlineAgents) agents:", agents); }
        }
        else { // if (checkAll) => go project-wide
          if (this.log) {console.log("(DirIfOnlineAgents) selectedOption === all | getProjectAvailableAgents(null, true)"); }
          agents = await this.getProjectAvailableAgents(null, true);
          if (this.log) {console.log("(DirIfOnlineAgents) agents:", agents); }
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
          if (this.log) { console.log("!agents (!openHours) => falseIntent"); }
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
      console.error("(DirIfOnlineAgents) An error occurred:" + err);
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

  async getProjectAvailableAgents(departmentId, raw, callback) {
    return new Promise( (resolve, reject) => {
      let URL = `${this.API_ENDPOINT}/projects/${this.context.projectId}/users/availables?raw=${raw}`
      if (departmentId) {
        URL = URL + `&department=${departmentId}`
      }
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
        console.error("(DirIfOnlineAgents) Axios error: ", JSON.stringify(error));
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