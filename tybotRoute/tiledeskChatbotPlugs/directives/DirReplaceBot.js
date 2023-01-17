
class DirReplaceBot {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdclient = context.tdclient;
    this.requestId = context.requestId;
    this.log = log;
  }

  execute(directive, callback) {
    if (this.log) {console.log("Replacing bot");}
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else if (directive.parameter) {
      let botName = directive.parameter.trim();
      action = {
        body: {
          botName: botName
        }
      }
    }
    else {
      callback();
    }
    this.go(action, () => {
      callback();
    })
  }

  go(action, callback) {
    this.tdclient.replaceBotByName(this.requestId, action.body.botName, () => {
      callback();
    });
  }
}

module.exports = { DirReplaceBot };