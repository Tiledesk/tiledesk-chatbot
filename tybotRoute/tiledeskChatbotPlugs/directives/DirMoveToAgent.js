const { TiledeskClient } = require('@tiledesk/tiledesk-client');

class DirMoveToAgent {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    // let context =  {
    //   projectId: projectId,
    //   token: token,
    //   supportRequest: supportRequest,
    //   requestId: supportRequest.request_id,
    //   TILEDESK_APIURL: API_URL,
    //   TILEBOT_ENDPOINT:TILEBOT_ENDPOINT,
    //   departmentId: depId,
    //   tdcache: tdcache,
    //   log: false
    // }
    // new TiledeskClient({
    //   projectId: context.projectId,
    //   token: context.token,
    //   APIURL: context.TILEDESK_APIURL,
    //   APIKEY: "___",
    //   log: context.log
    // });
    this.tdclient = context.tdclient;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.depId = context.departmentId;
    this.log = context.log;
  }

  execute(directive, callback) {
    let action;
    if (directive.action) {
      action = directive.action;
      this.go(action, () => {
        callback();
      });
    }
    else {
      callback();
    }
  }

  go(action, callback) {
    if (action.whenOnlineOnly === true) {
      this.tdclient.openNow((err, result) => {
        if (err) {
          console.error("Agent in DirOfflineHours Error:", err);
          callback();
        }
        else {
          if (result && result.isopen) {
            this.tdclient.agent(this.requestId, this.depId, (err) => {
              if (err) {
                console.error("Error moving to agent during online hours:", err);
              }
              else {
                //console.log("Successfully moved to agent during online hours");
              }
              callback();
            });
          }
          else {
            callback();
          }
        }
      });
    }
    else {
      this.tdclient.agent(this.requestId, this.depId, (err) => {
        if (err) {
          console.error("Error moving to agent:", err);
        }
        else {
          //console.log("Successfully moved to agent");
        }
        callback();
      });
    }
  }

}

module.exports = { DirMoveToAgent };