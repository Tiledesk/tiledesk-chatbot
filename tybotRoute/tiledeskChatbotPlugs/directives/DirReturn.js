const { v4: uuidv4 } = require('uuid');
const winston = require('../../utils/winston');
const { Logger } = require('../../Logger');
const { AnalyticsClient } = require('../../AnalyticsClient');
const SubagentStack = require('../SubagentStack');
const requestService = require('../../services/RequestService');
const tilebotService = require('../../services/TilebotService');

class DirReturn {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.requestId = context.requestId;
    this.logger = new Logger({
      request_id: this.requestId,
      dev: this.context.supportRequest?.draft,
      intent_id: this.context.reply?.intent_id || this.context.reply?.attributes?.intent_info?.intent_id
    });
  }

  execute(directive, callback) {
    winston.verbose("Execute Return directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirReturn Incorrect directive: ", directive);
      callback(true);
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Return] Executed");
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("(DirReturn) Action: ", action);

    if (!this.context.tdcache) {
      winston.error("(DirReturn) Error: tdcache is mandatory");
      callback(true);
      return;
    }

    const subagentStack = new SubagentStack({ tdCache: this.context.tdcache });
    const parentState = await subagentStack.pop(this.requestId);

    if (!parentState || !parentState.parentBotId) {
      winston.error("(DirReturn) Error: subagent stack is empty or invalid");
      this.logger.error("(DirReturn) Subagent stack is empty or invalid");
      callback(true);
      return;
    }

    try {
      const resbody = await requestService.replaceBot(
        this.context.projectId,
        this.requestId,
        { id: parentState.parentBotId },
        this.context.token
      );

      if (this.context.chatbot?.bot?.root_id) {
        AnalyticsClient.track('agent.bot_switched', this.context.projectId, {
          from_agent_id: this.context.chatbot?.bot.root_id,
          to_agent_id: resbody?.replaced_bot_root_id || parentState.parentBotId || '',
          intent_name: this.context.reply?.attributes?.intent_info?.intent_name || null,
          request_id: this.requestId || null
        });
      }

      const resumeRequest = {
        payload: {
          _id: uuidv4(),
          senderFullname: "_tdinternal",
          type: "text",
          sender: "_tdinternal",
          recipient: this.requestId,
          text: "/",
          id_project: this.context.projectId,
          attributes: {
            subagentResume: true,
            subagentResumeState: parentState
          },
          request: {
            request_id: this.requestId,
            id_project: this.context.projectId,
            bot_id: parentState.parentBotId,
            draft: parentState.supportRequest?.draft
          }
        },
        token: this.context.token
      };

      tilebotService.sendMessageToBot(resumeRequest, parentState.parentBotId, (err) => {
        if (err) {
          winston.error("(DirReturn) Error triggering parent resume:", err);
          this.logger.error("(DirReturn) Error triggering parent resume:", err);
        }
        callback(true);
      });
    } catch (error) {
      winston.error("(DirReturn) error: ", error);
      this.logger.error("(DirReturn) Return to parent error: ", error);
      await subagentStack.push(this.requestId, parentState);
      callback(true);
    }
  }

}

module.exports = { DirReturn };
