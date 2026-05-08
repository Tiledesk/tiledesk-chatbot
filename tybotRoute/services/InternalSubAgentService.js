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

  static registryFromBot(bot) {
    const attributes = bot && bot.attributes ? bot.attributes : {};
    const registry = attributes.internalAgents || attributes.internal_agents || [];

    if (Array.isArray(registry)) {
      return registry;
    }

    if (registry && typeof registry === 'object') {
      return Object.entries(registry).map(([key, value]) => {
        if (value && typeof value === 'object') {
          return { key, ...value };
        }
        return { key, value };
      });
    }

    return [];
  }

  static resolveAgent(bot, agentKey) {
    if (!agentKey) {
      return null;
    }

    const registry = InternalSubAgentService.registryFromBot(bot);
    return registry.find((agent) => {
      return agent &&
        agent.enabled !== false &&
        (agent.key === agentKey || agent.name === agentKey || agent.id === agentKey);
    }) || null;
  }

  static runKey(parentRequestId, runId) {
    return `tilebot:requests:${parentRequestId}:subagents:${runId}`;
  }

  static topic(parentRequestId, runId) {
    return `/subagents/${parentRequestId}/${runId}`;
  }

  static newRunId() {
    return uuidv4().replace(/-/g, '');
  }

  static buildSubRequestId(projectId, runId) {
    return `automation-request-${projectId}-${runId}`;
  }

  static timeoutMs(agent, action) {
    const timeout = action.timeoutMs || action.timeout || agent.timeoutMs || DEFAULT_TIMEOUT_MS;
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
    const run = {
      schemaVersion: 1,
      runId: runId,
      parentRequestId: params.parentRequestId,
      subRequestId: InternalSubAgentService.buildSubRequestId(params.projectId, runId),
      projectId: params.projectId,
      parentBotId: params.parentBotId,
      agentKey: params.agent.key || params.agent.name,
      agentName: params.agent.name,
      type: params.agent.type || 'internal_flow',
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

  static async publishEvent(tdcache, run, event) {
    if (!tdcache || !run) {
      return;
    }

    const payload = {
      runId: run.runId,
      parentRequestId: run.parentRequestId,
      subRequestId: run.subRequestId,
      agentKey: run.agentKey,
      status: event.status,
      output: event.output,
      error: event.error,
      progress: event.progress,
      timestamp: Date.now()
    };

    await tdcache.publish(
      InternalSubAgentService.topic(run.parentRequestId, run.runId),
      JSON.stringify(payload)
    );
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

  static flowCommand(agent) {
    const flow = agent.flow || {};
    if (flow.intentId || flow.intent_id || agent.flow_id) {
      return `/#${flow.intentId || flow.intent_id || agent.flow_id}`;
    }
    if (flow.intentName || flow.intent_name) {
      return `/${flow.intentName || flow.intent_name}`;
    }
    return null;
  }

  static flowBotId(agent, fallbackBotId) {
    const flow = agent.flow || {};
    return flow.botId || flow.bot_id || agent.botId || agent.bot_id || fallbackBotId;
  }

  static buildSubAgentMessage(context, agent, run) {
    const payload = {
      ...(run.input || {}),
      _tdSubAgent: {
        runId: run.runId,
        parentRequestId: run.parentRequestId,
        subRequestId: run.subRequestId,
        agentKey: run.agentKey,
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
        text: InternalSubAgentService.flowCommand(agent),
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
    return {
      payload: {
        _id: uuidv4(),
        senderFullname: '_tdinternal',
        type: 'text',
        sender: '_tdinternal',
        recipient: event.parentRequestId,
        text: `/${intentName}`,
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
