const assert = require('assert');
const mcpOAuthTokenService = require('../services/McpOAuthTokenService');

// httpUtils.request(config, callback): answers from `responses` in order, captures every request.
function httpStub(responses, captured) {
  return {
    request: (config, callback) => {
      captured.push(config);
      const next = responses.shift();
      if (next.err) {
        callback(next.err, null);
      } else {
        callback(null, next.data);
      }
    }
  };
}

// Shape of the axios error HttpUtils hands to the callback on a non 2xx answer.
function httpError(status, data) {
  const err = new Error("Request failed with status code " + status);
  err.response = { status: status, data: data };
  return err;
}

const NOW = Date.parse('2026-11-10T12:00:00.000Z');

describe('McpOAuthTokenService', () => {

  let http;
  let now;

  beforeEach(() => {
    http = mcpOAuthTokenService.httpUtils;
    now = mcpOAuthTokenService.now;
    mcpOAuthTokenService.now = () => NOW;
    mcpOAuthTokenService.clearCache();
  });

  afterEach(() => {
    mcpOAuthTokenService.httpUtils = http;
    mcpOAuthTokenService.now = now;
    mcpOAuthTokenService.clearCache();
  });

  it('asks the server for the token with the chatbot JWT', async () => {
    const captured = [];
    const body = { access_token: 't1', token_type: 'Bearer', expires_at: '2026-11-10T13:00:00.000Z' };
    mcpOAuthTokenService.httpUtils = httpStub([{ data: body }], captured);

    const token = await mcpOAuthTokenService.getToken('project-1', 'c1', 'bot-jwt');

    assert.deepStrictEqual(token, body);
    assert.strictEqual(captured.length, 1);
    assert.ok(captured[0].url.endsWith('/project-1/mcp/oauth/connections/c1/token'), captured[0].url);
    assert.strictEqual(captured[0].method, 'GET');
    assert.strictEqual(captured[0].headers.Authorization, 'JWT bot-jwt');
  });

  it('serves a second request from the cache', async () => {
    const captured = [];
    const body = { access_token: 't1', token_type: 'Bearer', expires_at: '2026-11-10T13:00:00.000Z' };
    mcpOAuthTokenService.httpUtils = httpStub([{ data: body }], captured);

    await mcpOAuthTokenService.getToken('project-1', 'c1', 'bot-jwt');
    const token = await mcpOAuthTokenService.getToken('project-1', 'c1', 'bot-jwt');

    assert.strictEqual(token.access_token, 't1');
    assert.strictEqual(captured.length, 1);
  });

  it('keys the cache by project and connection', async () => {
    const captured = [];
    const expires_at = '2026-11-10T13:00:00.000Z';
    mcpOAuthTokenService.httpUtils = httpStub([
      { data: { access_token: 't1', token_type: 'Bearer', expires_at } },
      { data: { access_token: 't2', token_type: 'Bearer', expires_at } },
      { data: { access_token: 't3', token_type: 'Bearer', expires_at } }
    ], captured);

    await mcpOAuthTokenService.getToken('project-1', 'c1', 'bot-jwt');
    const otherProject = await mcpOAuthTokenService.getToken('project-2', 'c1', 'bot-jwt');
    const otherConnection = await mcpOAuthTokenService.getToken('project-1', 'c2', 'bot-jwt');

    assert.strictEqual(otherProject.access_token, 't2');
    assert.strictEqual(otherConnection.access_token, 't3');
    assert.strictEqual(captured.length, 3);
  });

  it('stops using the cached token 60 seconds before expires_at', async () => {
    const captured = [];
    const expires_at = new Date(NOW + 120 * 1000).toISOString();
    mcpOAuthTokenService.httpUtils = httpStub([
      { data: { access_token: 't1', token_type: 'Bearer', expires_at } },
      { data: { access_token: 't2', token_type: 'Bearer', expires_at: new Date(NOW + 3600 * 1000).toISOString() } }
    ], captured);

    await mcpOAuthTokenService.getToken('project-1', 'c1', 'bot-jwt');

    mcpOAuthTokenService.now = () => NOW + 59 * 1000;
    const stillCached = await mcpOAuthTokenService.getToken('project-1', 'c1', 'bot-jwt');
    assert.strictEqual(stillCached.access_token, 't1');
    assert.strictEqual(captured.length, 1);

    mcpOAuthTokenService.now = () => NOW + 60 * 1000;
    const refreshed = await mcpOAuthTokenService.getToken('project-1', 'c1', 'bot-jwt');
    assert.strictEqual(refreshed.access_token, 't2');
    assert.strictEqual(captured.length, 2);
  });

  it('does not cache a token expiring in less than 60 seconds', async () => {
    const captured = [];
    const expires_at = new Date(NOW + 30 * 1000).toISOString();
    mcpOAuthTokenService.httpUtils = httpStub([
      { data: { access_token: 't1', token_type: 'Bearer', expires_at } },
      { data: { access_token: 't2', token_type: 'Bearer', expires_at } }
    ], captured);

    await mcpOAuthTokenService.getToken('project-1', 'c1', 'bot-jwt');
    await mcpOAuthTokenService.getToken('project-1', 'c1', 'bot-jwt');

    assert.strictEqual(captured.length, 2);
  });

  it('does not cache a token without expires_at', async () => {
    const captured = [];
    mcpOAuthTokenService.httpUtils = httpStub([
      { data: { access_token: 't1', token_type: 'Bearer', expires_at: null } },
      { data: { access_token: 't2', token_type: 'Bearer', expires_at: null } }
    ], captured);

    const first = await mcpOAuthTokenService.getToken('project-1', 'c1', 'bot-jwt');
    const second = await mcpOAuthTokenService.getToken('project-1', 'c1', 'bot-jwt');

    assert.strictEqual(first.access_token, 't1');
    assert.strictEqual(second.access_token, 't2');
    assert.strictEqual(captured.length, 2);
  });

  it('rejects with status 409 and code needs_reauth', async () => {
    mcpOAuthTokenService.httpUtils = httpStub([
      { err: httpError(409, { success: false, error: 'The MCP OAuth connection needs to be reauthorized', code: 'needs_reauth' }) }
    ], []);

    await assert.rejects(
      mcpOAuthTokenService.getToken('project-1', 'c1', 'bot-jwt'),
      (err) => {
        assert.strictEqual(err.status, 409);
        assert.strictEqual(err.code, 'needs_reauth');
        return true;
      }
    );
  });

  it('rejects with the server status on 404 and 5xx', async () => {
    mcpOAuthTokenService.httpUtils = httpStub([
      { err: httpError(404, { success: false, error: 'Connection not found' }) },
      { err: httpError(503, { success: false, error: 'Provider unreachable' }) }
    ], []);

    await assert.rejects(mcpOAuthTokenService.getToken('project-1', 'c1', 'bot-jwt'), (err) => err.status === 404);
    await assert.rejects(mcpOAuthTokenService.getToken('project-1', 'c1', 'bot-jwt'), (err) => err.status === 503);
  });

  it('rejects with status 502 on a network error', async () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:3000');
    err.code = 'ECONNREFUSED';
    mcpOAuthTokenService.httpUtils = httpStub([{ err }], []);

    await assert.rejects(
      mcpOAuthTokenService.getToken('project-1', 'c1', 'bot-jwt'),
      (rejection) => {
        assert.strictEqual(rejection.status, 502);
        return true;
      }
    );
  });

  it('rejects with status 502 when the answer has no access_token', async () => {
    mcpOAuthTokenService.httpUtils = httpStub([{ data: { token_type: 'Bearer', expires_at: null } }], []);

    await assert.rejects(mcpOAuthTokenService.getToken('project-1', 'c1', 'bot-jwt'), (err) => err.status === 502);
  });

  it('does not cache a failure', async () => {
    const captured = [];
    mcpOAuthTokenService.httpUtils = httpStub([
      { err: httpError(503, { success: false }) },
      { data: { access_token: 't1', token_type: 'Bearer', expires_at: null } }
    ], captured);

    await assert.rejects(mcpOAuthTokenService.getToken('project-1', 'c1', 'bot-jwt'));
    const token = await mcpOAuthTokenService.getToken('project-1', 'c1', 'bot-jwt');

    assert.strictEqual(token.access_token, 't1');
    assert.strictEqual(captured.length, 2);
  });

});
