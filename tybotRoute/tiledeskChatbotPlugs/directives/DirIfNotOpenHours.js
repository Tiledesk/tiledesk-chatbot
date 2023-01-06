class DirIfNotOpenHours {

  constructor(config) {
    if (!config.tdclient) {
      throw new Error('config.tdclient (TiledeskClient) object is mandatory.');
    }
    this.intentDir = config.intentDir;
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
        console.error("DirIfNotOpenHours Error:", err);
        callback();
      }
      else if (result && !result.isopen) {
        if (this.log) {console.log("executing the action on 'closed'");}
        this.intentDir.execute(intentDirective, () => {
          callback();
        });
      }
      else {
        callback();
      }
    });
  }

}

module.exports = { DirIfNotOpenHours };