const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const ms = require('minimist-string');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot.js');
const winston = require('../../utils/winston')

class DirAssignFromFunction {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.log = context.log;
    this.tdcache = context.tdcache;
    this.API_ENDPOINT = context.API_ENDPOINT;

    this.tdClient = new TiledeskClient({
      projectId: this.context.projectId,
      token: this.context.token,
      APIURL: this.API_ENDPOINT,
      APIKEY: "___",
      log: this.log
    });
  }

  async execute(directive, callback) {
    winston.verbose("Execute AssignFromFunction directive");
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
          functionName: params.functionName,
          assignTo: params.assignTo
      }
    } else {
      winston.warn("Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    });
  }

  async go(action, callback) {
    winston.debug("(DirAssignFromFunction) Action: ", action);
    // const functionName = action.body.functionName;
    // const variableName = action.body.assignTo;
    const functionName = action.functionName;
    const variableName = action.assignTo;

    winston.debug("(DirAssignFromFunction) functionName: " + functionName)
    winston.debug("(DirAssignFromFunction) variableName: " + variableName)
    this.invoke(functionName, async (err, value) => {
      if (!err) {
        await TiledeskChatbot.addParameterStatic(this.tdcache, this.context.requestId, variableName, value);
        winston.debug("(DirAssignFromFunction) Assigned: " + value + "to" + variableName);
      }
      else {
        winston.error("(DirAssignFromFunction) invoke() error: ", err);
      }
      callback();
    });
  }

  async invoke(functionName, callback) {
    switch (functionName) {
      case "openNow":
        this.tdClient.openNow((err, result) => {
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
        this.tdClient.getProjectAvailableAgents((err, agents) => {
          winston.debug("(DirAssignFromFunction) Agents on 'open' ", agents);
          if (err || !agents) {
            winston.error("(DirAssignFromFunction) Error getting available agents in DirWhenAvailableAgents", err);
            callback(err, 0);
          }
          else {
            winston.debug("(DirAssignFromFunction) Agents count: " + agents.length);
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