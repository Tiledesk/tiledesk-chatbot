const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskExpression } = require('../../TiledeskExpression');
const { TiledeskRequestVariables } = require('../TiledeskRequestVariables');
const winston = require('../../utils/winston');

class DirCode {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
  }

  execute(directive, callback) {
    winston.verbose("Execute Code directive");
    let action;
    if (directive.action) {
      action = directive.action
    }
    else {
      winston.warn("DirCode Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      callback(stop);
    });
    
  }

  async go(action, callback) {
    winston.debug("(DirCode) Action: ", action);
    const source_code = action.source;
    if (!source_code || source_code.trim() === "") {
      winston.error("(DirCode) Invalid source_code");
      callback();
      return;
    }
    let script_context = {
      console: console
    }
    let attributes = null;
    if (this.context.tdcache) {
      attributes = 
      await TiledeskChatbot.allParametersStatic(
        this.context.tdcache, this.context.requestId
      );
      winston.debug("(DirCode) Attributes:", attributes)
    }
    else {
      winston.error("(DirCode) No this.context.tdcache");
      callback();
      return;
    }
    
    let variablesManager = new TiledeskRequestVariables(this.context.requestId, this.context.tdcache, attributes);
    script_context.context = variablesManager;

    const tdExpression = new TiledeskExpression();

    try {
      const result = new TiledeskExpression().evaluateJavascriptExpression(source_code, script_context);
      
      for (const [key, value] of Object.entries(script_context.context.ops.set)) {;
        await TiledeskChatbot.addParameterStatic(this.context.tdcache, this.context.requestId, key, value);
      }
      for (const [key, value] of Object.entries(script_context.context.ops.del)) {
        await variablesManager.delete(key);
      }

      const newvars_del = await variablesManager.all();

    }
    catch(err) {
      winston.error("(DirCode)  An error occurred: ", err);
    }
    callback();
    return;
  }

}

module.exports = { DirCode };