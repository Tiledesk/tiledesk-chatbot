var assert = require('assert');
const { InternalSubAgentService, INTERNAL_SUB_AGENT_STATUS } = require('../services/InternalSubAgentService');
const { DirInvokeSubAgent } = require('../tiledeskChatbotPlugs/directives/DirInvokeSubAgent');
const { MockBotsDataSource } = require('../engine/mock/MockBotsDataSource');
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

const staticBots = {
  bots: {
    botID: {
      webhook_enabled: false,
      language: 'en',
      name: 'Sub Bot',
      intents: {},
      intents_by_intent_id: {
        intentID: {
          intent_id: 'intentID',
          intent_display_name: 'target',
          actions: []
        }
      }
    }
  }
};

describe('Internal Sub-Agents', function() {

  it('builds agent metadata from sub-bot id and creates isolated run state', async () => {
    const cache = new FakeTdCache();
    const subBot = { _id: 'botID', name: 'Knowledge Agent' };
    const agent = InternalSubAgentService.agentFromSubBot(subBot, 'botID');
    assert(agent);
    assert.strictEqual(agent.key, 'botID');

    const run = await InternalSubAgentService.createRun(cache, {
      projectId: 'projectID',
      parentRequestId: 'support-group-projectID-parent',
      parentBotId: 'parentBot',
      subagentId: 'botID',
      agent: agent,
      input: { query: 'docs' }
    });

    assert.notStrictEqual(run.parentRequestId, run.subRequestId);
    assert.strictEqual(run.subRequestId, `automation-request-projectID-${run.runId}`);
    assert.strictEqual(run.status, INTERNAL_SUB_AGENT_STATUS.RUNNING);

    const saved = await InternalSubAgentService.getRun(cache, run.parentRequestId, run.runId);
    assert.strictEqual(saved.agentKey, 'botID');
    assert.deepStrictEqual(saved.input, { query: 'docs' });
  });

  it('invokes a sub-bot by id through the existing tilebot service', (done) => {
    const cache = new FakeTdCache();
    const originalSendMessageToBot = tilebotService.sendMessageToBot;
    const originalExecuteBlock = tilebotService.executeBlock;
    const parentRequestId = 'support-group-projectID-parent';

    const context = {
      projectId: 'projectID',
      requestId: parentRequestId,
      token: 'token',
      supportRequest: {
        request_id: parentRequestId,
        id_project: 'projectID',
        bot_id: 'parentBot'
      },
      reply: {},
      tdcache: cache,
      chatbot: {
        botId: 'parentBot',
        bot: { _id: 'parentBot', name: 'Parent' },
        botsDataSource: new MockBotsDataSource(staticBots)
      }
    };

    const assertSubAgentDispatch = async (message, botId, callback) => {
      try {
        assert.strictEqual(botId, 'botID');
        assert.strictEqual(message.payload.text, '/#intentID');
        assert.notStrictEqual(message.payload.request.request_id, parentRequestId);
        assert.strictEqual(message.payload.attributes.payload.question, 'hello');
        assert(message.payload.attributes.payload._tdSubAgent.runId);
        if (callback) {
          callback();
        }
        done();
      } catch (error) {
        done(error);
      } finally {
        tilebotService.sendMessageToBot = originalSendMessageToBot;
        tilebotService.executeBlock = originalExecuteBlock;
      }
    };

    tilebotService.sendMessageToBot = assertSubAgentDispatch;
    tilebotService.executeBlock = assertSubAgentDispatch;

    const directive = {
      action: {
        _tdActionType: 'invoke_subagent',
        subagent_id: 'botID',
        intentName: '#intentID',
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
});
