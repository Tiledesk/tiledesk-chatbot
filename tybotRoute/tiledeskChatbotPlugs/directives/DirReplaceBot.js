const { TiledeskChatbot } = require('../../models/TiledeskChatbot');
const { Filler } = require('../Filler');

class DirReplaceBot {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdclient = context.tdclient;
    this.requestId = context.requestId;
    this.log = context.log;
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
        // body: {
          botName: botName
        // }
      }
    }
    else {
      callback();
    }
    this.go(action, () => {
      callback();
    })
  }

  async go(action, callback) {
    let botName = action.botName;
    let variables = null;
    variables = 
    await TiledeskChatbot.allParametersStatic(
      this.context.tdcache, this.context.requestId
    );
    const filler = new Filler();
    botName = filler.fill(botName, variables);
    this.tdclient.replaceBotByName(this.requestId, botName, () => {
      callback();
    });
  }
}

module.exports = { DirReplaceBot };