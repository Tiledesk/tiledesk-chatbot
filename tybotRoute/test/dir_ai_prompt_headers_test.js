var assert = require('assert');
const { DirAiPrompt } = require('../tiledeskChatbotPlugs/directives/DirAiPrompt');
const integrationService = require('../services/IntegrationService');
const mcpOAuthTokenService = require('../services/McpOAuthTokenService');
const httpUtils = require('../utils/HttpUtils');
const winston = require('../utils/winston');

describe('DirAiPrompt header values', function() {

  it('strips backslashes and newlines from an email body', () => {
    const emailBody = '-- \n' +
      'Giovanni Troisi\n' +
      '\n' +
      'Software Engineer\n' +
      'Tiledesk\n' +
      '[image: emailAddress] giovanni@tiledesk.com\n' +
      '[image: website] https://tiledesk.com/\n' +
      'Attachments:\n' +
      '[7.pdf](https://stage.eks.tiledesk.com/api/files/download?path=uploads/7.pdf)\n';

    const value = DirAiPrompt.sanitizeHeaderValue(emailBody);

    assert.strictEqual(value.includes('\\'), false);
    assert.strictEqual(/[\r\n]/.test(value), false);
    assert.ok(value.includes('Giovanni Troisi'));
    assert.ok(value.includes('giovanni@tiledesk.com'));
    assert.ok(value.includes('https://tiledesk.com/'));
    assert.ok(value.includes('[7.pdf](https://stage.eks.tiledesk.com/api/files/download?path=uploads/7.pdf)'));
  });

  it('decodes literal \\n sequences before dropping remaining backslashes', () => {
    const value = DirAiPrompt.sanitizeHeaderValue('hello\\nworld\\tend');
    assert.strictEqual(value, 'hello world end');
  });

  it('writes a header-safe x-last-user-text', () => {
    const headers = DirAiPrompt.prototype.mergeHeadersWithVariables.call({}, {}, {
      'x-last-user-text': 'Ciao\\n-- \nGiovanni\\nTroisi'
    });
    assert.strictEqual(headers['x-last-user-text'], 'Ciao -- Giovanni Troisi');
  });

});

