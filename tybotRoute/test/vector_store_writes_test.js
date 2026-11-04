const assert = require('assert');
const httpUtils = require('../utils/HttpUtils');
const { vectorStoreWritesFrozen } = require('../utils/vectorStoreWrites');
const { DirAddKbContent } = require('../tiledeskChatbotPlugs/directives/DirAddKbContent');

describe('vector store writes', function () {
  const previous = process.env.PINECONE_WRITE_DISABLED;
  const originalRequest = httpUtils.request;

  afterEach(function () {
    httpUtils.request = originalRequest;
    if (previous === undefined) {
      delete process.env.PINECONE_WRITE_DISABLED;
    } else {
      process.env.PINECONE_WRITE_DISABLED = previous;
    }
  });

  it('stays open when the variable is absent or false', function () {
    delete process.env.PINECONE_WRITE_DISABLED;
    assert.strictEqual(vectorStoreWritesFrozen(), false);

    process.env.PINECONE_WRITE_DISABLED = 'false';
    assert.strictEqual(vectorStoreWritesFrozen(), false);
  });

  it('does not call the knowledge base when PINECONE_WRITE_DISABLED=true', async function () {
    process.env.PINECONE_WRITE_DISABLED = 'true';
    assert.strictEqual(vectorStoreWritesFrozen(), true);

    let requested = false;
    httpUtils.request = function () {
      requested = true;
    };

    const errors = [];
    const dir = new DirAddKbContent({
      chatbot: {
        addParameter: async (key, value) => { errors.push({ key, value }); }
      },
      tdcache: {},
      requestId: 'support-group-project-request',
      projectId: 'project',
      token: 'token',
      API_ENDPOINT: 'http://localhost',
      supportRequest: {},
      reply: {}
    });

    const stop = await new Promise((resolve) => {
      dir.go({ type: 'text', name: 'n', content: 'c' }, resolve);
    });

    assert.strictEqual(requested, false);
    assert.strictEqual(stop, true);
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].value.includes('vector_store_writes_disabled'));
  });
});
