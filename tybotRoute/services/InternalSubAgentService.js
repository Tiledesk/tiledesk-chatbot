const { v4: uuidv4 } = require('uuid');
const { Filler } = require('../tiledeskChatbotPlugs/Filler');
const winston = require('../utils/winston');

const STATUS = {
  STARTED: 'started',
  RUNNING: 'running',
  PROGRESS: 'progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  TIMEOUT: 'timeout'
};

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_TTL_SECONDS = 86400;

class InternalSubAgentService {

  static agentFromSubBot(subBot, subagentId) {
    if (!subagentId) {
      return null;
    }
    return {
      key: subagentId,
      id: subBot && subBot._id ? subBot._id : subagentId,
      name: subBot && subBot.name ? subBot.name : subagentId,
      botId: subagentId,
      type: 'internal_flow',
      timeoutMs: subBot && subBot.attributes ? subBot.attributes.subAgentTimeoutMs : undefined
    };
  }

  static intentCommand(intentName) {
    if (!intentName || typeof intentName !== 'string') {
      return null;
    }
    const trimmed = intentName.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }

  static webhookTopic(requestId) {
    return `/webhooks/${requestId}`;
  }

  static runKey(parentRequestId, runId) {
    return `tilebot:requests:${parentRequestId}:subagents:${runId}`;
  }

  static newRunId() {
    return uuidv4().replace(/-/g, '');
  }

  static buildSubRequestId(projectId, runId) {
    return `automation-request-${projectId}-${runId}`;
  }

  static timeoutMs(agent, action) {
    const timeout = action.timeoutMs || action.timeout || (agent && agent.timeoutMs) || DEFAULT_TIMEOUT_MS;
    const asNumber = Number(timeout);
    if (!Number.isFinite(asNumber) || asNumber <= 0) {
      return DEFAULT_TIMEOUT_MS;
    }
    return Math.round(asNumber);
  }

  static ttlSeconds(timeoutMs) {
    return Math.max(DEFAULT_TTL_SECONDS, Math.ceil(timeoutMs / 1000) + 3600);
  }

  static async createRun(tdcache, params) {
    const runId = params.runId || InternalSubAgentService.newRunId();
    const timeoutMs = InternalSubAgentService.timeoutMs(params.agent, params.action || {});
    const now = Date.now();
    const agent = params.agent || {};
    const run = {
      schemaVersion: 1,
      runId: runId,
      parentRequestId: params.parentRequestId,
      subRequestId: InternalSubAgentService.buildSubRequestId(params.projectId, runId),
      projectId: params.projectId,
      parentBotId: params.parentBotId,
      subagentId: params.subagentId || agent.key || agent.id,
      agentKey: agent.key || agent.name || params.subagentId,
      agentName: agent.name,
      type: agent.type || 'internal_flow',
      mode: params.mode || 'fire_and_continue',
      status: STATUS.RUNNING,
      input: params.input || {},
      output: null,
      error: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + timeoutMs,
      timeoutMs: timeoutMs
    };

    await InternalSubAgentService.saveRun(tdcache, run);
    return run;
  }

  static async saveRun(tdcache, run) {
    if (!tdcache) {
      throw new Error('tdcache is mandatory');
    }
    const ttl = InternalSubAgentService.ttlSeconds(run.timeoutMs);
    await tdcache.set(
      InternalSubAgentService.runKey(run.parentRequestId, run.runId),
      JSON.stringify(run),
      { EX: ttl }
    );
    return run;
  }

  static async getRun(tdcache, parentRequestId, runId) {
    if (!tdcache || !parentRequestId || !runId) {
      return null;
    }

    const json = await tdcache.get(InternalSubAgentService.runKey(parentRequestId, runId));
    if (!json) {
      return null;
    }

    try {
      return JSON.parse(json);
    } catch (error) {
      winston.error('(InternalSubAgentService) Error parsing run state: ', error);
      return null;
    }
  }

  static async updateRun(tdcache, parentRequestId, runId, patch) {
    const run = await InternalSubAgentService.getRun(tdcache, parentRequestId, runId);
    if (!run) {
      return null;
    }

    const updated = {
      ...run,
      ...patch,
      updatedAt: Date.now()
    };

    await InternalSubAgentService.saveRun(tdcache, updated);
    return updated;
  }

  static isTerminalStatus(status) {
    return status === STATUS.COMPLETED ||
      status === STATUS.FAILED ||
      status === STATUS.TIMEOUT;
  }

  static isWebhookSuccess(status) {
    const code = Number(status);
    return Number.isFinite(code) && code >= 200 && code < 300;
  }

