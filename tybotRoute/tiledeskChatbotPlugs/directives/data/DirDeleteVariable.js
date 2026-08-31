const { param } = require('express/lib/request');
const { TiledeskChatbot } = require('../../../engine/TiledeskChatbot');
const { Filler } = require('../../Filler');
const winston = require('../../../utils/winston');
const { BaseDirective } = require('../../BaseDirective');
const { Directives } = require('../Directives');

class DirDeleteVariable extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.DELETE];

  async execute(directive, callback) {
    winston.verbose("Execute DeleteVariable directive");
    let action;
    if (directive.action) {
      action = directive.action
    }
    else if (directive.parameter) {
      action = {
        variableName: directive.parameter
      }
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("(DirDeleteVariable) Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, () => {
      this.logger.native("[Delete Attribute] Executed");
      callback();
    });
  }

  async go(action, callback) {
    winston.debug("(DirDeleteVariable) Action: ", action);

    let variableName = action.variableName;
    if (!variableName) {
      this.logger.warn("[Delete Attribute] Missing 'variableName'. Skip")
      winston.error("(DirDeleteVariable) deleting variable. Missing 'variableName' error. Skipping");
      if (callback) {
        callback();
      }
    }
    else {
      try {
        if (this.context.tdcache) {
          let variables = null;
          variables = 
          await TiledeskChatbot.allParametersStatic(
            this.context.tdcache, this.context.requestId
          );

          const filler = new Filler();
          variableName = filler.fill(variableName, variables);
          await TiledeskChatbot.deleteParameterStatic(
            this.context.tdcache, this.context.requestId, variableName
          );
        }
        if (callback) {
          callback();
        }
      }
      catch(err) {
        this.logger.error("[Delete Attribute] Error deleting attribute");
        winston.error("(DirDeleteVariable)  error: ", err);
        if (completion) {
          completion();
        }
      }
    }
  }
}

module.exports = { DirDeleteVariable };