const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { Filler } = require('../Filler');
const winston = require('../../utils/winston');

class DirReplaceBot {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.requestId = context.requestId;

    this.API_ENDPOINT = context.API_ENDPOINT;
    this.tdClient = new TiledeskClient({
      projectId: this.context.projectId,
      token: this.context.token,
      APIURL: this.API_ENDPOINT,
      APIKEY: "___"
    });
  }

  execute(directive, callback) {
    winston.verbose("Execute ReplaceBot directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else if (directive.parameter) {
      let botName = directive.parameter.trim();
      action = {
        botName: botName
      }
    }
    else {
      winston.warn("DirReplaceBot Incorrect directive: ", directive);
      callback();
    }
    this.go(action, () => {
      callback();
    })
  }

  async go(action, callback) {
    winston.debug("(DirReplaceBot) Action: ", action);
    let botName = action.botName;
    let variables = null;
    variables = 
    await TiledeskChatbot.allParametersStatic(
      this.context.tdcache, this.context.requestId
    );
    const filler = new Filler();
    botName = filler.fill(botName, variables);
    this.tdClient.replaceBotByName(this.requestId, botName, () => {
      callback();
    });
  }
}

module.exports = { DirReplaceBot };