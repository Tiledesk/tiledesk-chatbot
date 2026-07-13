const winston = require('../../utils/winston');
const { Logger } = require('../../Logger');
const { AnalyticsClient } = require('../../AnalyticsClient');
const SubagentStack = require('../SubagentStack');
const requestService = require('../../services/RequestService');
const SubagentResumeService = require('../../services/SubagentResumeService');

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
      console.log("(DirReplaceBotV4) Replace bot resbody: ", JSON.stringify(resbody));

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

      await SubagentResumeService.resumeParentFlow(parentState, this.context);
      callback(true);
    } catch (error) {
      winston.error("(DirReturnStack) error: ", error);
      this.logger.error("(DirReturnStack) Return to parent error: ", error);
      await subagentStack.push(this.requestId, parentState);
      callback(true);
    }
  }

}

module.exports = { DirReturnStack };
