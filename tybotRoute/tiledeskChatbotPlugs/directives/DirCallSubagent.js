const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { TiledeskChatbot } = require('../../engine/TiledeskChatbot');
const { Filler } = require('../Filler');

const axios = require("axios").default;
let https = require("https");
const winston = require('../../utils/winston');
const httpUtils = require('../../utils/HttpUtils');
const { Logger } = require('../../Logger');
const { AnalyticsClient } = require('../../AnalyticsClient');
const { SubagentStack } = require('../SubagentStack');
const requestService = require('../../services/RequestService');

class DirCallSubAgent {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.requestId = context.requestId;
    this.API_ENDPOINT = context.API_ENDPOINT;
    
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.intent_id || this.context.reply?.attributes?.intent_info?.intent_id });
    this.tdClient = new TiledeskClient({ projectId: this.context.projectId, token: this.context.token, APIURL: this.API_ENDPOINT, APIKEY: "___" });
  }

  execute(directive, callback) {
    winston.verbose("Execute CallSubAgent directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirCallSubAgent Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Call SubAgent] Executed");
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("(DirCallSubAgent) Action: ", action);
    let botId = action.botId;
    let botSlug = action.botSlug;
    let useSlug = action.useSlug;
    let blockName = action.blockName;

    const variables = 
    await TiledeskChatbot.allParametersStatic(
      this.context.tdcache, this.context.requestId
    );

    const filler = new Filler();

    botSlug = filler.fill(botSlug, variables);
    blockName = filler.fill(blockName, variables);

    let data = {};
    if (useSlug && useSlug === true) {
      data.slug = botSlug;
    } else {
      data.id = botId;
    }

    const subagentStack = new SubagentStack({ tdCache: this.context.tdcache });
    const intentAction = this.context.reply.actions.find(action => action._tdActionType === "intent");

    const stackData = {
      parentId: this.context.chatbot?.botId,
      parentToken: this.context.token,
      nextBlock: intentAction
    }
    await subagentStack.push(this.requestId, stackData);

    try {
      const resbody = await requestService.replaceBot(this.context.projectId, this.requestId, data, this.context.token);
      if (this.context.chatbot?.bot.root_id) {
        AnalyticsClient.track('agent.bot_switched', this.context.projectId, {
          from_agent_id:  this.context.chatbot?.bot.root_id,
          to_agent_id:    resbody?.replaced_bot_root_id || (useSlug ? botSlug : botId) || '',
          intent_name:    this.context.reply?.attributes?.intent_info?.intent_name || null,
          request_id:     this.requestId || null
        });
      }
    } catch (error) {
      await subagentStack.pop(this.requestId);
      winston.error("(DirCallSubAgent) error: ", error);
      this.logger.error("(ReplaceBot) Invoke subagent error: ", error);
      if (callback) {
        callback(true);
      }
      return;
    }

    if (blockName) {
      winston.debug("(DirCallSubAgent) Sending hidden /start message to bot in dept");
      const message = {
        type: "text",
        text: "/" + blockName,
        attributes: {
          subtype: "info"
        }
      }
      this.tdClient.sendSupportMessage(
        this.requestId,
        message, (err) => {
          if (err) {
            winston.debug("(DirCallSubAgent) Error sending hidden message: " + err.message);
          }
          callback(true);
        });
    }
    else {
      callback();
    }
  }

}

module.exports = { DirCallSubAgent };
