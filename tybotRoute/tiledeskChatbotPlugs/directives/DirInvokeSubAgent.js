const tilebotService = require('../../services/TilebotService');
const { InternalSubAgentService, INTERNAL_SUB_AGENT_STATUS } = require('../../services/InternalSubAgentService');
const { TiledeskChatbotConst } = require('../../engine/TiledeskChatbotConst');
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

    if (!this.chatbot || !this.chatbot.botsDataSource) {
      await this.#assignImmediateFailure(action, 'botsDataSource is mandatory');
      callback();
      return;
    }

    const subagentId = action.subagent_id || action.agentKey || action.agent || action.key;
    if (!subagentId) {
      await this.#assignImmediateFailure(action, 'subagent_id is mandatory');
      callback();
      return;
    }

    let subBot;
    try {
      subBot = await this.chatbot.botsDataSource.getBotByIdCache(subagentId, this.tdcache);
    } catch (error) {
      winston.error('(DirInvokeSubAgent) Error loading sub-agent bot: ', error);
      await this.#assignImmediateFailure(action, error && error.message ? error.message : error);
      callback();
      return;
    }

    if (!subBot) {
      await this.#assignImmediateFailure(action, `Sub-agent bot not found: ${subagentId}`);
      callback();
      return;
    }

    const command = InternalSubAgentService.intentCommand(action.intentName);
    if (!command) {
      await this.#assignImmediateFailure(action, `Sub-agent intentName is required for: ${subagentId}`);
      callback();
      return;
    }

    const agent = InternalSubAgentService.agentFromSubBot(subBot, subagentId);
    const mode = this.#resolveMode(action);
    const waitForReturn = mode === 'wait_result';
    const requestAttributes = await InternalSubAgentService.allParameters(this.tdcache, this.requestId);
    const rawInput = action.input || action.payload || {};
    const input = InternalSubAgentService.fillValue(rawInput, requestAttributes);

    let run;
    try {
      run = await InternalSubAgentService.createRun(this.tdcache, {
        projectId: this.projectId,
        parentRequestId: this.requestId,
        parentBotId: this.chatbot.botId,
        subagentId: subagentId,
        agent: agent,
        action: action,
        mode: mode,
        input: input
      });

      await this.#assignRun(action, run);

      if (waitForReturn) {
        await this.#subscribeForReturn(action, run);
      }

      const message = InternalSubAgentService.buildSubAgentMessage(this.context, run, command);

      this.#dispatchToBot(message, subagentId, action, async (err) => {
        if (err) {
          await this.#failRun(run, action, err);
        }
      });

      this.logger.native(`[Invoke Sub-Agent] Started ${subagentId} run ${run.runId} (${mode})`);
      callback(waitForReturn);
    } catch (error) {
      winston.error('(DirInvokeSubAgent) Error invoking sub-agent: ', error);
      await this.#assignImmediateFailure(action, error && error.message ? error.message : error);
      callback();
    }
  }

  #resolveMode(action) {
    if (action.mode === 'wait_result' || action.mode === 'fire_and_continue') {
      return action.mode;
    }
    // Legacy aliases (awaitWebhookPublish / waitForResult)
    if (action.awaitWebhookPublish === true || action.waitForResult === true) {
      return 'wait_result';
    }
    return 'fire_and_continue';
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

  /**
   * Waits for DirReturn on the subagent request (same Redis pub/sub + ready key as DirWebResponse).
   */
  async #subscribeForReturn(action, run) {
    const topic = InternalSubAgentService.webhookTopic(run.subRequestId);
    const readyKey = TiledeskChatbotConst.redisWebhookReadyKey(run.subRequestId);
    let handled = false;

    const onReturnPayload = async (returnMessage, source) => {
      if (handled) {
        return;
      }
      handled = true;

      winston.verbose(`(DirInvokeSubAgent) Sub-agent return received via ${source} on ${topic}`);

      try {
        await this.tdcache.unsubscribe(topic);
      } catch (e) {
        winston.warn('(DirInvokeSubAgent) unsubscribe after return:', e);
      }
      await this.tdcache.del(readyKey).catch(() => {});

      const httpStatus = returnMessage.status !== undefined ? returnMessage.status : 200;
      const success = InternalSubAgentService.isWebhookSuccess(httpStatus);
      const terminalStatus = success ? INTERNAL_SUB_AGENT_STATUS.COMPLETED : INTERNAL_SUB_AGENT_STATUS.FAILED;
      const output = returnMessage.payload;
      const error = success ? null : {
        message: 'Sub-agent return returned error status',
        status: httpStatus,
        payload: output
      };

      const updatedRun = await InternalSubAgentService.updateRun(
        this.tdcache,
        run.parentRequestId,
        run.runId,
        {
          status: terminalStatus,
          output: output,
          error: error
        }
      );

      if (!updatedRun) {
        return;
      }

      const event = {
        status: terminalStatus,
        output: output,
        error: error,
        parentRequestId: run.parentRequestId,
        subRequestId: run.subRequestId,
        runId: run.runId
      };

      await InternalSubAgentService.assignParentResult(this.tdcache, this.requestId, action, event);
      await this.#continueParent(action, event, success);
    };

    const listener = async (message) => {
      let returnMessage;
      try {
        returnMessage = JSON.parse(message);
      } catch (error) {
        winston.error('(DirInvokeSubAgent) Error parsing return message: ', error);
        await onReturnPayload({ status: 500, payload: null }, 'pubsub-parse-error');
        return;
      }
      await onReturnPayload(returnMessage, 'pubsub');
    };

    winston.verbose(`(DirInvokeSubAgent) Subscribing for return on ${topic} (parent ${run.parentRequestId})`);
    await this.tdcache.subscribe(topic, listener);

    const pollIv = setInterval(async () => {
      if (handled) {
        clearInterval(pollIv);
        return;
      }
      try {
        const raw = await this.tdcache.get(readyKey);
        if (!raw) {
          return;
        }
        let returnMessage;
        try {
          returnMessage = JSON.parse(raw);
        } catch (error) {
          winston.error('(DirInvokeSubAgent) Error parsing return ready key: ', error);
          return;
        }
        clearInterval(pollIv);
        await onReturnPayload(returnMessage, 'redis-key');
      } catch (error) {
        winston.warn('(DirInvokeSubAgent) return ready key poll:', error);
      }
    }, 25);

    this.#scheduleTimeout(action, run, () => {
      clearInterval(pollIv);
    });
  }

  #dispatchToBot(message, botId, action, callback) {
    const useExt = action.useExt === true || action.dispatchViaExt === true;
    if (useExt) {
      tilebotService.sendMessageToBot(message, botId, callback);
      return;
    }
    tilebotService.executeBlock(message, botId, callback);
  }

  #scheduleTimeout(action, run, onTimeout) {
    setTimeout(async () => {
      const currentRun = await InternalSubAgentService.getRun(this.tdcache, run.parentRequestId, run.runId);
      if (!currentRun || InternalSubAgentService.isTerminalStatus(currentRun.status)) {
        if (onTimeout) {
          onTimeout();
        }
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

      if (timeoutRun && this.#resolveMode(action) === 'wait_result') {
        const event = {
          status: INTERNAL_SUB_AGENT_STATUS.TIMEOUT,
          error: timeoutRun.error,
          parentRequestId: run.parentRequestId,
          subRequestId: run.subRequestId,
          runId: run.runId
        };
        await InternalSubAgentService.assignParentResult(this.tdcache, this.requestId, action, event);
        await this.#continueParent(action, event, false);
      }

      if (onTimeout) {
        onTimeout();
      }
    }, run.timeoutMs);
  }

  async #continueParent(action, event, success) {
    const intentName = success
      ? (action.trueIntent || action.onCompletedIntent || action.onCompleteIntent || action.thenIntent)
      : (action.falseIntent || action.onFailedIntent || action.onTimeoutIntent);

    if (!intentName) {
      winston.warn('(DirInvokeSubAgent) No parent continuation intent configured on invoke_subagent action');
      return;
    }

    const message = InternalSubAgentService.buildParentContinuationMessage(this.context, intentName, event);
    winston.verbose(`(DirInvokeSubAgent) Continuing parent ${event.parentRequestId} -> ${intentName}`);
    this.#dispatchToBot(message, this.chatbot.botId, action, (err) => {
      if (err) {
        winston.error('(DirInvokeSubAgent) Parent continuation failed: ', err);
        return;
      }
      winston.debug('(DirInvokeSubAgent) Parent continuation dispatched');
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

    if (failedRun && this.#resolveMode(action) !== 'wait_result' && action.assignErrorTo) {
      await InternalSubAgentService.addParameter(this.tdcache, this.requestId, action.assignErrorTo, failedRun.error);
    }
  }
}

module.exports = { DirInvokeSubAgent };