  static fillValue(value, parameters) {
    const filler = new Filler();

    if (typeof value === 'string') {
      return filler.fill(value, parameters);
    }

    if (Array.isArray(value)) {
      return value.map((item) => InternalSubAgentService.fillValue(item, parameters));
    }

    if (value && typeof value === 'object') {
      return Object.entries(value).reduce((acc, [key, item]) => {
        acc[key] = InternalSubAgentService.fillValue(item, parameters);
        return acc;
      }, {});
    }

    return value;
  }

  static buildSubAgentMessage(context, run, command) {
    const payload = {
      ...(run.input || {}),
      _tdSubAgent: {
        runId: run.runId,
        parentRequestId: run.parentRequestId,
        subRequestId: run.subRequestId,
        agentKey: run.agentKey,
        subagentId: run.subagentId,
        mode: run.mode
      }
    };

    return {
      payload: {
        _id: uuidv4(),
        senderFullname: '_tdinternal',
        type: 'text',
        sender: '_tdinternal',
        recipient: run.subRequestId,
        text: command,
        id_project: run.projectId,
        attributes: {
          payload: payload
        },
        request: {
          request_id: run.subRequestId,
          id_project: run.projectId,
          draft: context.supportRequest && context.supportRequest.draft,
          attributes: {
            payload: payload
          }
        }
      },
      token: context.token
    };
  }

  static buildParentContinuationMessage(context, intentName, event) {
    const intentCommand = InternalSubAgentService.intentCommand(intentName);
    return {
      payload: {
        _id: uuidv4(),
        senderFullname: '_tdinternal',
        type: 'text',
        sender: '_tdinternal',
        recipient: event.parentRequestId,
        text: intentCommand,
        id_project: context.projectId,
        attributes: {
          payload: {
            subAgentRun: event
          }
        },
        request: {
          request_id: event.parentRequestId,
          id_project: context.projectId,
          draft: context.supportRequest && context.supportRequest.draft
        }
      },
      token: context.token
    };
  }

  static async assignParentResult(tdcache, parentRequestId, action, event) {
    if (!tdcache || !parentRequestId || !action) {
      return;
    }

    const statusTarget = action.assignStatusTo || action.assign_status_to;
    const resultTarget = action.assignResultTo || action.assign_result_to;
    const errorTarget = action.assignErrorTo || action.assign_error_to;
    const runTarget = action.assignRunTo || action.assign_run_to;

    if (statusTarget) {
      await InternalSubAgentService.addParameter(tdcache, parentRequestId, statusTarget, event.status);
    }
    if (resultTarget && event.output !== undefined) {
      await InternalSubAgentService.addParameter(tdcache, parentRequestId, resultTarget, event.output);
    }
    if (errorTarget && event.error !== undefined) {
      await InternalSubAgentService.addParameter(tdcache, parentRequestId, errorTarget, event.error);
    }
    if (runTarget) {
      await InternalSubAgentService.addParameter(tdcache, parentRequestId, runTarget, event);
    }
  }

  static async addParameter(tdcache, requestId, parameterName, parameterValue) {
    if (!tdcache || parameterName === null || parameterName === undefined) {
      return;
    }
    const parameterKey = `tilebot:requests:${requestId}:parameters`;
    const parameterValueAsString = JSON.stringify(parameterValue);
    if (parameterValueAsString?.length > 20000000) {
      return;
    }
    await tdcache.hset(parameterKey, parameterName, parameterValueAsString);
  }

  static subAgentContext(requestAttributes, context) {
    const fromPayload = requestAttributes?.payload?._tdSubAgent || requestAttributes?._tdSubAgent;
    if (fromPayload?.parentRequestId) {
      return fromPayload;
    }

    const message = context && context.message;
    const supportRequest = context && context.supportRequest;
    const fromMessage = message?.attributes?.payload?._tdSubAgent
      || message?.request?.attributes?.payload?._tdSubAgent
      || supportRequest?.attributes?.payload?._tdSubAgent;

    return fromMessage || null;
  }

  static resolveOutboundRequestId(requestId, requestAttributes, context) {
    const subAgent = InternalSubAgentService.subAgentContext(requestAttributes, context);
    if (subAgent && subAgent.parentRequestId) {
      return subAgent.parentRequestId;
    }
    return requestId;
  }

  static async allParameters(tdcache, requestId) {
    if (!tdcache || !requestId) {
      return {};
    }

    const parametersKey = `tilebot:requests:${requestId}:parameters`;
    const attributesAsStringMap = await tdcache.hgetall(parametersKey);
    const attributes = {};

    if (attributesAsStringMap !== null) {
      for (const [key, value] of Object.entries(attributesAsStringMap)) {
        try {
          attributes[key] = JSON.parse(value);
        } catch (error) {
          winston.error('(InternalSubAgentService) Error parsing request parameter: ', error);
        }
      }
    }

    return attributes;
  }
}

module.exports = { InternalSubAgentService, INTERNAL_SUB_AGENT_STATUS: STATUS };
