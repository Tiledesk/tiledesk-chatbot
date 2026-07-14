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

class DirReplaceBotV4 {

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
    winston.verbose("Execute ReplaceBotV4 directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirReplaceBotV4 Incorrect directive: ", directive);
      callback();
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Replace Bot] Executed");
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("(DirReplaceBotV4) Action: ", action);
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
      nextBlock: intentAction
    }
    await subagentStack.push(this.requestId, stackData);
    console.log(`*** Session added to the stack for bot ${this.context.chatbot?.botId}`);

    try {
      const resbody = await requestService.replaceBot(this.context.projectId, this.requestId, data, this.context.token);
      console.log("*** Replace bot done: ", JSON.stringify(resbody));
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
      winston.error("(DirReplaceBotV4) error: ", error);
      this.logger.error("(ReplaceBot) Invoke subagent error: ", error);
      if (callback) {
        callback(true);
      }
      return;
    }

    if (blockName) {
      winston.debug("(DirReplaceBotV4) Sending hidden /start message to bot in dept");
      const message = {
        type: "text",
        text: "/" + blockName,
        attributes: {
          subtype: "info"
        }
      }
      console.log(`*** Sending hidden /start message to bot in dept: ${blockName}`);
      this.tdClient.sendSupportMessage(
        this.requestId,
        message, (err) => {
          if (err) {
            winston.debug("(DirReplaceBotV3) Error sending hidden message: " + err.message);
          }
          callback(true);
        });
    }
    else {
      callback();
    }
  }

}

module.exports = { DirReplaceBotV4 };
