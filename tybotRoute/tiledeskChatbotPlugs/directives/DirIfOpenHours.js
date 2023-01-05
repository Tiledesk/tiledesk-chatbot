const { DirIntent } = require('./directives/DirIntent');

class DirIfOpenHours {

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

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action
    }
    else if (directive.parameter) {
      action = {
        body: {
          intentName: directive.parameter
        }
      }
    }
    this.go(action, () => {
      callback();
    });
    
  }

  go(action, callback) {
    const intentName = action.body.intentName;
    if (!intentName) {
      if (this.log) {console.log("Invalid intent name for If-open-hours");}
      callback();
    }
    let intentDirective = {
      action: {
        body: {
          intentName: intentName
        }
      }
    }
    this.tdclient.openNow((err, result) => {
      if (this.log) {console.log("openNow():", result);}
      if (err) {
        console.error("Agent in DirWhenOpen Error:", err);
        callback();
        return;
      }
      else {
        if (result && result.isopen && this.checkOpen) {
          if (this.log) {console.log("execute the action on 'open'");}
          this.intentDir.execute(intentDirective, () => {
            callback();
          });
          return;
        }
        if (result && !result.isopen && this.checkOpen === false) {
          if (this.log) {console.log("execute the action on 'closed'");}
          this.intentDir.execute(intentDirective, () => {
            callback();
          });
          return;
        }
        if (this.log) {
          console.log("condition is checkOpen:", this.checkOpen);
          console.log("result.isopen:", result.isopen);
          console.log("condition not matched!");
        }
        callback();
      }
    });
  }

}

module.exports = { DirIfOpenHours };