const { Directives } = require("./Directives");

class DirMoveToAgent {

  constructor(settings) {
    if (!settings.tdclient) {
      throw new Error('settings.tdclient (TiledeskClient) object is mandatory.');
    }
    this.tdclient = settings.tdclient;

    if (!settings.requestId) {
      throw new Error('settings.requestId (TiledeskClient) object is mandatory.');
    }
    this.requestId = settings.requestId;

    if (!settings.depId) {
      throw new Error('settings.depId (TiledeskClient) object is mandatory.');
    }
    this.depId = settings.depId;
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
    if (action.body && action.body.whenOnlineOnly === true) {
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