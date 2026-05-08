var assert = require('assert');
const { InternalSubAgentService, INTERNAL_SUB_AGENT_STATUS } = require('../services/InternalSubAgentService');
const { DirInvokeSubAgent } = require('../tiledeskChatbotPlugs/directives/DirInvokeSubAgent');
const { DirSubAgentResponse } = require('../tiledeskChatbotPlugs/directives/DirSubAgentResponse');
const tilebotService = require('../services/TilebotService');

class FakeTdCache {
  constructor() {
    this.db = new Map();
    this.hashes = new Map();
    this.messages = [];
    this.listeners = new Map();
  }

  async set(key, value) {
    this.db.set(key, `${value}`);
  }

  async get(key) {
    return this.db.get(key) || null;
  }

  async hset(dictKey, key, value) {
    if (!this.hashes.has(dictKey)) {
      this.hashes.set(dictKey, {});
    }
    this.hashes.get(dictKey)[key] = value;
  }

  async hgetall(dictKey) {
    return this.hashes.get(dictKey) || {};
  }

  async hget(dictKey, key) {
    const hash = this.hashes.get(dictKey) || {};
    return hash[key] || null;
  }

  async publish(topic, value) {
    this.messages.push({ topic, value });
    const listener = this.listeners.get(topic);
    if (listener) {
      await listener(value, topic);
    }
  }

  async subscribe(topic, callback) {
    this.listeners.set(topic, callback);
  }

  async unsubscribe(topic) {
    this.listeners.delete(topic);
  }
}

describe('Internal Sub-Agents', function() {

  it('resolves internal agents from bot attributes and creates isolated run state', async () => {
    const cache = new FakeTdCache();
    const bot = {
      attributes: {
        internalAgents: [{
          key: 'knowledge_agent',
          name: 'Knowledge Agent',
          type: 'internal_flow',
          flow: {
            botId: 'botID',
            intentId: 'intentID'
          },
          timeoutMs: 5000
        }]
      }
    };

    const agent = InternalSubAgentService.resolveAgent(bot, 'knowledge_agent');
    assert(agent);

    const run = await InternalSubAgentService.createRun(cache, {
      projectId: 'projectID',
      parentRequestId: 'support-group-projectID-parent',
      parentBotId: 'botID',
      agent: agent,
      input: { query: 'docs' }
    });

    assert.notStrictEqual(run.parentRequestId, run.subRequestId);
    assert.strictEqual(run.subRequestId, `automation-request-projectID-${run.runId}`);
    assert.strictEqual(run.status, INTERNAL_SUB_AGENT_STATUS.RUNNING);

    const saved = await InternalSubAgentService.getRun(cache, run.parentRequestId, run.runId);
    assert.strictEqual(saved.agentKey, 'knowledge_agent');
    assert.deepStrictEqual(saved.input, { query: 'docs' });
  });

  it('invokes an internal flow through the existing tilebot service', (done) => {
    const cache = new FakeTdCache();
    const originalSendMessageToBot = tilebotService.sendMessageToBot;
    const parentRequestId = 'support-group-projectID-parent';

    const context = {
      projectId: 'projectID',
      requestId: parentRequestId,
      token: 'token',
      supportRequest: {
        request_id: parentRequestId,
        id_project: 'projectID',
        bot_id: 'botID'
      },
      reply: {},
      tdcache: cache,
      chatbot: {
        botId: 'botID',
        bot: {
          attributes: {
            internalAgents: [{
              key: 'knowledge_agent',
              type: 'internal_flow',
              flow: {
                botId: 'botID',
                intentId: 'intentID'
              }
            }]
          }
        }
      }
    };

    tilebotService.sendMessageToBot = async (message, botId, callback) => {
      try {
        assert.strictEqual(botId, 'botID');
        assert.strictEqual(message.payload.text, '/#intentID');
        assert.notStrictEqual(message.payload.request.request_id, parentRequestId);
        assert.strictEqual(message.payload.attributes.payload.question, 'hello');
        assert(message.payload.attributes.payload._tdSubAgent.runId);
        callback();
        done();
      } catch (error) {
        done(error);
      } finally {
        tilebotService.sendMessageToBot = originalSendMessageToBot;
      }
    };

    const directive = {
      action: {
        _tdActionType: 'invoke_sub_agent',
        agentKey: 'knowledge_agent',
        mode: 'fire_and_continue',
        input: {
          question: 'hello'
        },
        assignRunIdTo: 'subAgentRunId'
      }
    };

    const dir = new DirInvokeSubAgent(context);
    dir.execute(directive, async (stop) => {
      assert.strictEqual(stop, false);
      const parameters = await InternalSubAgentService.allParameters(cache, parentRequestId);
      const runId = parameters.subAgentRunId;
      assert(runId);
    });
  });

  it('stores sub-agent result before publishing the terminal event', async () => {
    const cache = new FakeTdCache();
    const parentRequestId = 'support-group-projectID-parent';
    const subRequestId = 'automation-request-projectID-sub';
    const run = {
      runId: 'runID',
      parentRequestId: parentRequestId,
      subRequestId: subRequestId,
      projectId: 'projectID',
      agentKey: 'knowledge_agent',
      status: INTERNAL_SUB_AGENT_STATUS.RUNNING,
      input: {},
      output: null,
      error: null,
      timeoutMs: 5000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + 5000
    };

    await InternalSubAgentService.saveRun(cache, run);
    await InternalSubAgentService.addParameter(cache, subRequestId, '_tdSubAgent', {
      runId: run.runId,
      parentRequestId: parentRequestId
    });
    await InternalSubAgentService.addParameter(cache, subRequestId, 'answer', 'done');

    const dir = new DirSubAgentResponse({
      requestId: subRequestId,
      supportRequest: { request_id: subRequestId },
      reply: {},
      tdcache: cache
    });

    await new Promise((resolve) => {
      dir.execute({
        action: {
          _tdActionType: 'sub_agent_response',
          output: {
            text: '{{answer}}'
          }
        }
      }, resolve);
    });

    const saved = await InternalSubAgentService.getRun(cache, parentRequestId, run.runId);
    assert.strictEqual(saved.status, INTERNAL_SUB_AGENT_STATUS.COMPLETED);
    assert.deepStrictEqual(saved.output, { text: 'done' });
    assert.strictEqual(cache.messages.length, 1);
    assert.strictEqual(cache.messages[0].topic, InternalSubAgentService.topic(parentRequestId, run.runId));

    await new Promise((resolve) => {
      dir.execute({
        action: {
          _tdActionType: 'sub_agent_response',
          output: {
            text: 'duplicate'
          }
        }
      }, resolve);
    });

    const afterDuplicate = await InternalSubAgentService.getRun(cache, parentRequestId, run.runId);
    assert.deepStrictEqual(afterDuplicate.output, { text: 'done' });
    assert.strictEqual(cache.messages.length, 1);
  });
});
