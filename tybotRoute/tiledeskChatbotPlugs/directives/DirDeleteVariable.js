const { HelpCenterQuery } = require('@tiledesk/helpcenter-query-client');
const { param } = require('express/lib/request');
const ms = require('minimist-string');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { Filler } = require('../Filler');

class DirDeleteVariable {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.log = context.log;
  }

  async execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action
    }
    else if (directive.parameter) {
      action = {
        // body: {
          variableName: directive.parameter
        // }
      }
    }
    this.go(action, () => {
      callback();
    });
  }

  async go(action, callback) {
    // let variableName = action.body.variableName;
    let variableName = action.variableName;
    // console.log("DirDeleteVariable:", directive);
    if (!variableName) {
      if (this.log) {console.log("Error deleting variable. Missing 'variableName' error. Skipping");}
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
          // console.log("All availabe variables before deletion:", variables);
          const filler = new Filler();
          // console.log("delete variable name:", variableName);
          variableName = filler.fill(variableName, variables);
          // console.log("delete variable name (after filling):", variableName);
          await TiledeskChatbot.deleteParameterStatic(
            this.context.tdcache, this.context.requestId, variableName
          );
        }
        if (callback) {
          callback();
        }
      }
      catch(err) {
        console.error("DirDeleteVariable error:", err);
        if (completion) {
          completion();
        }
      }
    }
  }
}

module.exports = { DirDeleteVariable };