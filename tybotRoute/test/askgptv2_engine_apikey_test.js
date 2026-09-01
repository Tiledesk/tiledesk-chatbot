const assert = require('assert');
const mongoose = require('mongoose');
const namespaceService = require('../services/NamespaceService');
const { DirAskGPTV2 } = require('../tiledeskChatbotPlugs/directives/DirAskGPTV2');
const default_engine = require('../config/kb/engine');
const default_engine_hybrid = require('../config/kb/engine.hybrid');

// Minimal context: resolveEngineApikey only needs the project scope and the logger.
function directive() {
  return new DirAskGPTV2({ projectId: 'project-1', requestId: 'request-1' });
}

function namespace(engine) {
  return { id: 'ns-1', hybrid: false, engine: engine };
}

// findOne(...).select(...).lean().exec() with the query captured for inspection.
function modelStub(result, captured) {
  return {
    findOne: (query) => {
      captured.query = query;
      return {
        select: (fields) => {
          captured.select = fields;
          return { lean: () => ({ exec: async () => result }) };
        }
      };
    }
  };
}

describe('AskKnowledgeBase engine apikey', () => {

  let model;
  let isConnected;

  beforeEach(() => {
    model = namespaceService.model;
    isConnected = namespaceService.isConnected;
  });

  afterEach(() => {
    namespaceService.model = model;
    namespaceService.isConnected = isConnected;
  });

  describe('NamespaceService', () => {

    it('reads the engine scoped by namespace AND project', async () => {
      const captured = {};
      namespaceService.isConnected = () => true;
      namespaceService.model = modelStub({ engine: { name: 'pinecone', apikey: 'pcsk_stored' } }, captured);

      const engine = await namespaceService.getEngine('ns-1', 'project-1');

      assert.deepStrictEqual(captured.query, { id: 'ns-1', id_project: 'project-1' });
      assert.strictEqual(captured.select, 'engine');
      assert.strictEqual(engine.apikey, 'pcsk_stored');
    });

    it('returns null when the namespace does not belong to the project', async () => {
      namespaceService.isConnected = () => true;
      namespaceService.model = modelStub(null, {});

      assert.strictEqual(await namespaceService.getEngine('ns-1', 'other-project'), null);
    });

    it('returns null without a database connection instead of stalling on it', async () => {
      assert.strictEqual(mongoose.connection.readyState, 0);
      assert.strictEqual(namespaceService.isConnected(), false);
      assert.strictEqual(await namespaceService.getEngine('ns-1', 'project-1'), null);
    });

    it('requires both the namespace id and the project id', async () => {
      namespaceService.isConnected = () => true;
      namespaceService.model = modelStub({ engine: { apikey: 'pcsk_stored' } }, {});

      assert.strictEqual(await namespaceService.getEngine(null, 'project-1'), null);
      assert.strictEqual(await namespaceService.getEngine('ns-1', null), null);
    });

  });

  describe('resolveEngineApikey', () => {

    it('fills the apikey stripped by the API from the namespace in the database', async () => {
      namespaceService.isConnected = () => true;
      namespaceService.model = modelStub({ engine: { name: 'pinecone', apikey: 'pcsk_stored' } }, {});

      const ns = namespace({ name: 'pinecone', type: 'serverless', index_name: 'customer-index' });
      const engine = await directive().resolveEngineApikey(ns);

      assert.strictEqual(engine.apikey, 'pcsk_stored');
      // the rest of the engine is the one the API returned, not a local default
      assert.strictEqual(engine.index_name, 'customer-index');
      assert.strictEqual(engine.name, 'pinecone');
      assert.strictEqual(engine.type, 'serverless');
    });

    it('does not modify the namespace returned by the API', async () => {
      namespaceService.isConnected = () => true;
      namespaceService.model = modelStub({ engine: { apikey: 'pcsk_stored' } }, {});

      const ns = namespace({ name: 'pinecone', index_name: 'customer-index' });
      const engine = await directive().resolveEngineApikey(ns);

      assert.strictEqual(engine.apikey, 'pcsk_stored');
      assert.strictEqual(ns.engine.apikey, undefined);
    });

    it('keeps an apikey the API did send', async () => {
      namespaceService.isConnected = () => true;
      namespaceService.model = modelStub({ engine: { apikey: 'pcsk_stored' } }, {});

      const ns = namespace({ name: 'pinecone', apikey: 'pcsk_from_api' });
      const engine = await directive().resolveEngineApikey(ns);

      assert.strictEqual(engine.apikey, 'pcsk_from_api');
    });

    it('falls back to the local configuration when the database has no answer', async () => {
      namespaceService.isConnected = () => false;

      const ns = namespace({ name: 'pinecone', index_name: 'customer-index' });
      const engine = await directive().resolveEngineApikey(ns);

      assert.strictEqual(engine.apikey, default_engine.apikey);
      assert.strictEqual(engine.index_name, 'customer-index');
    });

    it('falls back to the hybrid configuration for a hybrid namespace', async () => {
      namespaceService.isConnected = () => false;

      const ns = namespace({ name: 'pinecone', index_name: 'customer-index' });
      ns.hybrid = true;
      const engine = await directive().resolveEngineApikey(ns);

      assert.strictEqual(engine.apikey, default_engine_hybrid.apikey);
    });

    it('always puts an apikey field in the engine it returns', async () => {
      namespaceService.isConnected = () => false;

      const engine = await directive().resolveEngineApikey(namespace({ name: 'pinecone' }));

      assert.ok('apikey' in engine, "engine must carry an apikey field, tilellm dereferences it");
    });

  });

});
