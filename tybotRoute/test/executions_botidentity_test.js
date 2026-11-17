'use strict';

const assert = require('assert');
const mongoose = require('mongoose');
const Faq_kb = require('../models/faq_kb');
const ExecutionRecorder = require('../executions/ExecutionRecorder');

const ENV_KEYS = ['EXECUTIONS_ENABLED', 'EXECUTIONS_STATE_ENABLED'];

describe('ExecutionRecorder bot identity (root_id)', function () {
  const saved = {};
  before(() => { ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; }); });
  beforeEach(() => { process.env.EXECUTIONS_ENABLED = 'true'; process.env.EXECUTIONS_STATE_ENABLED = 'false'; });
  afterEach(() => {
    ENV_KEYS.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; });
  });

  /** Runs onMessageIn with a stub store and returns what the recorder resolved. */
  async function identityFor(bot) {
    let meta = null;
    let agentId = null;
    const store = {
      resolve: async (arg) => { meta = arg.meta; agentId = arg.agentId; return null; }
    };
    await ExecutionRecorder.onMessageIn({ message: {}, bot, botId: 'snapshotId', requestId: 'r1', projectId: 'p1', token: 't', store });
    return { agentId, test: meta.test, agent_version: meta.agent_version };
  }

  it('a mongoose document does not expose root_id as a property (schema has no such field)', function () {
    const doc = Faq_kb.hydrate({ _id: new mongoose.Types.ObjectId(), name: 'b', root_id: 'rootId' });
    assert.strictEqual(doc.root_id, undefined);
    assert.strictEqual(doc._doc.root_id, 'rootId');
  });

  it('a published bot loaded as a mongoose document records the root id and test:false', async function () {
    const doc = Faq_kb.hydrate({ _id: new mongoose.Types.ObjectId(), name: 'b', root_id: 'rootId' });
    assert.deepStrictEqual(await identityFor(doc), { agentId: 'rootId', test: false, agent_version: 'snapshotId' });
  });

  it('a published bot from the cache (plain JSON) records the root id and test:false', async function () {
    assert.deepStrictEqual(await identityFor({ name: 'b', root_id: 'rootId' }), { agentId: 'rootId', test: false, agent_version: 'snapshotId' });
  });

  it('a draft bot (mongoose document without root_id) records itself and test:true', async function () {
    const doc = Faq_kb.hydrate({ _id: new mongoose.Types.ObjectId(), name: 'b' });
    assert.deepStrictEqual(await identityFor(doc), { agentId: 'snapshotId', test: true, agent_version: 'snapshotId' });
  });

  it('a missing bot records the bot id and test:true', async function () {
    assert.deepStrictEqual(await identityFor(null), { agentId: 'snapshotId', test: true, agent_version: 'snapshotId' });
  });
});
