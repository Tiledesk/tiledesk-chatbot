const assert = require('assert');
const aiController = require('../services/AIController');
const integrationService = require('../services/IntegrationService');

function vllmIntegration(servers) {
  return { name: 'vllm', id_project: 'project-1', value: { servers } };
}

describe('vLLM custom headers', () => {

  let getIntegration;

  beforeEach(() => {
    getIntegration = integrationService.getIntegration;
  })

  afterEach(() => {
    integrationService.getIntegration = getIntegration;
  })

  function useServers(servers) {
    integrationService.getIntegration = async () => vllmIntegration(servers);
  }

  it('sends only the enabled headers with a non-empty key, and a placeholder api_key', async () => {
    useServers([{
      name: 'ArubaModels',
      url: 'https://aruba.models.com/ai',
      models: ['aruba1'],
      customHeaders: [
        { key: 'x-api-key', value: '12345678', enabled: true },
        { key: '  x-tenant  ', value: 'acme' },
        { key: 'x-disabled', value: 'nope', enabled: false },
        { key: '   ', value: 'blank key', enabled: true },
        { key: '', value: 'empty key' },
        { value: 'no key' },
        { key: 'x-empty-value', enabled: true },
        null
      ]
    }]);

    const model = await aiController.resolveLLMConfig('project-1', 'vllm', 'aruba1', 'a-token', 'ArubaModels');

    assert.deepStrictEqual(model, {
      provider: 'vllm',
      name: 'aruba1',
      url: 'https://aruba.models.com/ai',
      api_key: 'sk-...',
      custom_headers: { 'x-api-key': '12345678', 'x-tenant': 'acme', 'x-empty-value': '' }
    });
  })

  it('keeps the server api_key when it has one alongside the headers', async () => {
    useServers([{
      name: 'ArubaModels',
      url: 'https://aruba.models.com/ai',
      apikey: 'sk-aruba-real',
      customHeaders: [{ key: 'x-api-key', value: '12345678', enabled: true }]
    }]);

    const model = await aiController.resolveLLMConfig('project-1', 'vllm', 'aruba1', 'a-token', 'ArubaModels');

    assert.strictEqual(model.api_key, 'sk-aruba-real');
    assert.deepStrictEqual(model.custom_headers, { 'x-api-key': '12345678' });
  })

  it('omits custom_headers when every header is disabled', async () => {
    useServers([{
      name: 'ArubaModels',
      url: 'https://aruba.models.com/ai',
      customHeaders: [
        { key: 'x-api-key', value: '12345678', enabled: false },
        { key: 'x-tenant', value: 'acme', enabled: false }
      ]
    }]);

    const model = await aiController.resolveLLMConfig('project-1', 'vllm', 'aruba1', 'a-token', 'ArubaModels');

    assert.ok(!('custom_headers' in model));
    assert.strictEqual(model.api_key, '');
  })

  it('leaves the payload unchanged for a server without headers', async () => {
    useServers([
      { name: 'cerebras', url: 'https://api.cerebras.ai/v1', models: ['gpt-oss-120b'], apikey: 'csk-real' },
      { name: 'nokey', url: 'https://nokey.example/v1', models: ['m'], customHeaders: [] }
    ]);

    const cerebras = await aiController.resolveLLMConfig('project-1', 'vllm', 'gpt-oss-120b', 'a-token', 'cerebras');
    const nokey = await aiController.resolveLLMConfig('project-1', 'vllm', 'm', 'a-token', 'nokey');

    assert.deepStrictEqual(cerebras, {
      provider: 'vllm',
      name: 'gpt-oss-120b',
      url: 'https://api.cerebras.ai/v1',
      api_key: 'csk-real'
    });
    assert.deepStrictEqual(nokey, {
      provider: 'vllm',
      name: 'm',
      url: 'https://nokey.example/v1',
      api_key: ''
    });
  })

  it('does not alter the stored server', async () => {
    const server = {
      name: 'ArubaModels',
      url: 'https://aruba.models.com/ai',
      customHeaders: [{ key: ' x-api-key ', value: '12345678', enabled: true }]
    };
    const snapshot = JSON.parse(JSON.stringify(server));
    useServers([server]);

    await aiController.resolveLLMConfig('project-1', 'vllm', 'aruba1', 'a-token', 'ArubaModels');

    assert.deepStrictEqual(server, snapshot);
  })
})
