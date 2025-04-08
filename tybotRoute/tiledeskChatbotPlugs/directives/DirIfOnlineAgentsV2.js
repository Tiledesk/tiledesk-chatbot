const { DirIntent } = require('./DirIntent');
const axios = require("axios").default;
let https = require("https");
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const winston = require('../../utils/winston');
const httpUtils = require('../../utils/HttpUtils');

class DirIfOnlineAgentsV2 {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.chatbot = context.chatbot;
    this.intentDir = new DirIntent(context);
    this.API_ENDPOINT = context.API_ENDPOINT;

    this.tdClient = new TiledeskClient({
      projectId: this.context.projectId,
      token: this.context.token,
      APIURL: this.API_ENDPOINT,
      APIKEY: "___",
    });

  }

  execute(directive, callback) {
    winston.verbose("Execute IfOnlineAgentsV2 directive");
    let action;
    if (directive.action) {
      action = directive.action
    }
    else {
      winston.warn("DirIfOnlineAgentsV2 Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    });
  }

  async go(action, callback) {
    winston.debug("(DirIfOnlineAgentsV2) Action: ", action);

    if (!action.trueIntent && !action.falseIntent) {
      winston.error("(DirIfOnlineAgentsV2) Error: missing both action.trueIntent & action.falseIntent");
      callback();
      return;
    }
    const trueIntent = action.trueIntent;
    const falseIntent = action.falseIntent;
    const trueIntentAttributes = action.trueIntentAttributes;
    const falseIntentAttributes = action.falseIntentAttributes;

    winston.debug("(DirIfOnlineAgentsV2) IfOnlineAgents:trueIntent: " + trueIntent);
    winston.debug("(DirIfOnlineAgentsV2) IfOnlineAgents:falseIntent: " + falseIntent);

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
          winston.debug("(DirIfOnlineAgentsV2) currentDep");
          let departmentId = await this.chatbot.getParameter("department_id");
          winston.debug("(DirIfOnlineAgentsV2) this.context.departmentId: " + departmentId); 

          if (departmentId) {
            agents = await this.getProjectAvailableAgents(departmentId, true);
          } else {
            winston.error("(DirIfOnlineAgentsV2) no departmentId found in attributes");
            await this.chatbot.addParameter("flowError", "(If online Agents) No departmentId found in attributes.");
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
          agents = await this.getProjectAvailableAgents(action.selectedDepartmentId, true);
        }
        else { // if (checkAll) => go project-wide
          agents = await this.getProjectAvailableAgents(null, true);
        }

        if (agents && agents.length > 0) {
          if (trueIntent) {
            let intentDirective = DirIntent.intentDirectiveFor(trueIntent, trueIntentAttributes);
            winston.debug("(DirIfOnlineAgentsV2) agents (openHours) => trueIntent");
            this.intentDir.execute(intentDirective, () => {
              callback(stopOnConditionMet);
            });
          }
          else {
            winston.debug("(DirIfOnlineAgentsV2) No IfOnlineAgents trueIntent defined. callback()"); // prod
            this.chatbot.addParameter("flowError", "(If online Agents) No IfOnlineAgents success path defined.");
            callback();
            return;
          }
        }
        else if (falseIntent) { // no agents available
          let intentDirective = DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes);
          winston.debug("(DirIfOnlineAgentsV2) !agents (openHours) => falseIntent", intentDirective);
          this.intentDir.execute(intentDirective, () => {
            callback(stopOnConditionMet);
          });
        }
        else {
          winston.error("(DirIfOnlineAgentsV2) Error: No falseIntent defined", intentDirective);
          this.chatbot.addParameter("flowError", "(If online Agents) No path for 'no available agents' defined.");
          callback();
        }
      } else {
        if (falseIntent) {
          let intentDirective = DirIntent.intentDirectiveFor(falseIntent, falseIntentAttributes);
          winston.debug("(DirIfOnlineAgentsV2) !agents (!openHours) => falseIntent");
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
      winston.error("(DirIfOnlineAgentsV2) An error occurred: ", err);
      this.chatbot.addParameter("flowError", "(If online Agents) An error occurred: " + err);
      callback();
    }
  }

  async openNow() {
    return new Promise( (resolve, reject) => {
      this.tdClient.openNow(async (err, result) => {
        winston.debug("(DirIfOnlineAgentsV2) openNow(): ", result);
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
      httpUtils.request(
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
        });
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