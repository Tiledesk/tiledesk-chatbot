'use strict';

// tybotRoute/services, exercised directly.
//
// The services are thin, but "thin" is where the url, the method, the auth
// header and the error convention live - and every directive above them
// depends on all four. What the conversation-* files cannot reach is the
// failure half: a non-2xx, a transport error, a body that is not the shape the
// caller expects, an integration that is absent.
//
// Two mechanisms are used, and both assert on real observable output:
//  - an express mock on 10002 for everything that resolves its url through
//    config/endpoints (that is where run-tests.js points every endpoint
//    variable);
//  - a stub over utils/HttpUtils.request for the two services whose base url
//    is a hardcoded literal (OpenAIAssistantsService talks to api.openai.com)
//    or whose transport cannot be pointed at the mock. The stub records the
//    request object those services BUILD, which is exactly the thing under
//    test.

var assert = require('assert');
var express = require('express');
const bodyParser = require('body-parser');

const httpUtils = require('../utils/HttpUtils');
const openAIAssistantsService = require('../services/OpenAIAssistantsService');
const aiPromptRequestService = require('../services/AiPromptRequestService');
const AiService = require('../services/AIService');
const aiController = require('../services/AIController');
const quotasService = require('../services/QuotasService');
const tilebotService = require('../services/TilebotService');
const kbService = require('../services/KbService');
const kbSettingsService = require('../services/KbSettingsService');
const mcpService = require('../services/McpService');
const dataTablesService = require('../services/DataTablesService');
const makeService = require('../services/MakeService');
const integrationService = require('../services/IntegrationService');
const faqKbService = require('../services/FaqKbService');
const faqService = require('../services/FaqService');
const Faq_kb = require('../models/faq_kb');
const Faq = require('../models/faq');

const PROJECT_ID = "projectID";
const MOCK_PORT = 10002;
const MOCK = 'http://localhost:' + MOCK_PORT;

// --------------------------------------------------------------- http stub

/**
 * Replaces utils/HttpUtils.request with a recorder. The services hold the
 * MODULE, not the function, so the swap is seen by everything already loaded.
 */
function stubHttp(handler) {
  const original = httpUtils.request;
  const calls = [];
  httpUtils.request = function (options, callback) {
    calls.push(options);
    handler(options, callback);
  };
  return {
    calls,
    last() { return calls[calls.length - 1]; },
    restore() { httpUtils.request = original; }
  };
}

const OK = (body) => (options, callback) => callback(null, body === undefined ? { ok: true } : body);
const FAIL = (err) => (options, callback) => callback(err || new Error("boom"), null);

// ------------------------------------------------------------ mongoose stub

/** A `Model.find(q).sort(s).lean().exec(cb)` chain that records what it was asked. */
function stubModel(model, result, error) {
  const original = model.find;
  const seen = { query: null, sort: null };
  model.find = (query) => {
    seen.query = query;
    const chain = {
      sort: (s) => { seen.sort = s; return chain; },
      lean: () => chain,
      exec: (cb) => cb(error || null, result)
    };
    return chain;
  };
  return { seen, restore() { model.find = original; } };
}

// ------------------------------------------------------------------- mock

function startMock(register) {
  return new Promise((resolve) => {
    const seen = { calls: [] };
    const server = express();
    server.use(bodyParser.json());
    register(server, seen);
    const listener = server.listen(MOCK_PORT, '0.0.0.0', () => {
      resolve({ seen, close: () => new Promise((r) => listener.close(() => r())) });
    });
  });
}

// ==================================================================== tests

