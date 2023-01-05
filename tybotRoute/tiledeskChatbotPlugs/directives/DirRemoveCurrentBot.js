
class DirRemoveCurrentBot {

  constructor(config) {
    if (!config.tdclient) {
      throw new Error('tdclient (TiledeskClient) object is mandatory.');
    }
    this.tdclient = config.tdclient;
    this.requestId = config.requestId;
  }

  execute(directive, callback) {
    console.log("Remove current bot");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else if (directive.parameter) {
      action = {};
    }
    else {
      callback();
    }
    this.go(action, () => {
      callback();
    })
  }

  go(action, callback) {
    tdclient.removeCurrentBot(this.requestId, (err) => {
      callback();
    });
  }
}

module.exports = { DirRemoveCurrentBot };