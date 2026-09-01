const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { Filler } = require('../../variables/Filler');

const winston = require('../../utils/winston');
const { AnalyticsClient } = require('../../observability/AnalyticsClient');
const tiledeskApiService = require('../../services/TiledeskApiService');
const { BaseDirective } = require('../BaseDirective');
const { Directives } = require('../Directives');

class DirReplaceBotV2 extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.REPLACE_BOT_V2];

  constructor(context) {
    super(context);
  }

  execute(directive, callback) {
    winston.verbose("Execute ReplaceBotV2 directive");
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
      winston.warn("DirReplaceBotV2 Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, () => {
      this.logger.native("[Replace Bot] Executed");
      callback();
    })
  }

  async go(action, callback) {
    winston.debug("(DirReplaceBotV2) Action: ", action);
    let botName = action.botName;
    let blockName = action.blockName;
    let variables = null;
    variables = 
    await TiledeskChatbot.allParametersStatic(
      this.context.tdcache, this.context.requestId
    );
    const filler = new Filler();
    botName = filler.fill(botName, variables);

    let data = {};
    if (action.nameAsSlug && action.nameAsSlug === true) {
      data.slug = botName;
    } else {
      data.name = botName;
    }

    const { err, resbody } = await tiledeskApiService.replaceBot(
      this.context.projectId, this.requestId, this.context.token, data, "(DirReplaceBotV2)");

    if (err) {
      winston.error("(DirReplaceBotV2) DirReplaceBot error: ", err);
      if (callback) {
        callback();
        return;
      }
    }

    winston.debug("(DirReplaceBotV2) replace resbody: ", resbody)

    // Emit analytics event for bot switch. Only track published (production)
    // runs (root/draft copy has no root_id).
    if (this.context.chatbot?.bot.root_id) {
      AnalyticsClient.track('agent.bot_switched', this.context.projectId, {
        from_agent_id:  this.context.chatbot?.bot.root_id,
        to_agent_id:    resbody?.replaced_bot_root_id || botName || '',
        intent_name:    this.context.reply?.attributes?.intent_info?.intent_name || null,
        request_id:     this.requestId || null
      });
    }

    if (blockName) {
      winston.debug("(DirReplaceBotV2) Sending hidden /start message to bot in dept");
      const message = {
        type: "text",
        text: "/" + blockName,
        attributes: {
          subtype: "info"
        }
      }
      tiledeskApiService.sendSupportMessage(
        this.context.projectId,
        this.requestId,
        this.context.token,
        message, (err) => {
          if (err) {
            winston.debug("(DirReplaceBotV2) Error sending hidden message: " + err.message);
          }
          callback();
        });
    }
    else {
      callback();
    }

    // this.tdClient.replaceBotByName(this.requestId, botName, () => {
    //   if (blockName) {
    //     const message = {
    //       type: "text",
    //       text: "/" + blockName,
    //       attributes : {
    //         subtype: "info"
    //       }
    //     }
    //     this.tdClient.sendSupportMessage(
    //       this.requestId,
    //       message, (err) => {
    //         if (err) {
    //           winston.error("Error sending hidden message:", err.message);
    //         }
    //         callback();
    //     });
    //   }
    //   else {
    //     callback();
    //   }
    // });
  }

}

module.exports = { DirReplaceBotV2 };
