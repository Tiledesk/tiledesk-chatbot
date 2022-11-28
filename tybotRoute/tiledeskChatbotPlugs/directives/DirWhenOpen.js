const { param } = require("express/lib/request");

class DirWhenOpen {

  constructor(config) {
    if (!config.tdclient) {
      throw new Error('config.tdclient (TiledeskClient) object is mandatory.');
    }
    this.tdclient = config.tdclient;
    if (config.checkOpen == null || config.checkOpen === true) {
      // null => defaults to checkOpen
      this.checkOpen = true;  
    }
    else {
      this.checkOpen = false;
    }
    this.log = config.log;
  }

  execute(directive, directives, current_directive_index, callback) {
    this.tdclient.openNow((err, result) => {
      if (this.log) {console.log("openNow():", result);}
      if (err) {
        console.error("Agent in DirWhenOpen Error:", err);
        callback();
        return;
      }
      else {
        if (directive.parameter) {
          if (result && result.isopen && this.checkOpen) {
            if (this.log) {console.log("execute the action on 'open'");}
            let directive_to_execute = this.directiveFromParameter(directive.parameter);
            if (this.log) {console.log("directive_to_execute:", directive_to_execute);}
            if (directive_to_execute) {
              directives.splice(current_directive_index + 1, 0, directive_to_execute);
            }
            callback();
            return;
          }
          
          if (result && !result.isopen && this.checkOpen === false) {
            if (this.log) {console.log("execute the action on 'closed'");}
            let directive_to_execute = this.directiveFromParameter(directive.parameter);
            if (directive_to_execute) {
              directives.splice(current_directive_index + 1, 0, directive_to_execute);
            }
            callback();
            return;
          }
          if (this.log) {
            console.log("condition is checkOpen:", this.checkOpen);
            console.log("result.isopen:", result.isopen);
            console.log("condition not matched!");
          }
          callback();
        }
        else {
          if (this.log) {console.log("no directive to execute.");}
          callback();
        }
      }
    });
  }

  directiveFromParameter(parameter) {
    const DIRECTIVE_PREFIX = "_td";
    const AGENT_DIRECTIVE_CMD = "\\agent"
    const directive_pattern = /((\\{1}_td[a-zA-Z_0-9]*)|(\\agent))[ ]*(.*)[\r\n]*/m;
    let match = null;
    let directive = null;
    match = directive_pattern.exec(parameter);
    if (match && match.length >= 1) {
      let final_msg_text = parameter.substring(0, match.index) + parameter.substring(match.index + match[0].length);
      if (match.length >= 2) {
        let directive_name = match[1];
        if (directive_name !== AGENT_DIRECTIVE_CMD) {
          // REMOVES THE "DIRECTIVE_PREFIX" from the directive name
          directive_name = match[1].substring(DIRECTIVE_PREFIX.length + 1)
        }
        else if (directive_name === AGENT_DIRECTIVE_CMD) {
          directive_name = this.AGENT_DIRECTIVE
        }
        directive = {
          name: directive_name
        };
        if (match[1] !== AGENT_DIRECTIVE_CMD && match.length >= 5 && match[4] && match[4].trim().length > 0) {
          directive.parameter = match[4];
        }
      }
    }
    return directive;
  }
}

module.exports = { DirWhenOpen };