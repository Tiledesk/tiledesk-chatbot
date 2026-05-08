const tilebotService = require('../../services/TilebotService');
const { InternalSubAgentService, INTERNAL_SUB_AGENT_STATUS } = require('../../services/InternalSubAgentService');
const { Logger } = require('../../Logger');
const winston = require('../../utils/winston');

class DirInvokeSubAgent {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.chatbot = context.chatbot;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.projectId = context.projectId;
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    const action = directive.action;
    if (!action) {
      this.logger.error('[Invoke Sub-Agent] Incorrect action for ', directive.name, directive);
      callback();
      return;
    }

    this.go(action, callback);
  }

  async go(action, callback) {
    if (!this.tdcache) {
      this.logger.error('[Invoke Sub-Agent] tdcache is mandatory');
      callback();
      return;
    }

    const agentKey = action.agentKey || action.agent || action.key;
    const agent = InternalSubAgentService.resolveAgent(this.chatbot.bot, agentKey);
    if (!agent) {
      await this.#assignImmediateFailure(action, `Internal sub-agent not found: ${agentKey}`);
      callback();
      return;
    }

    const command = InternalSubAgentService.flowCommand(agent);
    if (!command) {
      await this.#assignImmediateFailure(action, `Internal sub-agent has no mapped flow: ${agentKey}`);
      callback();
      return;
    }

    const mode = action.mode || (action.waitForResult ? 'wait_result' : 'fire_and_continue');
    const requestAttributes = await InternalSubAgentService.allParameters(this.tdcache, this.requestId);
    const rawInput = action.input || action.payload || {};
    const input = InternalSubAgentService.fillValue(rawInput, requestAttributes);

    let run;
    try {
      run = await InternalSubAgentService.createRun(this.tdcache, {
        projectId: this.projectId,
        parentRequestId: this.requestId,
        parentBotId: this.chatbot.botId,
        agent: agent,
        action: action,
        mode: mode,
        input: input
      });

      await this.#assignRun(action, run);
      await InternalSubAgentService.publishEvent(this.tdcache, run, { status: INTERNAL_SUB_AGENT_STATUS.STARTED });

      if (mode === 'wait_result') {
        await this.#subscribeForResult(action, run);
      }

      const message = InternalSubAgentService.buildSubAgentMessage(this.context, agent, run);
      const botId = InternalSubAgentService.flowBotId(agent, this.chatbot.botId);

      tilebotService.sendMessageToBot(message, botId, async (err) => {
        if (err) {
          await this.#failRun(run, action, err);
        }
      });

      this.logger.native(`[Invoke Sub-Agent] Started ${run.agentKey} run ${run.runId}`);
      callback(mode === 'wait_result');
    } catch (error) {
      winston.error('(DirInvokeSubAgent) Error invoking sub-agent: ', error);
      await this.#assignImmediateFailure(action, error && error.message ? error.message : error);
      callback();
    }
  }

  async #assignRun(action, run) {
    if (action.assignRunIdTo) {
      await InternalSubAgentService.addParameter(this.tdcache, this.requestId, action.assignRunIdTo, run.runId);
    }
    if (action.assignSubRequestIdTo) {
      await InternalSubAgentService.addParameter(this.tdcache, this.requestId, action.assignSubRequestIdTo, run.subRequestId);
    }
    if (action.assignStatusTo) {
      await InternalSubAgentService.addParameter(this.tdcache, this.requestId, action.assignStatusTo, run.status);
    }
  }

  async #assignImmediateFailure(action, error) {
    if (action.assignStatusTo) {
      await InternalSubAgentService.addParameter(this.tdcache, this.requestId, action.assignStatusTo, INTERNAL_SUB_AGENT_STATUS.FAILED);
    }
    if (action.assignErrorTo) {
      await InternalSubAgentService.addParameter(this.tdcache, this.requestId, action.assignErrorTo, error);
    }
    this.logger.error('[Invoke Sub-Agent] ', error);
  }

  async #subscribeForResult(action, run) {
    const topic = InternalSubAgentService.topic(run.parentRequestId, run.runId);
    const listener = async (message) => {
      let event;
      try {
        event = JSON.parse(message);
      } catch (error) {
        winston.error('(DirInvokeSubAgent) Error parsing sub-agent event: ', error);
        return;
      }

      if (!InternalSubAgentService.isTerminalStatus(event.status)) {
        return;
      }

      await this.tdcache.unsubscribe(topic);
      await this.#handleTerminalEvent(action, event);
    };

    await this.tdcache.subscribe(topic, listener);

    setTimeout(async () => {
      const currentRun = await InternalSubAgentService.getRun(this.tdcache, run.parentRequestId, run.runId);
      if (!currentRun || InternalSubAgentService.isTerminalStatus(currentRun.status)) {
        return;
      }

      const timeoutRun = await InternalSubAgentService.updateRun(
        this.tdcache,
        run.parentRequestId,
        run.runId,
        {
          status: INTERNAL_SUB_AGENT_STATUS.TIMEOUT,
          error: {
            message: `Internal sub-agent timeout after ${run.timeoutMs} ms`
          }
        }
      );

      if (timeoutRun) {
        await InternalSubAgentService.publishEvent(this.tdcache, timeoutRun, {
          status: INTERNAL_SUB_AGENT_STATUS.TIMEOUT,
          error: timeoutRun.error
        });
      }
    }, run.timeoutMs);
  }

  async #handleTerminalEvent(action, event) {
    await InternalSubAgentService.assignParentResult(this.tdcache, this.requestId, action, event);

    const intentName = this.#continuationIntent(action, event.status);
    if (!intentName) {
      return;
    }

    const message = InternalSubAgentService.buildParentContinuationMessage(this.context, intentName, event);
    tilebotService.sendMessageToBot(message, this.chatbot.botId, () => {
      winston.debug('(DirInvokeSubAgent) Parent continuation sent');
    });
  }

  async #failRun(run, action, error) {
    const failedRun = await InternalSubAgentService.updateRun(
      this.tdcache,
      run.parentRequestId,
      run.runId,
      {
        status: INTERNAL_SUB_AGENT_STATUS.FAILED,
        error: {
          message: error && error.message ? error.message : error
        }
      }
    );

    if (failedRun) {
      await InternalSubAgentService.publishEvent(this.tdcache, failedRun, {
        status: INTERNAL_SUB_AGENT_STATUS.FAILED,
        error: failedRun.error
      });
    }

    if (failedRun && action.mode !== 'wait_result' && action.assignErrorTo) {
      await InternalSubAgentService.addParameter(this.tdcache, this.requestId, action.assignErrorTo, failedRun.error);
    }
  }

  #continuationIntent(action, status) {
    if (status === INTERNAL_SUB_AGENT_STATUS.COMPLETED) {
      return action.onCompletedIntent || action.onCompleteIntent || action.thenIntent;
    }
    if (status === INTERNAL_SUB_AGENT_STATUS.TIMEOUT) {
      return action.onTimeoutIntent || action.onFailedIntent;
    }
    return action.onFailedIntent;
  }
}

module.exports = { DirInvokeSubAgent };
