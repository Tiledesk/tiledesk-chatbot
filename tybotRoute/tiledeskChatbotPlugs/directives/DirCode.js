const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskExpression } = require('../../TiledeskExpression');
const { TiledeskRequestVariables } = require('../TiledeskRequestVariables');
const winston = require('../../utils/winston');
const { Logger } = require('../../Logger');

class DirCode {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.requestId = this.context.requestId;
    
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    winston.verbose("Execute Code directive");
    let action;
    if (directive.action) {
      action = directive.action
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirCode Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Code] Executed");
      callback(stop);
    });
    
  }

  async go(action, callback) {
    winston.debug("(DirCode) Action: ", action);
    const source_code = action.source;
    if (!source_code || source_code.trim() === "") {
      this.logger.warn("[Code] Invalid source_code");
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
      this.logger.error("[Code] An error occurred: ", err);
      winston.error("(DirCode)  An error occurred: ", err);
    }
    callback();
    return;
  }

}

module.exports = { DirCode };