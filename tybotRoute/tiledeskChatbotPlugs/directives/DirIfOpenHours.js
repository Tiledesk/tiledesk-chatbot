const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { DirIntent } = require('./DirIntent');

class DirIfOpenHours {

  constructor(context) {
    if (!context) {
      throw new Error('config (TiledeskClient) object is mandatory.');
    }
    // this.tdclient = config.tdclient;
    this.tdclient = new TiledeskClient({
      projectId: context.projectId,
      token: context.token,
      APIURL: context.TILEDESK_APIURL,
      APIKEY: "___",
      log: context.log
    });
    // this.intentDir = config.intentDir;
    // let context =  {
    //   projectId: projectId,
    //   token: token,
    //   requestId: supportRequest,
    //   APIURL: API_URL,
    //   TILEBOT_ENDPOINT:TILEBOT_ENDPOINT,
    //   departmentId: depId,
    //   log: false
    // }
    this.intentDir = new DirIntent(
      {
        API_ENDPOINT: context.API_URL,
        TILEBOT_ENDPOINT: context.TILEBOT_ENDPOINT,
        supportRequest: context.supportRequest,
        token: context.token,
        log: context.log
      }
    );
    this.log = context.log;
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
        console.error("DirIfOpenHours Error:", err);
        callback();
      }
      else if (result && result.isopen) {
        if (this.log) {console.log("executing the action on 'open'");}
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

module.exports = { DirIfOpenHours };