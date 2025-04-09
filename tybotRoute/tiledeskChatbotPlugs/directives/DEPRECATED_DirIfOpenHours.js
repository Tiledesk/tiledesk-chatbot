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
      APIKEY: "___"
    });
    // let context =  {
    //   projectId: projectId,
    //   token: token,
    //   requestId: supportRequest,
    //   APIURL: API_URL,
    //   TILEBOT_ENDPOINT:TILEBOT_ENDPOINT,
    //   departmentId: depId,
    // }
    this.intentDir = new DirIntent(
      {
        API_ENDPOINT: context.TILEDESK_APIURL,
        TILEBOT_ENDPOINT: context.TILEBOT_ENDPOINT,
        supportRequest: context.supportRequest,
        token: context.token,
      }
    )
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
      if (err) {
        console.error("DirIfOpenHours Error:", err);
        callback();
      }
      else if (result && result.isopen) {
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