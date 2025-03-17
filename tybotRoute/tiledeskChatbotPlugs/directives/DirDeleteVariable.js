const { param } = require('express/lib/request');
const ms = require('minimist-string');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { Filler } = require('../Filler');
const winston = require('../../utils/winston');

class DirDeleteVariable {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.log = context.log;
  }

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
    this.go(action, () => {
      callback();
    });
  }

  async go(action, callback) {
    winston.debug("(DirDeleteVariable) Action: ", action);

    let variableName = action.variableName;
    if (!variableName) {
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
        winston.error("(DirDeleteVariable)  error: ", err);
        if (completion) {
          completion();
        }
      }
    }
  }
}

module.exports = { DirDeleteVariable };