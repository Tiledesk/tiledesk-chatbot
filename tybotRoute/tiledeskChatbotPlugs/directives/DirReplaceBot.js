const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { Filler } = require('../Filler');
const winston = require('../../utils/winston');
const { BaseDirective } = require('../BaseDirective');
const { Directives } = require('./Directives');

class DirReplaceBot extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.REPLACE_BOT];

  constructor(context) {
    super(context);

    this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___" });
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
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirReplaceBot Incorrect directive: ", directive);
      callback();
    }
    this.go(action, () => {
      this.logger.native("[Replace Bot] Executed");
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