const { InternalSubAgentService, INTERNAL_SUB_AGENT_STATUS } = require('../../services/InternalSubAgentService');
const { Logger } = require('../../Logger');
const winston = require('../../utils/winston');

class DirSubAgentResponse {

  constructor(context) {
    if (!context) {
      throw new Error('context object is mandatory.');
    }
    this.context = context;
    this.tdcache = context.tdcache;
    this.requestId = context.requestId;
    this.logger = new Logger({ request_id: this.requestId, dev: this.context.supportRequest?.draft, intent_id: this.context.reply?.attributes?.intent_info?.intent_id });
  }

  execute(directive, callback) {
    const action = directive.action;
    if (!action) {
      this.logger.error('[Sub-Agent Response] Incorrect action for ', directive.name, directive);
      callback();
      return;
    }

    this.go(action, callback);
  }

  async go(action, callback) {
    if (!this.tdcache) {
      this.logger.error('[Sub-Agent Response] tdcache is mandatory');
      callback();
      return;
    }

    try {
      const requestAttributes = await InternalSubAgentService.allParameters(this.tdcache, this.requestId);
      const metadata = this.#metadata(action, requestAttributes);

      if (!metadata || !metadata.runId || !metadata.parentRequestId) {
        this.logger.error('[Sub-Agent Response] Missing _tdSubAgent metadata');
        callback();
        return;
      }

      const status = action.status || INTERNAL_SUB_AGENT_STATUS.COMPLETED;
      const output = InternalSubAgentService.fillValue(action.output || action.payload || {}, requestAttributes);
      const error = action.error ? InternalSubAgentService.fillValue(action.error, requestAttributes) : null;
      const progress = action.progress ? InternalSubAgentService.fillValue(action.progress, requestAttributes) : null;
      const currentRun = await InternalSubAgentService.getRun(this.tdcache, metadata.parentRequestId, metadata.runId);

      if (!currentRun) {
        this.logger.error(`[Sub-Agent Response] Run not found: ${metadata.runId}`);
        callback();
        return;
      }

      if (InternalSubAgentService.isTerminalStatus(currentRun.status) && InternalSubAgentService.isTerminalStatus(status)) {
        this.logger.warn(`[Sub-Agent Response] Ignoring duplicate terminal event for run ${metadata.runId}`);
        callback(action.stop !== false);
        return;
      }

      const run = await InternalSubAgentService.updateRun(
        this.tdcache,
        metadata.parentRequestId,
        metadata.runId,
        {
          status: status,
          output: output,
          error: error,
          lastProgress: progress
        }
      );

      await InternalSubAgentService.publishEvent(this.tdcache, run, {
        status: status,
        output: output,
        error: error,
        progress: progress
      });

      this.logger.native(`[Sub-Agent Response] Published ${status} for run ${metadata.runId}`);
      const defaultStop = InternalSubAgentService.isTerminalStatus(status);
      callback(action.stop !== undefined ? action.stop : defaultStop);
    } catch (error) {
      winston.error('(DirSubAgentResponse) Error publishing sub-agent response: ', error);
      this.logger.error('[Sub-Agent Response] Error publishing response: ', error);
      callback();
    }
  }

  #metadata(action, requestAttributes) {
    if (action.runId && action.parentRequestId) {
      return {
        runId: action.runId,
        parentRequestId: action.parentRequestId
      };
    }
    return requestAttributes._tdSubAgent;
  }
}

module.exports = { DirSubAgentResponse };
