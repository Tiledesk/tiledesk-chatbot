const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { DirIntent } = require('./DirIntent');
const ms = require('minimist-string');

class DirIfOpenHours {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.tdclient = context.tdclient;
    // this.tdclient = new TiledeskClient({
    //   projectId: context.projectId,
    //   token: context.token,
    //   APIURL: context.TILEDESK_APIURL,
    //   APIKEY: "___",
    //   log: context.log
    // });
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
        API_ENDPOINT: context.TILEDESK_APIURL,
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
      let params;
      params = this.parseParams(directive.parameter);
      if (!params.trueIntent && !params.falseIntent) {
        if (this.log) {
          console.log("missing both params.trueIntent & params.falseIntent");
        }
        callback();
        return;
      }
      action = {
        body: {
          trueIntent: params.trueIntent,
          falseIntent: params.falseIntent
        }
      }
    }
    else {
      callback();
      return;
    }
    this.go(action, () => {
      callback();
    });
  }

  go(action, callback) {
    this.tdclient.openNow((err, result) => {
      if (this.log) {console.log("openNow():", result);}
      if (err) {
        console.error("DirIfOpenHours Error:", err);
        callback();
      }
      else if (result && result.isopen) {
        if (action.body.trueIntent) {
          let intentDirective = DirIntent.intentDirectiveFor(action.body.trueIntent);
          if (this.log) {console.log("agents (openHours) => trueIntent");}
          this.intentDir.execute(intentDirective, () => {
            callback();
          });
        }
        else {
          callback();
          return;
        }
      }
      else if (action.body.falseIntent) {
        let intentDirective = DirIntent.intentDirectiveFor(action.body.falseIntent);
        if (this.log) {console.log("!agents (openHours) => falseIntent", action.body.falseIntent);}
        this.intentDir.execute(intentDirective, () => {
          callback();
        });
      }
      else {
        callback();
      }
    });
  }

  // intentDirectiveFor(intent) {
  //   let intentDirective = {
  //     action: {
  //       body: {
  //         intentName: intent
  //       }
  //     }
  //   }
  //   return intentDirective;
  // }

  parseParams(directive_parameter) {
    let trueIntent = null;
    let falseIntent = null;
    const params = ms(directive_parameter);
    if (params.trueIntent) {
      trueIntent = params.trueIntent;
    }
    if (params.falseIntent) {
      falseIntent = params.falseIntent;
    }
    return {
      trueIntent: trueIntent,
      falseIntent: falseIntent
    }
  }

}

module.exports = { DirIfOpenHours };