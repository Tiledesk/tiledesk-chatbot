const { Filler } = require('../../variables/Filler');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { TiledeskChatbotUtil } = require('../../utils/TiledeskChatbotUtil');
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const winston = require('../../utils/winston');
const { BaseDirective } = require('../BaseDirective');
const { Directives } = require('../Directives');

class DirRandomReply extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.RANDOM_REPLY];

  constructor(context) {
    super(context);

    this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___" });
  }

  execute(directive, callback) {
    winston.verbose("Execute RandomReply directive");
    let action;
    if (directive.action) {
      action = directive.action;
      if (!action.attributes) {
        action.attributes = {}
      }
      action.attributes.fillParams = true;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirRandomReply Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, () => {
      this.logger.native("[Random Reply] Executed");
      callback();
    });
  }

  async go(action, callback) {
    winston.debug("(DirRandomReply) Action: ", action);
    const message = action;
    // fill
    let requestVariables = null;
    if (this.tdcache) {
      requestVariables = 
      await TiledeskChatbot.allParametersStatic(
        this.tdcache, this.requestId
      );

      const filler = new Filler();
      // fill text attribute
      message.text = filler.fill(message.text, requestVariables);
      winston.debug("(DirRandomReply) filling commands. Message: ", message);
      if (message.attributes && message.attributes.commands) {
        const rnd_commands = TiledeskChatbotUtil.chooseRandomReply(message);
        // chooseRandomReply returns null when the command list has an odd length
        // (it pairs each message with the wait in front of it). Assigning that
        // null over the real commands and then reading `.length` was a TypeError
        // inside the async go(): the conversation stalled with no reply at all.
        if (rnd_commands) {
          message.attributes.commands = rnd_commands;
        }
        let commands = message.attributes.commands;
        if (commands.length > 0) {
          for (let i = 0; i < commands.length; i++) {
            if (commands[i].type === 'message' && commands[i].message && commands[i].message.text) {
              commands[i].message.text = filler.fill(commands[i].message.text, requestVariables);
            }
          }
        }
      }

      // temporary send back of reserved attributes
      if (!message.attributes) {
        message.attributes = {}
      }
      // Reserved names: userEmail, userFullname
      // if (requestVariables['userEmail']) {
      //     message.attributes.updateUserEmail = requestVariables['userEmail'];
      // }
      // if (requestVariables['userFullname']) {
      //   message.attributes.updateUserFullname = requestVariables['userFullname'];
      // }
    }
    // send!
    winston.debug("(DirRandomReply) Reply:", message);
    this.tdClient.sendSupportMessage(
      this.requestId,
      message,
      (err) => {
        if (err) {
          winston.debug("(DirRandomReply) Error sending reply: " + err.message);
        }
        winston.debug("(DirRandomReply) Reply message sent.")
        callback();
    });
  }
}

module.exports = { DirRandomReply };