describe('Services tybotRoute/services', function () {

  // ------------------------------------------------ OpenAIAssistantsService

  describe('OpenAIAssistantsService', function () {

    it('createThread POSTs an empty body to the Assistants threads endpoint', async () => {
      const http = stubHttp(OK({ id: "th-1" }));
      try {
        const thread = await openAIAssistantsService.createThread("Bearer sk-1", 15000, "(test)");

        assert.deepStrictEqual(thread, { id: "th-1" });
        assert.deepStrictEqual(http.last(), {
          url: "https://api.openai.com/v1/threads",
          headers: { "Authorization": "Bearer sk-1", "OpenAI-Beta": "assistants=v2" },
          json: '',
          method: "POST",
          timeout: 15000
        });
      } finally {
        http.restore();
      }
    });

    it('addMessage POSTs the prompt as a user message and resolves with nothing', async () => {
      const http = stubHttp(OK({ id: "msg-1" }));
      try {
        const out = await openAIAssistantsService.addMessage("hello", "th-1", "Bearer sk-1", 1000);

        assert.strictEqual(out, undefined, 'addMessage deliberately resolves with nothing');
        assert.strictEqual(http.last().url, "https://api.openai.com/v1/threads/th-1/messages");
        assert.strictEqual(http.last().method, "POST");
        assert.deepStrictEqual(http.last().json, { role: "user", content: "hello" });
        assert.strictEqual(http.last().headers["OpenAI-Beta"], "assistants=v2");
      } finally {
        http.restore();
      }
    });

    it('createRun POSTs the assistant id to the thread runs endpoint', async () => {
      const http = stubHttp(OK({ id: "run-1", status: "queued" }));
      try {
        const run = await openAIAssistantsService.createRun("th-1", "asst-9", "Bearer sk-1", 1000);

        assert.deepStrictEqual(run, { id: "run-1", status: "queued" });
        assert.strictEqual(http.last().url, "https://api.openai.com/v1/threads/th-1/runs");
        assert.deepStrictEqual(http.last().json, { assistant_id: "asst-9" });
      } finally {
        http.restore();
      }
    });

    it('getRun GETs one run, with a null body so no data is sent', async () => {
      const http = stubHttp(OK({ id: "run-1", status: "completed" }));
      try {
        const run = await openAIAssistantsService.getRun("th-1", "run-1", "Bearer sk-1", 1000);

        assert.strictEqual(run.status, "completed");
        assert.strictEqual(http.last().url, "https://api.openai.com/v1/threads/th-1/runs/run-1");
        assert.strictEqual(http.last().method, "GET");
        assert.strictEqual(http.last().json, null);
      } finally {
        http.restore();
      }
    });

    it('threadMessages GETs the thread message list', async () => {
      const http = stubHttp(OK({ data: [{ id: "m1" }] }));
      try {
        const messages = await openAIAssistantsService.threadMessages("th-1", "Bearer sk-1", 1000);

        assert.deepStrictEqual(messages, { data: [{ id: "m1" }] });
        assert.strictEqual(http.last().url, "https://api.openai.com/v1/threads/th-1/messages");
        assert.strictEqual(http.last().method, "GET");
      } finally {
        http.restore();
      }
    });

    it('every one of the five rejects with the raw error when the request fails', async () => {
      const boom = new Error("openai is down");
      const http = stubHttp(FAIL(boom));
      try {
        await assert.rejects(() => openAIAssistantsService.createThread("Bearer k"), /openai is down/);
        await assert.rejects(() => openAIAssistantsService.addMessage("p", "t", "Bearer k"), /openai is down/);
        await assert.rejects(() => openAIAssistantsService.createRun("t", "a", "Bearer k"), /openai is down/);
        await assert.rejects(() => openAIAssistantsService.getRun("t", "r", "Bearer k"), /openai is down/);
        await assert.rejects(() => openAIAssistantsService.threadMessages("t", "Bearer k"), /openai is down/);
        assert.strictEqual(http.calls.length, 5);
      } finally {
        http.restore();
      }
    });

  });

  // ------------------------------------------------- AiPromptRequestService

  describe('AiPromptRequestService', function () {

    it('checkMandatoryParameters names the first attribute that is missing', async () => {
      assert.strictEqual(await aiPromptRequestService.checkMandatoryParameters({ question: "q", llm: "openai", model: "m" }), true);
      await assert.rejects(() => aiPromptRequestService.checkMandatoryParameters({ llm: "openai", model: "m" }),
        (e) => e === 'question');
      await assert.rejects(() => aiPromptRequestService.checkMandatoryParameters({ question: "q", model: "m" }),
        (e) => e === 'llm');
    });

    it('transcriptToLLM merges consecutive turns, drops a leading assistant and skips slash commands', async () => {
      assert.deepStrictEqual(await aiPromptRequestService.transcriptToLLM([]), {});
      assert.deepStrictEqual(
        await aiPromptRequestService.transcriptToLLM([
          { role: 'assistant', content: 'welcome' },
          { role: 'user', content: 'a' },
          { role: 'user', content: 'b' },
          { role: 'assistant', content: 'ok' },
          { role: 'user', content: 'c' },
          { role: 'assistant', content: 'fine' }
        ]),
        { 0: { question: 'a\nb', answer: 'ok' }, 1: { question: 'c', answer: 'fine' } });
      assert.deepStrictEqual(
        await aiPromptRequestService.transcriptToLLM([
          { role: 'user', content: '/start' },
          { role: 'assistant', content: 'hi' }
        ]), {});
      assert.deepStrictEqual(
        await aiPromptRequestService.transcriptToLLM([{ role: 'user', content: 'lonely' }]), {},
        'an unanswered last question is left out');
    });

    it('buildThinkingObject budgets 60/40/20 percent by level, defaulting to low', () => {
      assert.strictEqual(aiPromptRequestService.buildThinkingObject('high', 1000).budget_tokens, 600);
      assert.strictEqual(aiPromptRequestService.buildThinkingObject('medium', 1000).budget_tokens, 400);
      assert.strictEqual(aiPromptRequestService.buildThinkingObject('low', 1000).budget_tokens, 200);
      const other = aiPromptRequestService.buildThinkingObject('whatever', 999);
      assert.strictEqual(other.budget_tokens, 199, 'the budget is floored, not rounded');
      assert.strictEqual(other.reasoning_effort, 'whatever');
      assert.strictEqual(other.type, 'enabled');
    });

    it('buildEnabledTools reads enabled_tools first and falls back to tools', () => {
      assert.deepStrictEqual(aiPromptRequestService.buildEnabledTools({ enabled_tools: ['a', { name: 'b' }, 3, { }] }), ['a', 'b']);
      assert.deepStrictEqual(aiPromptRequestService.buildEnabledTools({ tools: ['c'] }), ['c'],
        'the older `tools` key is still honoured');
      assert.deepStrictEqual(aiPromptRequestService.buildEnabledTools({ enabled_tools: [], tools: ['c'] }), ['c']);
      assert.deepStrictEqual(aiPromptRequestService.buildEnabledTools(undefined), []);
      assert.deepStrictEqual(aiPromptRequestService.buildEnabledTools({ enabled_tools: "nope" }), []);
    });

    it('getIntegrationServer matches on id first, then on name, then gives up', () => {
      const servers = [{ id: "1", name: "alpha" }, { id: "2", name: "beta" }];
      assert.deepStrictEqual(aiPromptRequestService.getIntegrationServer(servers, { id: "2" }), servers[1]);
      assert.deepStrictEqual(aiPromptRequestService.getIntegrationServer(servers, { id: "9", name: "alpha" }), servers[0],
        'an id that matches nothing falls through to the name');
      assert.strictEqual(aiPromptRequestService.getIntegrationServer(servers, { name: "gamma" }), null);
      assert.strictEqual(aiPromptRequestService.getIntegrationServer(servers, {}), null);
      assert.strictEqual(aiPromptRequestService.getIntegrationServer("not an array", { id: "1" }), null);
      assert.strictEqual(aiPromptRequestService.getIntegrationServer(servers, null), null);
    });

    it('enrichServersFromIntegration overwrites url, transport and key, and merges headers', () => {
      const servers = [{ id: "1", name: "alpha", url: "http://stale", headers: { "X-Mine": "keep" } }];
      aiPromptRequestService.enrichServersFromIntegration(servers, {
        value: {
          servers: [{
            id: "1", url: "http://fresh", transport: "sse",
            authorization: { key: "k" },
            customHeaders: [{ key: "X-Theirs", value: "v" }]
          }]
        }
      });
      assert.deepStrictEqual(servers[0], {
        id: "1", name: "alpha", url: "http://fresh", transport: "sse", api_key: "k",
        headers: { "X-Mine": "keep", "X-Theirs": "v" }
      });
    });

    it('enrichServersFromIntegration strips the url of a native server', () => {
      const servers = [{ id: "1", name: "alpha", native: true, url: "http://stale", headers: "not an object" }];
      aiPromptRequestService.enrichServersFromIntegration(servers, {
        value: { servers: [{ id: "1", url: "http://fresh", customHeaders: [{ key: "X", value: "1" }] }] }
      });
      assert.strictEqual('url' in servers[0], false, 'a native server takes its url from the native cache, not here');
      assert.deepStrictEqual(servers[0].headers, { X: "1" }, 'a non-object headers value is replaced, not merged into');
    });

    it('enrichServersFromIntegration does nothing without both arrays, or without a match', () => {
      const servers = [{ id: "1", url: "http://stale" }];
      aiPromptRequestService.enrichServersFromIntegration(servers, undefined);
      aiPromptRequestService.enrichServersFromIntegration(servers, { value: { servers: "nope" } });
      aiPromptRequestService.enrichServersFromIntegration(servers, { value: { servers: [{ id: "other" }] } });
      aiPromptRequestService.enrichServersFromIntegration("not an array", { value: { servers: [] } });
      assert.deepStrictEqual(servers, [{ id: "1", url: "http://stale" }]);
    });

    it('customHeadersToObject drops disabled and keyless headers and stringifies the values', () => {
      assert.deepStrictEqual(aiPromptRequestService.customHeadersToObject([
        { key: "A", value: 1 },
        { key: "B", value: null },
        { key: "C", value: "c", enabled: false },
        { value: "no key" },
        { key: "D", value: "d", enabled: true }
      ]), { A: "1", B: "", D: "d" });
      assert.deepStrictEqual(aiPromptRequestService.customHeadersToObject(undefined), {});
    });

    it('mergeHeadersWithVariables stringifies both sides and skips what cannot be sent', () => {
      const out = aiPromptRequestService.mergeHeadersWithVariables(
        { "X-Num": 7, "X-Obj": { a: 1 }, "X-Str": "s" },
        { "x-null": null, "x-undef": undefined, "x-fn": () => 1, "x-obj": { b: 2 }, "x-num": 3 }
      );
      assert.deepStrictEqual(out, {
        "X-Num": "7", "X-Obj": '{"a":1}', "X-Str": "s",
        "x-null": "", "x-obj": '{"b":2}', "x-num": "3"
      });
      assert.deepStrictEqual(aiPromptRequestService.mergeHeadersWithVariables("not an object", null), {});
      assert.deepStrictEqual(aiPromptRequestService.mergeHeadersWithVariables({ a: "1" }, ["not", "an", "object"]), { a: "1" });
    });

    it('mergeHeadersWithVariables survives a variable that throws when it is read', () => {
      const variables = {};
      Object.defineProperty(variables, 'boom', {
        enumerable: true,
        get() { throw new Error("no reading that"); }
      });
      variables.fine = "yes";
      const out = aiPromptRequestService.mergeHeadersWithVariables({}, variables);
      assert.deepStrictEqual(out, { fine: "yes" }, 'the unreadable key is skipped, the rest still merges');
    });

  });

  // -------------------------------------------------------------- AIService

  describe('AIService', function () {

    it('speechToText POSTs the media url to the project transcription endpoint', async () => {
      const http = stubHttp(OK({ text: "hello there" }));
      try {
        const service = new AiService({ API_ENDPOINT: MOCK, TOKEN: "XXX", PROJECT_ID: PROJECT_ID });
        const out = await service.speechToText("http://files.test/voice.ogg");

        assert.deepStrictEqual(out, { text: "hello there" });
        assert.strictEqual(http.last().url, MOCK + "/" + PROJECT_ID + "/llm/transcription");
        assert.strictEqual(http.last().method, "POST");
        assert.strictEqual(http.last().headers.Authorization, "JWT XXX");
        assert.deepStrictEqual(http.last().json, { url: "http://files.test/voice.ogg" });
      } finally {
        http.restore();
      }
    });

    it('speechToText rejects when the transcription fails', async () => {
      const http = stubHttp(FAIL(new Error("no audio")));
      try {
        const service = new AiService({ API_ENDPOINT: MOCK, TOKEN: "JWT XXX", PROJECT_ID: PROJECT_ID });
        await assert.rejects(() => service.speechToText("http://files.test/voice.ogg"), /no audio/);
        assert.strictEqual(http.last().headers.Authorization, "JWT XXX", 'an already-prefixed token is left alone');
      } finally {
        http.restore();
      }
    });

  });

  // ----------------------------------------------------------- AIController

  describe('AIController', function () {

    function integrationMock(map) {
      return startMock((server) => {
        server.get('/:project_id/integration/name/:name', (req, res) => {
          const body = map[req.params.name];
          if (body === undefined) { res.status(404).send({ error: "not found" }); return; }
          res.status(200).send(body);
        });
      });
    }

    it('a non-ollama provider resolves to the integration apikey', async () => {
      const mock = await integrationMock({ openai: { value: { apikey: "sk-1" } } });
      try {
        assert.deepStrictEqual(await aiController.resolveLLMConfig(PROJECT_ID, 'openai', 'gpt-4o', 'XXX'),
          { provider: 'openai', name: 'gpt-4o', api_key: 'sk-1' });
      } finally {
        await mock.close();
      }
    });

    it('a missing ollama integration throws a 422 naming the provider', async () => {
      const mock = await integrationMock({});
      try {
        await assert.rejects(() => aiController.resolveLLMConfig(PROJECT_ID, 'ollama', 'llama3', 'XXX'),
          (e) => e.code === 422 && e.error === 'ollama integration not found');
      } finally {
        await mock.close();
      }
    });

    it('an ollama integration with no url throws rather than resolving a broken config', async () => {
      const mock = await integrationMock({ ollama: { value: { apikey: "k" } } });
      try {
        await assert.rejects(() => aiController.resolveLLMConfig(PROJECT_ID, 'ollama', 'llama3', 'XXX'),
          (e) => e.code === 422 && e.error === 'Server url for ollama is empty or invalid');
      } finally {
        await mock.close();
      }
    });

    it('an ollama integration resolves url, key and token', async () => {
      const mock = await integrationMock({ ollama: { value: { url: "http://ollama.test", apikey: "k", token: "t" } } });
      try {
        assert.deepStrictEqual(await aiController.resolveLLMConfig(PROJECT_ID, 'ollama', 'llama3', 'XXX'),
          { provider: 'ollama', name: 'llama3', url: 'http://ollama.test', api_key: 'k', token: 't' });
      } finally {
        await mock.close();
      }
    });

    it('a single-server vllm integration resolves without a server name', async () => {
      const mock = await integrationMock({ vllm: { value: { url: "http://vllm.test" } } });
      try {
        assert.deepStrictEqual(await aiController.resolveLLMConfig(PROJECT_ID, 'vllm', 'mistral', 'XXX'),
          { provider: 'vllm', name: 'mistral', url: 'http://vllm.test', api_key: '', token: null });
      } finally {
        await mock.close();
      }
    });

    it('a multi-server vllm integration needs a server name, and one that exists with a url', async () => {
      const mock = await integrationMock({
        vllm: { value: { servers: [{ name: "eu-1", url: "http://vllm.test", apikey: "vk" }, { name: "no-url" }] } }
      });
      try {
        await assert.rejects(() => aiController.resolveLLMConfig(PROJECT_ID, 'vllm', 'm', 'XXX'),
          (e) => e.code === 422 && e.error === 'vllmServer attribute is undefined');
        await assert.rejects(() => aiController.resolveLLMConfig(PROJECT_ID, 'vllm', 'm', 'XXX', 'us-2'),
          (e) => e.code === 422 && e.error === "vllm server 'us-2' not found");
        await assert.rejects(() => aiController.resolveLLMConfig(PROJECT_ID, 'vllm', 'm', 'XXX', 'no-url'),
          (e) => e.code === 422 && e.error === 'Server url for vllm is empty or invalid');
        assert.deepStrictEqual(await aiController.resolveLLMConfig(PROJECT_ID, 'vllm', 'm', 'XXX', 'eu-1'),
          { provider: 'vllm', name: 'm', url: 'http://vllm.test', api_key: 'vk' });
      } finally {
        await mock.close();
      }
    });

  });

  // ----------------------------------------------------------- QuotasService

  describe('QuotasService', function () {

    it('checkQuoteAvailability reports what the api says', async () => {
      const mock = await startMock((server, seen) => {
        server.get('/:project_id/quotes/tokens', (req, res) => {
          seen.calls.push(req.headers.authorization);
          res.status(200).send({ isAvailable: req.params.project_id === "yes" });
        });
      });
      try {
        assert.strictEqual(await quotasService.checkQuoteAvailability("yes", "XXX"), true);
        assert.strictEqual(await quotasService.checkQuoteAvailability("no", "XXX"), false);
        assert.deepStrictEqual(mock.seen.calls, ["JWT XXX", "JWT XXX"]);
      } finally {
        await mock.close();
      }
    });

    it('a quota endpoint that fails is treated as available, so the flow is never blocked by an outage', async () => {
      const mock = await startMock((server) => {
        server.get('/:project_id/quotes/tokens', (req, res) => res.status(500).send({ error: "down" }));
      });
      try {
        assert.strictEqual(await quotasService.checkQuoteAvailability(PROJECT_ID, "XXX"), true);
      } finally {
        await mock.close();
      }
    });

    it('updateQuote POSTs the usage, and rejects when the api refuses it', async () => {
      const mock = await startMock((server, seen) => {
        server.post('/:project_id/quotes/incr/tokens', (req, res) => {
          seen.calls.push(req.body);
          if (req.body.tokens < 0) { res.status(400).send({ error: "negative" }); return; }
          res.status(200).send({ success: true });
        });
      });
      try {
        assert.strictEqual(await quotasService.updateQuote(PROJECT_ID, "XXX", { tokens: 10, model: "gpt-4o" }), true);
        await assert.rejects(() => quotasService.updateQuote(PROJECT_ID, "XXX", { tokens: -1 }), (e) => e === false);
        assert.deepStrictEqual(mock.seen.calls, [{ tokens: 10, model: "gpt-4o" }, { tokens: -1 }]);
      } finally {
        await mock.close();
      }
    });

  });

  // ---------------------------------------------------------- TilebotService

  describe('TilebotService', function () {

    it('sendMessageToBot POSTs the envelope to /ext/{botId}', async () => {
      const http = stubHttp(OK({ success: true }));
      try {
        const res = await new Promise((resolve) => {
          tilebotService.sendMessageToBot({ payload: { text: "/hi" } }, "botID", (err, body) => resolve({ err, body }));
        });

        assert.strictEqual(res.err, null);
        assert.deepStrictEqual(res.body, { success: true });
        assert.ok(http.last().url.endsWith("/ext/botID"), http.last().url);
        assert.strictEqual(http.last().method, "POST");
        assert.deepStrictEqual(http.last().json, { payload: { text: "/hi" } });
      } finally {
        http.restore();
      }
    });

    it('executeBlock POSTs the same envelope to /exec/{botId}', async () => {
      const http = stubHttp(OK({ success: true }));
      try {
        const res = await new Promise((resolve) => {
          tilebotService.executeBlock({ payload: { text: "/block" } }, "botID", (err, body) => resolve({ err, body }));
        });

        assert.strictEqual(res.err, null);
        assert.ok(http.last().url.endsWith("/exec/botID"), http.last().url);
        assert.deepStrictEqual(http.last().json, { payload: { text: "/block" } });
      } finally {
        http.restore();
      }
    });

    it('both hand the error straight back when the post fails', async () => {
      const http = stubHttp(FAIL(new Error("tilebot is down")));
      try {
        const a = await new Promise((r) => tilebotService.sendMessageToBot({}, "b", (err) => r(err)));
        const b = await new Promise((r) => tilebotService.executeBlock({}, "b", (err) => r(err)));
        assert.strictEqual(a.message, "tilebot is down");
        assert.strictEqual(b.message, "tilebot is down");
      } finally {
        http.restore();
      }
    });

  });

  // -------------------------------------------------------------- KbService

  describe('KbService', function () {

    it('getKeyFromKbSettings delegates to KbSettingsService', async () => {
      const mock = await startMock((server, seen) => {
        server.get('/:project_id/kbsettings', (req, res) => {
          seen.calls.push(req.headers.authorization);
          res.status(200).send({ gptkey: "sk-kbsettings" });
        });
      });
      try {
        assert.strictEqual(await kbService.getKeyFromKbSettings(PROJECT_ID, "XXX"), "sk-kbsettings");
        assert.deepStrictEqual(mock.seen.calls, ["JWT XXX"]);
      } finally {
        await mock.close();
      }
    });

    it('kb settings with no gptkey resolve null rather than undefined', async () => {
      const mock = await startMock((server) => {
        server.get('/:project_id/kbsettings', (req, res) => res.status(200).send({ other: 1 }));
      });
      try {
        assert.strictEqual(await kbSettingsService.getKeyFromKbSettings(PROJECT_ID, "XXX"), null);
      } finally {
        await mock.close();
      }
    });

    it('getNamespaceOrNull resolves null when the lookup fails and undefined when nothing matches', async () => {
      const mock = await startMock((server) => {
        server.get('/:project_id/kb/namespace/all', (req, res) => {
          if (req.params.project_id === "broken") { res.status(500).send({ error: "down" }); return; }
          res.status(200).send([{ id: "N1", name: "Alpha" }]);
        });
      });
      try {
        assert.strictEqual(await kbService.getNamespaceOrNull("broken", "XXX", null, "N1"), null);
        assert.strictEqual(await kbService.getNamespaceOrNull(PROJECT_ID, "XXX", null, "N9"), undefined);
        assert.deepStrictEqual(await kbService.getNamespaceOrNull(PROJECT_ID, "XXX", "Alpha", null), { id: "N1", name: "Alpha" });
        assert.deepStrictEqual(await kbService.getNamespaceOrNull(PROJECT_ID, "XXX", null, "N1"), { id: "N1", name: "Alpha" });
      } finally {
        await mock.close();
      }
    });

    it('addContent hands the raw error back instead of rejecting', async () => {
      const mock = await startMock((server, seen) => {
        server.post('/:project_id/kb', (req, res) => {
          seen.calls.push(req.body);
          res.status(500).send({ error: "kb down" });
        });
      });
      try {
        const out = await kbService.addContent(PROJECT_ID, "XXX", { content: "c" });
        assert.ok(out.err, 'addContent never rejects; the error comes back in the tuple');
        assert.strictEqual(out.resbody, null);
        assert.deepStrictEqual(mock.seen.calls, [{ content: "c" }]);
      } finally {
        await mock.close();
      }
    });

    it('addAnsweredQuestion and addUnansweredQuestion POST the data and reject on failure', async () => {
      const mock = await startMock((server, seen) => {
        server.post('/:project_id/kb/answered', (req, res) => {
          seen.calls.push(['answered', req.body, req.headers.authorization]);
          res.status(200).send({ success: true });
        });
        server.post('/:project_id/kb/unanswered', (req, res) => {
          seen.calls.push(['unanswered', req.body]);
          res.status(500).send({ error: "down" });
        });
      });
      try {
        assert.deepStrictEqual(await kbService.addAnsweredQuestion(PROJECT_ID, { question: "q" }, "XXX"), { success: true });
        await assert.rejects(() => kbService.addUnansweredQuestion(PROJECT_ID, { question: "u" }, "XXX"));
        assert.deepStrictEqual(mock.seen.calls, [
          ['answered', { question: "q" }, "JWT XXX"],
          ['unanswered', { question: "u" }]
        ]);
      } finally {
        await mock.close();
      }
    });

  });

  // -------------------------------------------------------------- McpService

  describe('McpService', function () {

    it('fetchNativeServers GETs the native mcp endpoint and reports only the error', async () => {
      const mock = await startMock((server, seen) => {
        server.get('/:project_id/mcp/native', (req, res) => {
          seen.calls.push(req.headers.authorization);
          if (req.params.project_id === "broken") { res.status(500).send({ error: "down" }); return; }
          res.status(200).send({ servers: ["ignored"] });
        });
      });
      try {
        assert.deepStrictEqual(await mcpService.fetchNativeServers(PROJECT_ID, "XXX"), { err: null },
          'the body is deliberately discarded; the server repopulates the cache');
        const failed = await mcpService.fetchNativeServers("broken", "XXX");
        assert.ok(failed.err);
        assert.deepStrictEqual(mock.seen.calls, ["JWT XXX", "JWT XXX"]);
      } finally {
        await mock.close();
      }
    });

  });

  // ------------------------------------------------------- DataTablesService

  describe('DataTablesService', function () {

    it('listRows forwards the match alias as well as must_match', async () => {
      const mock = await startMock((server, seen) => {
        server.get('/:projectId/tables/:tableId/rows/list', (req, res) => {
          seen.calls.push(req.query);
          res.status(200).send([{ id: 1 }]);
        });
      });
      try {
        await dataTablesService.listRows(PROJECT_ID, "T1", "XXX", { match: "any", must_match: "all", conditions: [{ column: "c" }] });
        assert.deepStrictEqual(mock.seen.calls[0], {
          match: "any", must_match: "all", conditions: '[{"column":"c"}]'
        });
      } finally {
        await mock.close();
      }
    });

    it('every mutating call rejects when the api refuses it', async () => {
      const mock = await startMock((server, seen) => {
        const deny = (kind) => (req, res) => { seen.calls.push(kind); res.status(422).send({ message: "no" }); };
        server.get('/:projectId/tables/:tableId/rows/list', deny('list'));
        server.post('/:projectId/tables/:tableId/row/insert', deny('insert'));
        server.put('/:projectId/tables/:tableId/row/update', deny('update'));
        server.put('/:projectId/tables/:tableId/row/upsert', deny('upsert'));
        server.put('/:projectId/tables/:tableId/row/delete', deny('delete'));
      });
      try {
        await assert.rejects(() => dataTablesService.listRows(PROJECT_ID, "T1", "XXX"));
        await assert.rejects(() => dataTablesService.insertRow(PROJECT_ID, "T1", "XXX", { data: {} }));
        await assert.rejects(() => dataTablesService.updateRow(PROJECT_ID, "T1", "XXX", { data: {} }));
        await assert.rejects(() => dataTablesService.upsertRow(PROJECT_ID, "T1", "XXX", { data: {} }));
        await assert.rejects(() => dataTablesService.deleteRow(PROJECT_ID, "T1", "XXX", {}));
        assert.deepStrictEqual(mock.seen.calls, ['list', 'insert', 'update', 'upsert', 'delete']);
      } finally {
        await mock.close();
      }
    });

  });

  // ------------------------------------------------------------- MakeService

  describe('MakeService', function () {

    it('without the MAKE_ENDPOINT override the bot author url is used as-is', async () => {
      const was = process.env.MAKE_ENDPOINT;
      delete process.env.MAKE_ENDPOINT;
      const mock = await startMock((server, seen) => {
        server.post('/author/hook', (req, res) => { seen.calls.push(req.body); res.status(200).send({ ok: true }); });
      });
      try {
        const out = await makeService.trigger(MOCK + "/author/hook", { a: 1 });
        assert.strictEqual(out.err, null, 'MakeService never reports an error in the err position');
        assert.strictEqual(out.res.status, 200);
        assert.deepStrictEqual(mock.seen.calls, [{ a: 1 }]);
      } finally {
        if (was === undefined) delete process.env.MAKE_ENDPOINT; else process.env.MAKE_ENDPOINT = was;
        await mock.close();
      }
    });

    it('a non-2xx from Make still arrives in the success position, with its status', async () => {
      const was = process.env.MAKE_ENDPOINT;
      delete process.env.MAKE_ENDPOINT;
      const mock = await startMock((server) => {
        server.post('/author/hook', (req, res) => res.status(404).send({ error: "no such scenario" }));
      });
      try {
        const out = await makeService.trigger(MOCK + "/author/hook", { a: 1 });
        assert.strictEqual(out.err, null);
        assert.strictEqual(out.res.status, 404);
        assert.ok(typeof out.res.error === 'string' && out.res.error.length > 0, out.res.error);
        assert.strictEqual(out.res.data, null);
      } finally {
        if (was === undefined) delete process.env.MAKE_ENDPOINT; else process.env.MAKE_ENDPOINT = was;
        await mock.close();
      }
    });

    it('an unreachable webhook is reported with the synthetic 1000 status', async () => {
      const was = process.env.MAKE_ENDPOINT;
      delete process.env.MAKE_ENDPOINT;
      try {
        const out = await makeService.trigger("http://127.0.0.1:10099/nothing", { a: 1 });
        assert.strictEqual(out.err, null);
        assert.strictEqual(out.res.status, 1000, 'a transport failure has no status of its own');
        assert.ok(typeof out.res.error === 'string' && out.res.error.length > 0, out.res.error);
      } finally {
        if (was === undefined) delete process.env.MAKE_ENDPOINT; else process.env.MAKE_ENDPOINT = was;
      }
    });

  });

  // ------------------------------------------------------ IntegrationService

  describe('IntegrationService', function () {

    it('getIntegration and getKeyFromIntegrations both resolve null on a failed lookup', async () => {
      const mock = await startMock((server) => {
        server.get('/:project_id/integration/name/:name', (req, res) => {
          if (req.params.name === "openai") { res.status(200).send({ name: "openai", value: { apikey: "sk-1" } }); return; }
          if (req.params.name === "empty") { res.status(200).send({ name: "empty" }); return; }
          res.status(404).send({ error: "not found" });
        });
      });
      try {
        assert.strictEqual(await integrationService.getKeyFromIntegrations(PROJECT_ID, "openai", "XXX"), "sk-1");
        assert.strictEqual(await integrationService.getKeyFromIntegrations(PROJECT_ID, "empty", "XXX"), null,
          'an integration with no value has no key');
        assert.strictEqual(await integrationService.getKeyFromIntegrations(PROJECT_ID, "nope", "XXX"), null);
        assert.deepStrictEqual(await integrationService.getIntegration(PROJECT_ID, "openai", "XXX"),
          { name: "openai", value: { apikey: "sk-1" } });
        assert.strictEqual(await integrationService.getIntegration(PROJECT_ID, "nope", "XXX"), null,
          'getIntegration RESOLVES null on failure - it never rejects');
      } finally {
        await mock.close();
      }
    });

  });

  // --------------------------------------------------- FaqKbService, FaqService

  describe('FaqKbService and FaqService', function () {

    it('getAll defaults to the public, certified, untrashed bots sorted by score', async () => {
      const stub = stubModel(Faq_kb, [{ _id: "b1" }]);
      try {
        const bots = await faqKbService.getAll();
        assert.deepStrictEqual(bots, [{ _id: "b1" }]);
        assert.deepStrictEqual(stub.seen.query, { public: true, certified: true, trashed: { $in: [null, false] } });
        assert.deepStrictEqual(stub.seen.sort, { score: -1 });
      } finally {
        stub.restore();
      }
    });

    it('getAll passes an explicit query straight through', async () => {
      const stub = stubModel(Faq_kb, []);
      try {
        await faqKbService.getAll({ id_project: PROJECT_ID });
        assert.deepStrictEqual(stub.seen.query, { id_project: PROJECT_ID });
      } finally {
        stub.restore();
      }
    });

    it('a failing bot query rejects', async () => {
      const stub = stubModel(Faq_kb, null, new Error("mongo is gone"));
      try {
        await assert.rejects(() => faqKbService.getAll(), /mongo is gone/);
      } finally {
        stub.restore();
      }
    });

    it('FaqService.getAll scopes the query to one bot', async () => {
      const stub = stubModel(Faq, [{ _id: "f1" }]);
      try {
        assert.deepStrictEqual(await faqService.getAll("botID"), [{ _id: "f1" }]);
        assert.deepStrictEqual(stub.seen.query, { id_faq_kb: "botID" });
      } finally {
        stub.restore();
      }
    });

    it('a failing faq query rejects', async () => {
      const stub = stubModel(Faq, null, new Error("mongo is gone"));
      try {
        await assert.rejects(() => faqService.getAll("botID"), /mongo is gone/);
      } finally {
        stub.restore();
      }
    });

  });

});
