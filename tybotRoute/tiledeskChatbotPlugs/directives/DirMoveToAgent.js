const { Directives } = require("./Directives");
const { DirectivesToActions } = require("./DirectivesToActions");

class DirMoveToAgent {

  constructor(tdclient) {
    if (!tdclient) {
      throw new Error('tdclient (TiledeskClient) object is mandatory.');
    }
    this.tdclient = tdclient;
  }

  execute(directive, requestId, depId, callback) {
    //console.log("DirMoveToAgent...")
    if (directive.whenOnlineOnly === true) {
      this.tdclient.openNow((err, result) => {
        if (err) {
          console.error("Agent in DirOfflineHours Error:", err);
          callback();
        }
        else {
          if (result && result.isopen) {
            this.tdclient.agent(requestId, depId, (err) => {
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
      this.tdclient.agent(requestId, depId, (err) => {
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

  actionToDirective(action) {
    let directive = {
      name: Directives.AGENT
    }
    return directive;
  }
}

module.exports = { DirMoveToAgent };