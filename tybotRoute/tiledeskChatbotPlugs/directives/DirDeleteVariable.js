const { HelpCenterQuery } = require('@tiledesk/helpcenter-query-client');
const { param } = require('express/lib/request');
const ms = require('minimist-string');
const { TiledeskChatbot } = require('../../models/TiledeskChatbot');

class DirDeleteVariable {

  constructor(config) {
    this.tdclient = config.tdclient;
    this.tdcache = config.tdcache;
    this.requestId = config.requestId;
    this.log = config.log;
  }

  async execute(directive, completion) {
      let variableName = null;
      // console.log("DirDeleteVariable:", directive);
      if (directive.parameter) {
        variableName = directive.parameter;
      }
      else {
        const error = new Error("missing 'parameter' error. Skipping");
        if (error) {
          console.log("error:", error);
        }
        if (completion) {
          completion();
        }
      }
      try {
        if (this.tdcache) {
          
          await TiledeskChatbot.deleteParameterStatic(
            this.tdcache, this.requestId, variableName
          );
        }
        if (completion) {
          completion();
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

module.exports = { DirDeleteVariable };