const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const ms = require('minimist-string');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot.js');

class DirAssignFromFunction {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    // let context =  {
    //   projectId: projectId,
    //   token: token,
    //   supportRequest: supportRequest,
    //   requestId: supportRequest.request_id,
    //   TILEDESK_APIURL: API_URL,
    //   TILEBOT_ENDPOINT:TILEBOT_ENDPOINT,
    //   departmentId: depId,
    //   tdcache: tdcache,
    //   log: false
    // }
    this.tdclient = context.tdclient;
    // new TiledeskClient({
    //   projectId: context.projectId,
    //   token: context.token,
    //   APIURL: context.TILEDESK_APIURL,
    //   APIKEY: "___",
    //   log: context.log
    // });
    this.log = context.log;
    this.tdcache = context.tdcache;
  }

  async execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action
    }
    else if (directive.parameter) {
      let params;
      if (directive.parameter) {
        params = this.parseParams(directive.parameter);
      }
      action = {
        body: {
          functionName: params.functionName,
          assignTo: params.assignTo
        }
      }
    }
    console.log("execute assign");
    this.go(action, () => {
      console.log("assign end.");
      callback();
    });
  }

  async go(action, callback) {
    console.log("invoke function => assign action:", action);
    const functionName = action.body.functionName;
    const variableName = action.body.assignTo;
    console.log("functionName:", functionName)
    console.log("variableName:", variableName)
    this.invoke(functionName, async (err, value) => {
      if (!err) {
        await TiledeskChatbot.addParameterStatic(this.tdcache, this.context.requestId, variableName, value);
        console.log("Assigned:", value, "to", variableName);
      }
      else {
        console.error("invoke() error:", err);
      }
      callback();
    });
  }

  async invoke(functionName, callback) {
    switch (functionName) {
      case "openNow":
        this.tdclient.openNow((err, result) => {
          if (this.log) {console.log("openNow():", result);}
          if (err) {
            callback(err);
          }
          else if (result) {
            callback(null, result.isopen);
          }
          else {
            callback(null, false);
          }
        });
        break;
      case "availableAgents":
        this.tdclient.getProjectAvailableAgents((err, agents) => {
          if (this.log) {console.log("Agents on 'open'", agents);}
          if (err || !agents) {
            console.error("Error getting available agents in DirWhenAvailableAgents", err);
            callback(err, 0);
          }
          else {
            if (this.log) {console.log("Agents count:", agents.length);}
            // if (agents.length === 0) {
            // else if (agents.length > 0 && this.checkAgents) {
            callback(null, agents.length);
            return;
          }
        });
        break;
      default:
        callback(new Error("No function: " + functionName));
        break;

    }
  }
  parseParams(directive_parameter) {
    let functionName = null;
    let assignTo = null;
    const params = ms(directive_parameter);
    if (params.functionName) {
      functionName = params.functionName
    }
    if (params.assignTo) {
      assignTo = params.assignTo;
    }
    return {
      functionName: functionName,
      assignTo: assignTo
    }
  }

}

module.exports = { DirAssignFromFunction };