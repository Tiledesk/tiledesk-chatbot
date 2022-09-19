
class DirReplaceBot {

  constructor(tdclient) {
    if (!tdclient) {
      throw new Error('tdclient (TiledeskClient) object is mandatory.');
    }
    this.tdclient = tdclient;
  }

  execute(directive, requestId, callback) {
    console.log("Replacing bot")
    if (directive.parameter) {
      let botName = directive.parameter.trim();
      this.tdclient.replaceBotByName(requestId, botName, () => {
        callback();
      });
    }
    else {
      callback();
    }
  }
}

module.exports = { DirReplaceBot };