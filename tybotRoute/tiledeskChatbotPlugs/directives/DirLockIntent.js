const ms = require('minimist-string');
const winston = require('../../utils/winston');

class DirLockIntent {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    if (!context.tdcache) {
      throw new Error('tdcache (TdCache) object is mandatory.');
    }
    this.tdcache = this.context.tdcache;
    this.log = context.log;
  }

  async execute(directive, callback) {
    winston.verbose("Execute LockIntent directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else if (directive.parameter && directive.parameter.trim() !== "") {
      const params = this.parseParams(directive.parameter);
      action = {
        intentName: params.intentName 
      }
    }
    else {
      winston.warn("DirLockIntent Incorrect directive: ", directive);
      callback();
      return;
    }
    // if (directive.parameter) {
    //   let intent_name = directive.parameter.trim();
    //   await this.lockIntent(requestId, intent_name);
    //   callback();
    // }
    // else {
    //   callback();
    // }
    this.go(action, () => {
      callback();
    });
  }

  async go(action, callback) {
    winston.debug("(DirLockIntent) Action: ", action);
    let intent_name = action.intentName;
    // let variable_name = action.body.variableName;
    await DirLockIntent.lockIntent(this.tdcache, this.context.requestId, intent_name); //, variable_name);
    winston.debug("(DirLockIntent) Locked intent:", action.intentName);
    if (callback) {
      callback();
    }
  }

  static async lockIntent(tdcache, requestId, intent_name) { //}, variable_name) {
    if (tdcache != null && requestId != null && intent_name != null) {
      await tdcache.set("tilebot:requests:"  + requestId + ":locked", intent_name);
    }
    else {
      winston.error("(DirLockIntent) lockIntent recoverable error, one of requestId: " + requestId + " intent_name: " + intent_name + " is not valid");
    }
    
    // if (variable_name) {
    //   await this.tdcache.set("tilebot:requests:"  + requestId + ":lockedValue", variable_name);
    // }
  }
  
  parseParams(directive_parameter) {
    let intentName = null;
    let variableName = null;
    const params = ms(directive_parameter);
    if (params.intentName) {
      intentName = params.intentName
    }
    if (params.variableName) {
      variableName = params.variableName.replace(/[$]/g, ""); // $ sign not permitted. Silently removing if present
    }
    return {
      intentName: intentName,
      variableName: variableName
    }
  }

}

module.exports = { DirLockIntent };