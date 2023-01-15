
class DirLockIntent {

  constructor(tdcache) {
    if (!tdcache) {
      throw new Error('tdcache (TdCache) object is mandatory.');
    }
    this.tdcache = tdcache;
  }

  async execute(directive, requestId, callback) {
    console.log("Locking intent");
    let action;
    if (directive.action) {
      // console.log("got intent action:", JSON.stringify(directive.action));
      action = directive.action;
    }
    else if (directive.parameter && directive.parameter.trim() !== "") {
      const params = this.parseParams(directive.parameter);
      action = {
        body: {
          intentName: params.intentName, // directive.parameter.trim()
          variableName: params.variableName
        }
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
    let intent_name = action.body.intentName;
    let variable_name = action.body.variableName;
    await this.lockIntent(requestId, intent_name, variable_name);
    if (callback) {
      callback();
    }
  }

  async lockIntent(requestId, intent_name, variable_name) {
    await this.tdcache.set("tilebot:requests:"  + requestId + ":locked", intent_name);
    if (variable_name) {
      console.log("locking intent with variable:", variable_name);
      await this.tdcache.set("tilebot:requests:"  + requestId + ":locked", variable_name);
    }
    console.log("locked. Intent name:", intent_name, "intent variable:", variable_name);
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