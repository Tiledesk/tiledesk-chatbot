const { v4: uuidv4 } = require('uuid');
const winston = require('../../utils/winston');
const { Logger } = require('../../Logger');
const { AnalyticsClient } = require('../../AnalyticsClient');
const SubagentStack = require('../SubagentStack');
const requestService = require('../../services/RequestService');
const tilebotService = require('../../services/TilebotService');

class DirReturnStack {

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
    winston.verbose("Execute ReturnStack directive");
    let action;
    if (directive.action) {
      action = directive.action;
    }
    else {
      this.logger.error("Incorrect action for ", directive.name, directive)
      winston.warn("DirReturnStack Incorrect directive: ", directive);
      callback(true);
      return;
    }
    this.go(action, (stop) => {
      this.logger.native("[Return Stack] Executed");
      callback(stop);
    })
  }

  async go(action, callback) {
    winston.debug("(DirReturnStack) Action: ", action);

    if (!this.context.tdcache) {
      winston.error("(DirReturnStack) Error: tdcache is mandatory");
      callback(true);
      return;
    }

    const subagentStack = new SubagentStack({ tdCache: this.context.tdcache });
    const parentState = await subagentStack.pop(this.requestId);
    const stackSize = await subagentStack.size(this.requestId);

    if (!parentState || !parentState.parentBotId) {
      winston.error("(DirReturnStack) Error: subagent stack is empty or invalid");
      this.logger.error("(DirReturnStack) Subagent stack is empty or invalid");
      callback(true);
      return;
    }

    winston.info(
      "(Subagent) POP requestId=" + this.requestId +
      " parentBotId=" + parentState.parentBotId +
      " resumeIndex=" + parentState.resumeIndex +
      " remainingStackDepth=" + stackSize +
      " currentBotId=" + this.context.supportRequest?.bot_id
    );

    try {
      const resbody = await requestService.replaceBot(
        this.context.projectId,
        this.requestId,
        { id: parentState.parentBotId },
        this.context.token
      );

      winston.info(
        "(Subagent) REPLACE → parent requestId=" + this.requestId +
        " from=" + this.context.supportRequest?.bot_id +
        " to=" + (resbody?.replaced_bot_root_id || parentState.parentBotId)
      );

      if (this.context.chatbot?.bot?.root_id) {
        AnalyticsClient.track('agent.bot_switched', this.context.projectId, {
          from_agent_id: this.context.chatbot?.bot.root_id,
          to_agent_id: resbody?.replaced_bot_root_id || parentState.parentBotId || '',
          intent_name: this.context.reply?.attributes?.intent_info?.intent_name || null,
          request_id: this.requestId || null
        });
      }

      winston.info(
        "(Subagent) RESUME trigger requestId=" + this.requestId +
        " parentBotId=" + parentState.parentBotId +
        " resumeIndex=" + parentState.resumeIndex
      );

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
          winston.error("(DirReturnStack) Error triggering parent resume:", err);
          this.logger.error("(DirReturnStack) Error triggering parent resume:", err);
        }
        callback(true);
      });
    } catch (error) {
      winston.error("(DirReturnStack) error: ", error);
      this.logger.error("(DirReturnStack) Return to parent error: ", error);
      await subagentStack.push(this.requestId, parentState);
      callback(true);
    }
  }

}

module.exports = { DirReturnStack };