describe('DirAiPrompt MCP OAuth bearer', function() {

  const TOKEN = 'oauth-access-t1';

  const mcpIntegration = {
    name: 'mcp',
    value: {
      servers: [
        {
          name: 'gmail',
          url: 'https://mcp.example/gmail',
          transport: 'streamable_http',
          oauth: { connection_id: 'c1', mode: 'mcp' },
          customHeaders: [
            { key: 'Authorization', value: 'x', enabled: true },
            { key: 'authorization', value: 'y', enabled: true },
            { key: 'X-Tenant', value: 'acme', enabled: true }
          ]
        },
        {
          name: 'drive',
          url: 'https://mcp.example/drive',
          transport: 'streamable_http',
          oauth: { connection_id: 'c2', mode: 'google' }
        },
        {
          name: 'plain',
          url: 'https://mcp.example/plain',
          transport: 'streamable_http',
          customHeaders: [{ key: 'X-Tenant', value: 'plain', enabled: true }]
        },
        {
          id: 'native-1',
          name: 'native',
          native: true,
          customHeaders: [{ key: 'X-Native', value: 'yes', enabled: true }]
        }
      ]
    }
  };

  const servers = {
    gmail: { name: 'gmail', transport: 'streamable_http', url: 'https://mcp.example/gmail' },
    drive: { name: 'drive', transport: 'streamable_http', url: 'https://mcp.example/drive' },
    plain: { name: 'plain', transport: 'streamable_http', url: 'https://mcp.example/plain' },
    native: { id: 'native-1', name: 'native', native: true }
  };

  let originals;
  let tokenCalls;
  let tokenAnswer;
  let llmRequests;
  let debugLogs;
  let params;
  let executed;
  let integration;

  beforeEach(() => {
    originals = {
      getKeyFromIntegrations: integrationService.getKeyFromIntegrations,
      getIntegration: integrationService.getIntegration,
      getToken: mcpOAuthTokenService.getToken,
      request: httpUtils.request,
      debug: winston.debug
    };
    tokenCalls = [];
    llmRequests = [];
    debugLogs = [];
    params = {};
    executed = [];
    integration = JSON.parse(JSON.stringify(mcpIntegration));
    tokenAnswer = (id_project, connection_id) =>
      Promise.resolve({ access_token: connection_id === 'c1' ? TOKEN : 'oauth-access-t2', token_type: 'Bearer', expires_at: null });

    integrationService.getKeyFromIntegrations = async () => 'llm-key';
    integrationService.getIntegration = async () => integration;
    mcpOAuthTokenService.getToken = (id_project, connection_id, token) => {
      tokenCalls.push({ id_project, connection_id, token });
      return tokenAnswer(id_project, connection_id, token);
    };
    httpUtils.request = (options, callback) => {
      llmRequests.push(options);
      callback(null, { answer: 'ok' });
    };
    winston.debug = (...args) => { debugLogs.push(args); };
  });

  afterEach(() => {
    integrationService.getKeyFromIntegrations = originals.getKeyFromIntegrations;
    integrationService.getIntegration = originals.getIntegration;
    mcpOAuthTokenService.getToken = originals.getToken;
    httpUtils.request = originals.request;
    winston.debug = originals.debug;
  });

  function newDir() {
    const tdcache = {
      hgetall: async () => ({ chatbotToken: JSON.stringify('chatbot-token'), project_id: JSON.stringify('p1') }),
      get: async (key) => key === 'native_mcp:servers'
        ? JSON.stringify([{ id: 'native-1', url: 'https://native.example/mcp' }])
        : null
    };
    const dir = new DirAiPrompt({
      chatbot: {
        addParameter: async (key, value) => { params[key] = value; },
        bot: { root_id: 'bot-1' },
        botId: 'bot-1'
      },
      tdcache: tdcache,
      requestId: 'support-group-p1-r1',
      projectId: 'p1',
      token: 'bot-jwt',
      API_ENDPOINT: 'http://api.test'
    });
    dir.intentDir = { execute: (directive, callback) => { executed.push(directive); if (callback) callback(); } };
    return dir;
  }

  function run(actionServers, extra) {
    const action = Object.assign({
      question: 'q',
      llm: 'myllm',
      model: 'm',
      servers: actionServers.map((server) => JSON.parse(JSON.stringify(server)))
    }, extra);
    return new Promise((resolve) => newDir().go(action, resolve));
  }

  function sentServers() {
    assert.strictEqual(llmRequests.length, 1);
    return llmRequests[0].json.servers;
  }

  it('sends the connection token as Authorization of its server', async () => {
    await run([servers.gmail, servers.drive]);

    const sent = sentServers();
    assert.strictEqual(sent.gmail.headers.Authorization, 'Bearer ' + TOKEN);
    assert.strictEqual(sent.gmail.headers['X-Tenant'], 'acme');
    assert.strictEqual(sent.drive.headers.Authorization, 'Bearer oauth-access-t2');
    assert.deepStrictEqual(tokenCalls.map((call) => call.connection_id).sort(), ['c1', 'c2']);
    assert.deepStrictEqual(tokenCalls[0], { id_project: 'p1', connection_id: tokenCalls[0].connection_id, token: 'bot-jwt' });
  });

  it('overrides an Authorization coming from the custom headers', async () => {
    await run([servers.gmail]);

    const headers = sentServers().gmail.headers;
    const authorizationKeys = Object.keys(headers).filter((key) => key.toLowerCase() === 'authorization');
    assert.deepStrictEqual(authorizationKeys, ['Authorization']);
    assert.strictEqual(headers.Authorization, 'Bearer ' + TOKEN);
  });

  it('does not ask for a token when the server has no oauth', async () => {
    await run([servers.plain]);

    assert.strictEqual(tokenCalls.length, 0);
    assert.deepStrictEqual(sentServers().plain.headers, { 'X-Tenant': 'plain' });
  });

  it('keeps the flow variable headers of a native server and asks no token', async () => {
    await run([servers.native]);

    assert.strictEqual(tokenCalls.length, 0);
    const native = sentServers().native;
    assert.strictEqual(native.url, 'https://native.example/mcp');
    assert.strictEqual(native.headers['X-Native'], 'yes');
    assert.strictEqual(native.headers['x-chatbotToken'], 'chatbot-token');
    assert.strictEqual(native.headers['x-project-id'], 'p1');
    assert.strictEqual(native.headers['x-chatbot-id'], 'bot-1');
    assert.strictEqual(native.headers.Authorization, undefined);
  });

  it('never asks a token for a native server, even with an oauth reference', async () => {
    integration.value.servers[3].oauth = { connection_id: 'c-native', mode: 'mcp' };

    await run([servers.native]);

    assert.strictEqual(tokenCalls.length, 0);
    assert.strictEqual(sentServers().native.headers.Authorization, undefined);
  });

  it('fails the action and runs the false intent when the connection needs reauth', async () => {
    tokenAnswer = () => {
      const err = new Error('needs reauth');
      err.status = 409;
      err.code = 'needs_reauth';
      return Promise.reject(err);
    };

    const stop = await run([servers.gmail, servers.plain], { falseIntent: '#FAILURE' });

    assert.strictEqual(stop, true);
    assert.strictEqual(params.flowError, 'MCP server gmail needs to be reconnected');
    assert.strictEqual(executed.length, 1);
    assert.strictEqual(llmRequests.length, 0);
  });

  it('fails the action without false intent when the token is unavailable', async () => {
    tokenAnswer = () => {
      const err = new Error('unreachable');
      err.status = 502;
      return Promise.reject(err);
    };

    const stop = await run([servers.gmail]);

    assert.strictEqual(stop, undefined);
    assert.strictEqual(params.flowError, 'MCP server gmail OAuth token unavailable');
    assert.strictEqual(executed.length, 0);
    assert.strictEqual(llmRequests.length, 0);
  });

  it('keeps the token out of the debug logs', async () => {
    await run([servers.gmail]);

    assert.strictEqual(sentServers().gmail.headers.Authorization, 'Bearer ' + TOKEN);
    const jsonLog = debugLogs.find((args) => args[0] === 'DirAiPrompt json: ');
    assert.strictEqual(jsonLog[1].servers.gmail.headers.Authorization, '[REDACTED]');
    for (const args of debugLogs) {
      assert.strictEqual(JSON.stringify(args).includes(TOKEN), false, JSON.stringify(args[0]));
    }
  });

});
