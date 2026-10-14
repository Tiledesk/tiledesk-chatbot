const assert = require('assert');
const mongoose = require('mongoose');
const integrationService = require('../services/IntegrationService');

// findOne(...).lean().exec() with the query captured for inspection.
function modelStub(result, captured) {
  return {
    findOne: (query) => {
      captured.query = query;
      return { lean: () => ({ exec: async () => result }) };
    }
  };
}

// httpUtils.request(config, callback) with the request captured.
function httpStub(response, captured) {
  return {
    request: (config, callback) => {
      captured.url = config.url;
      callback(null, response);
    }
  };
}

const stored = {
  _id: 'i1',
  id_project: 'project-1',
  name: 'openai',
  value: { apikey: 'sk-proj-realkeyvalue', organization: 'acme' }
};

// What the API returns for the same integration since tiledesk-server 2.21.0.
const masked = {
  _id: 'i1',
  id_project: 'project-1',
  name: 'openai',
  value: { apikey: 'sk-********alue', organization: 'acme' }
};

describe('IntegrationService credentials', () => {

  let model;
  let http;
  let isConnected;

  beforeEach(() => {
    model = integrationService.model;
    http = integrationService.httpUtils;
    isConnected = integrationService.isConnected;
  });

  afterEach(() => {
    integrationService.model = model;
    integrationService.httpUtils = http;
    integrationService.isConnected = isConnected;
  });

  it('reads the integration from the database, scoped by project AND name', async () => {
    const captured = {};
    integrationService.isConnected = () => true;
    integrationService.model = modelStub(stored, captured);

    const integration = await integrationService.getIntegration('project-1', 'openai', 'a-token');

    assert.deepStrictEqual(captured.query, { id_project: 'project-1', name: 'openai' });
    assert.strictEqual(integration.value.apikey, 'sk-proj-realkeyvalue');
  });

  it('returns the unmasked apikey instead of the one the API would mask', async () => {
    integrationService.isConnected = () => true;
    integrationService.model = modelStub(stored, {});
    integrationService.httpUtils = httpStub(masked, {});

    const key = await integrationService.getKeyFromIntegrations('project-1', 'openai', 'a-token');

    assert.strictEqual(key, 'sk-proj-realkeyvalue');
    assert.strictEqual(integrationService.looksMasked(key), false);
  });

  it('keeps the whole value, not just the key (vllm servers, ollama url and token)', async () => {
    integrationService.isConnected = () => true;
    integrationService.model = modelStub({
      id_project: 'project-1',
      name: 'vllm',
      value: { url: 'https://vllm.acme', token: 'tok-real', servers: [{ name: 's1', apikey: 'sk-server-real' }] }
    }, {});

    const integration = await integrationService.getIntegration('project-1', 'vllm', 'a-token');

    assert.strictEqual(integration.value.url, 'https://vllm.acme');
    assert.strictEqual(integration.value.token, 'tok-real');
    assert.strictEqual(integration.value.servers[0].apikey, 'sk-server-real');
  });

  it('does not reach another project with the right integration name', async () => {
    const captured = {};
    integrationService.isConnected = () => true;
    integrationService.model = modelStub(null, captured);
    integrationService.httpUtils = httpStub("Integration not found", {});

    const key = await integrationService.getKeyFromIntegrations('other-project', 'openai', 'a-token');

    assert.deepStrictEqual(captured.query, { id_project: 'other-project', name: 'openai' });
    assert.strictEqual(key, null);
  });

  it('falls back to the API when there is no database connection', async () => {
    const captured = {};
    assert.strictEqual(mongoose.connection.readyState, 0);
    integrationService.httpUtils = httpStub(masked, captured);

    const key = await integrationService.getKeyFromIntegrations('project-1', 'openai', 'a-token');

    assert.ok(captured.url.endsWith('/project-1/integration/name/openai'), captured.url);
    assert.strictEqual(key, 'sk-********alue');
  });

  it('falls back to the API when the integration is not in the database', async () => {
    const captured = {};
    integrationService.isConnected = () => true;
    integrationService.model = modelStub(null, {});
    integrationService.httpUtils = httpStub(masked, captured);

    const integration = await integrationService.getIntegration('project-1', 'openai', 'a-token');

    assert.ok(captured.url.endsWith('/project-1/integration/name/openai'));
    assert.strictEqual(integration.value.apikey, 'sk-********alue');
  });

  it('returns null when the integration exists nowhere', async () => {
    integrationService.isConnected = () => true;
    integrationService.model = modelStub(null, {});
    integrationService.httpUtils = httpStub("Integration not found", {});

    assert.strictEqual(await integrationService.getKeyFromIntegrations('project-1', 'openai', 'a-token'), null);
  });

  it('recognizes a masked credential', () => {
    assert.strictEqual(integrationService.looksMasked('sk-********alue'), true);
    assert.strictEqual(integrationService.looksMasked('sk-proj-realkeyvalue'), false);
    assert.strictEqual(integrationService.looksMasked(undefined), false);
  });

  it('requires both the project and the integration name before querying', async () => {
    integrationService.isConnected = () => true;
    integrationService.model = modelStub(stored, {});

    assert.strictEqual(await integrationService.getIntegrationFromDb(null, 'openai'), null);
    assert.strictEqual(await integrationService.getIntegrationFromDb('project-1', null), null);
  });

});
