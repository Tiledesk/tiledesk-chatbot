const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { TiledeskExpression } = require('../../TiledeskExpression');
const { TiledeskRequestVariables } = require('../TiledeskRequestVariables');

class DirCode {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
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
    // console.log("action.source:", action.source)
    const source_code = action.source;
    if (!source_code || source_code.trim() === "") {
      if (this.log) {console.log("Invalid source_code");}
      callback();
      return;
    }
    let script_context = {
      console: console
    }
    let variables = null;
    if (this.context.tdcache) {
      variables = 
      await TiledeskChatbot.allParametersStatic(
        this.context.tdcache, this.context.requestId
      );
      if (this.log) {console.log("Variables:", JSON.stringify(variables))}
    }
    else {
      console.error("(DirCode) No this.context.tdcache");
      callback();
      return;
    }
    // console.log("before variables:", variables);
    for (const [key, value] of Object.entries(variables)) {
      script_context[key] = value;
    }
    let variablesManager = new TiledeskRequestVariables(this.context.requestId, this.context.tdcache, variables)
    script_context.tiledeskVars = variablesManager;
    //console.log("script_context:", script_context);
    const tdExpression = new TiledeskExpression();
    //console.log("tdExpression:", tdExpression.evaluateJavascriptExpression);
    try {
      const result = new TiledeskExpression().evaluateJavascriptExpression(source_code, script_context);
      // console.log("result:", result);
      // console.log("script_context.tiledeskVars:", script_context.tiledeskVars);
      for (const [key, value] of Object.entries(script_context.tiledeskVars.ops.set)) {
        // await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, key, value);
        // await variablesManager.set(key, value);
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, key, value);
      }
      // if (this.log) {
        // let newvars_set = await variablesManager.all();
        // console.log("newvars_set:", newvars_set);
      // }
      for (const [key, value] of Object.entries(script_context.tiledeskVars.ops.del)) {
        // await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, key, value);
        await variablesManager.delete(key);
      }
      const newvars_del = await variablesManager.all();
      // console.log("newvars_del:", newvars_del);
    }
    catch(err) {
      console.error("An error occurred:", err);
    }
    callback();
    return;
  }

}

module.exports = { DirCode };