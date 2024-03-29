const ms = require('minimist-string');

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
    if (this.log) {console.log("Locking intent:", JSON.stringify(directive));}
    let action;
    if (directive.action) {
      // console.log("got intent action:", JSON.stringify(directive.action));
      action = directive.action;
    }
    else if (directive.parameter && directive.parameter.trim() !== "") {
      const params = this.parseParams(directive.parameter);
      action = {
        // body: {
        intentName: params.intentName // directive.parameter.trim()
          // variableName: params.variableName
        // }
      }
    }
    else {
      console.error("Incorrect directive:", directive);
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
    // let intent_name = action.body.intentName;
    let intent_name = action.intentName;
    // let variable_name = action.body.variableName;
    await DirLockIntent.lockIntent(this.tdcache, this.context.requestId, intent_name); //, variable_name);
    if (this.log) {console.log("Locked intent:", action.intentName);}
    if (callback) {
      callback();
    }
  }

  static async lockIntent(tdcache, requestId, intent_name) { //}, variable_name) {
    if (tdcache != null && requestId != null && intent_name != null) {
      await tdcache.set("tilebot:requests:"  + requestId + ":locked", intent_name);
    }
    else {
      console.error("lockIntent recoverable error, one of requestId:", requestId, "intent_name:", intent_name, "is not valid");
    }
    
    // if (variable_name) {
    //   console.log("locking intent with variable:", variable_name);
    //   await this.tdcache.set("tilebot:requests:"  + requestId + ":lockedValue", variable_name);
    // }
    // console.log("locked. Intent name:", intent_name, "intent variable:", variable_name);
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