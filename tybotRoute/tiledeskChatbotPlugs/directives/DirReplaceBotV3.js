const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { Filler } = require('../Filler');

const winston = require('../../utils/winston');
const { AnalyticsClient } = require('../../observability/AnalyticsClient');
const tiledeskApiService = require('../../services/TiledeskApiService');
const { BaseDirective } = require('../BaseDirective');
const { Directives } = require('./Directives');

class DirReplaceBotV3 extends BaseDirective {

  /** Directive names dispatched to this class (see directives/registry.js). */
  static directiveNames = [Directives.REPLACE_BOT_V3];

  constructor(context) {
    super(context);
  }

  execute(directive, callback) {
    winston.verbose("Execute ReplaceBotV3 directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirReplaceBotV3 Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, () => {
      this.logger.native("[Replace Bot] Executed");
      callback();
    })
  }

  async go(action, callback) {
    winston.debug("(DirReplaceBotV3) Action: ", action);
    let botId = action.botId;
    let botSlug = action.botSlug;
    let useSlug = action.useSlug;
    let blockName = action.blockName;
    let variables = null;
    variables = 
    await TiledeskChatbot.allParametersStatic(
      this.context.tdcache, this.context.requestId
    );
    const filler = new Filler();
    //botId = filler.fill(botId, variables);
    botSlug = filler.fill(botSlug, variables);
    blockName = filler.fill(blockName, variables);

    let data = {};
    if (useSlug && useSlug === true) {
      data.slug = botSlug;
    } else {
      data.id = botId;
    }

    const { err, resbody } = await tiledeskApiService.replaceBot(
      this.context.projectId, this.requestId, this.context.token, data, "(DirReplaceBotV3)");

    if (err) {
      winston.error("(DirReplaceBotV3) error: ", err);
      if (callback) {
        callback();
        return;
      }
    }

    winston.debug("(DirReplaceBotV3)  replace resbody: ", resbody);

    // Emit analytics event for bot switch. Only track published (production)
    // runs (root/draft copy has no root_id).
    if (this.context.chatbot?.bot.root_id) {
      AnalyticsClient.track('agent.bot_switched', this.context.projectId, {
        from_agent_id:  this.context.chatbot?.bot.root_id,
        to_agent_id:    resbody?.replaced_bot_root_id || (useSlug ? botSlug : botId) || '',
        intent_name:    this.context.reply?.attributes?.intent_info?.intent_name || null,
        request_id:     this.requestId || null
      });
    }

    if (blockName) {
      winston.debug("(DirReplaceBotV3) Sending hidden /start message to bot in dept");
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
            winston.debug("(DirReplaceBotV3) Error sending hidden message: " + err.message);
          }
          callback();
        });
    }
    else {
      callback();
    }
  }

}

module.exports = { DirReplaceBotV3 };
