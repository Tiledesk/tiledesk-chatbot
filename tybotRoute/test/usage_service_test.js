const assert = require('assert');
const httpUtils = require('../utils/HttpUtils');
const usageService = require('../services/UsageService');

function httpError(status, data) {
  const err = new Error('Request failed with status code ' + status);
  err.response = { status, data };
  return err;
}

describe('UsageService', () => {

  let originalRequest;
  let originalEndpoint;
  let originalManagedKey;
  let calls;
  let routes;

  beforeEach(() => {
    originalRequest = httpUtils.request;
    originalEndpoint = process.env.API_ENDPOINT;
    originalManagedKey = process.env.OPENROUTER_MANAGED_KEY;
    process.env.API_ENDPOINT = 'http://api';
    calls = [];
    routes = {};
    httpUtils.request = (options, callback) => {
      calls.push(options);
      const route = routes[options.method + ' ' + options.url.replace('http://api/project1', '')];
      if (!route) {
        return callback(httpError(404, 'Not Found'));
      }
      const { err, body } = route(options);
      callback(err || null, body);
    };
  });

  afterEach(() => {
    httpUtils.request = originalRequest;
    process.env.API_ENDPOINT = originalEndpoint;
    if (originalManagedKey === undefined) {
      delete process.env.OPENROUTER_MANAGED_KEY;
    } else {
      process.env.OPENROUTER_MANAGED_KEY = originalManagedKey;
    }
  });

  it('checks on the usage route and sends the model name only', async () => {
    routes['POST /usage/check'] = () => ({ body: { ok: true, metering: 'quotes' } });
    const result = await usageService.check('project1', 'tok', {
      provider: 'openai', model: { name: 'gpt-4o', api_key: 'sk-secret' }, own_key: false
    });
    assert.deepStrictEqual(result, { ok: true, metering: 'quotes' });
    assert.deepStrictEqual(calls[0].json, { resource: 'llm', own_key: false, provider: 'openai', model: 'gpt-4o' });
    assert.strictEqual(calls[0].headers.Authorization, 'JWT tok');
  });

  it('returns the credits refusal with its reason', async () => {
    routes['POST /usage/check'] = () => ({
      err: httpError(403, { success: false, ok: false, metering: 'credits', error_code: 13010, error: 'Insufficient credits' })
    });
    const result = await usageService.check('project1', 'tok', { provider: 'openai', model: 'gpt-4o', own_key: true });
    assert.deepStrictEqual(result, { ok: false, metering: 'credits', error_code: 13010, error: 'Insufficient credits' });
    assert.strictEqual(usageService.refusalMessage(result), 'Insufficient credits');
  });

  it('gives the managed model with the key of this service', async () => {
    process.env.OPENROUTER_MANAGED_KEY = 'sk-or-managed';
    routes['POST /usage/check'] = () => ({
      body: { ok: true, metering: 'credits', managed: { provider: 'openrouter', name: 'openai/gpt-4o' } }
    });
    const result = await usageService.check('project1', 'tok', { provider: 'openai', model: 'gpt-4o', own_key: false });
    assert.deepStrictEqual(usageService.managedModel(result), {
      provider: 'openrouter', name: 'openai/gpt-4o', api_key: 'sk-or-managed'
    });
    delete process.env.OPENROUTER_MANAGED_KEY;
    assert.strictEqual(usageService.managedModel(result), null);
  });

  it('lets the operation run when the check fails', async () => {
    routes['POST /usage/check'] = () => ({ err: httpError(500, 'boom') });
    const result = await usageService.check('project1', 'tok', { provider: 'openai', model: 'gpt-4o' });
    assert.strictEqual(result.ok, true);
  });

  it('falls back to the tokens quota on a server without the usage routes', async () => {
    routes['GET /quotes/tokens'] = () => ({ body: { isAvailable: false } });
    const refused = await usageService.check('project1', 'tok', { provider: 'openai', model: 'gpt-4o', own_key: false });
    assert.deepStrictEqual(refused, { ok: false, metering: 'quotes', error_code: 13001, error: 'Tokens quota exceeded' });
    assert.strictEqual(usageService.refusalMessage(refused), 'tokens quota exceeded');

    calls = [];
    const ownKey = await usageService.check('project1', 'tok', { provider: 'openai', model: 'gpt-4o', own_key: true });
    assert.strictEqual(ownKey.ok, true);
    assert.deepStrictEqual(calls.map(c => c.url), ['http://api/project1/usage/check']);
  });

  it('reports the tokens on the usage route', async () => {
    routes['POST /usage'] = () => ({ body: { metering: 'credits', charged: 0.9 } });
    const result = await usageService.report('project1', 'tok', {
      provider: 'openai', model: 'gpt-4o', own_key: false,
      tokens: 1500, input_tokens: 1000, output_tokens: 500, ref: 'req1', unknown: 1
    });
    assert.deepStrictEqual(result, { metering: 'credits', charged: 0.9 });
    assert.deepStrictEqual(calls[0].json, {
      resource: 'llm', own_key: false, provider: 'openai', model: 'gpt-4o',
      input_tokens: 1000, output_tokens: 500, tokens: 1500, ref: 'req1'
    });
  });

  it('falls back to the tokens quota increment, only with the Tiledesk key', async () => {
    routes['POST /quotes/incr/tokens'] = () => ({ body: { ok: true } });
    await usageService.report('project1', 'tok', { provider: 'openai', model: 'gpt-4o', input_tokens: 100, output_tokens: 28 });
    assert.deepStrictEqual(calls[1].json, { tokens: 128, model: 'gpt-4o' });

    calls = [];
    await usageService.report('project1', 'tok', { provider: 'openai', model: 'gpt-4o', own_key: true, tokens: 128 });
    assert.strictEqual(calls.length, 1);
  });

  it('never rejects on a failed report', async () => {
    routes['POST /usage'] = () => ({ err: httpError(500, 'boom') });
    const result = await usageService.report('project1', 'tok', { provider: 'openai', model: 'gpt-4o', tokens: 10 });
    assert.strictEqual(result, null);
  });

});
