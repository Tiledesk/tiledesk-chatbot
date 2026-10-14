const assert = require('assert');
const aiController = require('../services/AIController');
const integrationService = require('../services/IntegrationService');
const { OPENROUTER_BASE_URL, buildProviderRouting, buildOpenRouterModel } = require('../utils/openrouterUtils');

const storedValue = {
  apikey: 'sk-or-secret-key',
  models: [
    {
      id: 'openai/gpt-4o',
      name: 'GPT-4o',
      providers: ['azure', 'openai'],
      allow_fallbacks: false,
      sort: 'price'
    },
    {
      id: 'meta-llama/llama-3.3-70b',
      name: 'Llama 3.3 70B',
      providers: [],
      allow_fallbacks: true,
      sort: null
    }
  ]
};

describe('OpenRouter provider routing', () => {

  describe('buildProviderRouting', () => {

    it('carries the ordered providers, the restriction and the sort', () => {
      assert.deepStrictEqual(buildProviderRouting(storedValue, 'openai/gpt-4o'), {
        order: ['azure', 'openai'],
        allow_fallbacks: false,
        sort: 'price'
      });
    })

    it('says nothing for a model with no providers and default settings', () => {
      assert.strictEqual(buildProviderRouting(storedValue, 'meta-llama/llama-3.3-70b'), undefined);
    })

    it('says nothing for a model that was never configured', () => {
      assert.strictEqual(buildProviderRouting(storedValue, 'anthropic/claude-opus-5'), undefined);
    })

    it('drops blank slugs and an unrecognised sort', () => {
      const value = { models: [{ id: 'm', providers: ['  ', 'fireworks'], sort: 'cheapest' }] };
      assert.deepStrictEqual(buildProviderRouting(value, 'm'), { order: ['fireworks'] });
    })
  })

  describe('buildOpenRouterModel', () => {

    it('omits provider_routing entirely for an unrouted model', () => {
      const model = buildOpenRouterModel(storedValue, 'anthropic/claude-opus-5');
      assert.ok(!('provider_routing' in model));
      assert.strictEqual(model.url, OPENROUTER_BASE_URL);
    })
  })

  describe('resolveLLMConfig', () => {

    let getIntegration;
    let getKeyFromIntegrations;

    beforeEach(() => {
      getIntegration = integrationService.getIntegration;
      getKeyFromIntegrations = integrationService.getKeyFromIntegrations;
    })

    afterEach(() => {
      integrationService.getIntegration = getIntegration;
      integrationService.getKeyFromIntegrations = getKeyFromIntegrations;
    })

    it('resolves the routing for the requested model', async () => {
      let asked;
      integrationService.getIntegration = async (id_project, name, token) => {
        asked = { id_project, name, token };
        return { value: storedValue };
      };

      const model = await aiController.resolveLLMConfig(
        'project-1', 'openrouter', 'openai/gpt-4o', 'a-token');

      assert.deepStrictEqual(asked, { id_project: 'project-1', name: 'openrouter', token: 'a-token' });
      assert.deepStrictEqual(model, {
        provider: 'openrouter',
        name: 'openai/gpt-4o',
        url: OPENROUTER_BASE_URL,
        api_key: 'sk-or-secret-key',
        provider_routing: { order: ['azure', 'openai'], allow_fallbacks: false, sort: 'price' }
      });
    })

    it('rejects when the integration carries no key', async () => {
      integrationService.getIntegration = async () => ({ value: { models: [] } });

      await assert.rejects(
        () => aiController.resolveLLMConfig('project-1', 'openrouter', 'openai/gpt-4o', 'a-token'),
        (err) => err.code === 422
      );
    })

    it('rejects when the integration is missing altogether', async () => {
      integrationService.getIntegration = async () => null;

      await assert.rejects(
        () => aiController.resolveLLMConfig('project-1', 'openrouter', 'openai/gpt-4o', 'a-token'),
        (err) => err.code === 422
      );
    })

    it('leaves other providers on their existing path', async () => {
      let called = false;
      integrationService.getKeyFromIntegrations = async () => { called = true; return 'sk-groq'; };

      const model = await aiController.resolveLLMConfig(
        'project-1', 'groq', 'llama-3.3-70b', 'a-token');

      assert.ok(called);
      assert.deepStrictEqual(model, { provider: 'groq', name: 'llama-3.3-70b', api_key: 'sk-groq' });
    })
  })
})
