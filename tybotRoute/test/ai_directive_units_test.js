'use strict';

// directives/ai, driven directly instead of through a whole bot flow.
//
// The conversation-* files already cover the happy paths of these directives
// end to end. What they cannot reach is the error half: an integration that is
// absent, an /ask that answers 500, a namespace that does not exist, a quota
// that is exhausted, an LLM body that is not the shape the directive expects.
// Those branches are where the uncovered lines are, and - as the it.skip()
// blocks below record - where the crashes are.
//
// Every test asserts something observable: the body of the request the
// directive sent to the mock server, the flow attributes it wrote to the
// cache, the flowError it set, or which intent it jumped to (the fake tilebot
// on 10001 records the "/INTENT" command DirIntent posts). None of them exist
// to run a line.
//
// The two RAG context overrides below are read into a module-level const by
// directives/ai/DirAskGPTV2 at REQUIRE time, so they have to be set before the
// requires. Scoped to this file on purpose: they are product settings, not
// suite-wide ones.
//
// PINECONE_RERANKING is read into a module-level const by DirAskGPTV2 for the
// same reason, and gates the non-hybrid reranking branch exercised below.
process.env.PINECONE_RERANKING = 'true';
process.env.GPT_4_CONTEXT = 'RAG CONTEXT FOR GPT-4, FROM THE ENVIRONMENT';
process.env.GENERAL_CONTEXT = 'GENERAL RAG CONTEXT, FROM THE ENVIRONMENT';

var assert = require('assert');
var express = require('express');
const bodyParser = require('body-parser');

const { DirAskGPT } = require('../directives/ai/DirAskGPT');
const { DirAskGPTV2 } = require('../directives/ai/DirAskGPTV2');
const { DirGptTask } = require('../directives/ai/DirGptTask');
const { DirAiPrompt } = require('../directives/ai/DirAiPrompt');
const { DirAiCondition } = require('../directives/ai/DirAiCondition');
const { DirAssistant } = require('../directives/ai/DirAssistant');
const { DirAddKbContent } = require('../directives/ai/DirAddKbContent');
const openAIAssistantsService = require('../services/OpenAIAssistantsService');

const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-aiunits";
const MOCK_PORT = 10002;
const TILEBOT_PORT = 10001;
const API_ENDPOINT = process.env.API_ENDPOINT || 'http://localhost:10002';

// ------------------------------------------------------------------ fakes

function fakeCache(vars) {
  const hashes = {};
  const strings = {};
  const key = "tilebot:requests:" + REQUEST_ID + ":parameters";
  hashes[key] = {};
  for (const [k, v] of Object.entries(vars || {})) {
    hashes[key][k] = JSON.stringify(v);
  }
  return {
    hashes,
    strings,
    /** Flow attributes as native values, for assertions. */
    attrs() {
      const out = {};
      for (const [k, v] of Object.entries(hashes[key] || {})) out[k] = JSON.parse(v);
      return out;
    },
    async hgetall(k) { return hashes[k] || {}; },
    async hget(k, f) { return (hashes[k] || {})[f]; },
    async hset(k, f, v) { (hashes[k] || (hashes[k] = {}))[f] = v; },
    async hdel(k, f) { delete (hashes[k] || {})[f]; },
    async get(k) { return strings[k]; },
    async set(k, v) { strings[k] = v; },
    async del(k) { delete strings[k]; },
    async expire() { }
  };
}

function fakeChatbot(overrides) {
  const params = {};
  return Object.assign({
    params,
    botId: "botID",
    bot: { name: "Test Bot", root_id: "ROOT-1" },
    async getParameter(k) { return params[k]; },
    async addParameter(k, v) { params[k] = v; },
    async deleteParameter(k) { delete params[k]; }
  }, overrides);
}

function recordingLogger() {
  const lines = [];
  const mk = (level) => (...args) => lines.push([level, args.map(String).join(' ')]);
  return {
    lines,
    /** every message logged at `level`, joined - for substring assertions */
    at(level) { return lines.filter((l) => l[0] === level).map((l) => l[1]).join(' | '); },
    error: mk('error'), warn: mk('warn'), info: mk('info'),
    debug: mk('debug'), native: mk('native')
  };
}

function contextFor(overrides) {
  return Object.assign({
    projectId: PROJECT_ID,
    token: "XXX",
    API_ENDPOINT: API_ENDPOINT,
    requestId: REQUEST_ID,
    supportRequest: { id_project: PROJECT_ID, request_id: REQUEST_ID, bot_id: "botID" }
  }, overrides);
}

/**
 * Builds a directive with a fresh cache, chatbot and recording logger, and
 * returns all four so a test can assert on any of them.
 */
function build(Klass, action, opts = {}) {
  const tdcache = fakeCache(opts.vars);
  const chatbot = fakeChatbot(opts.chatbot);
  const dir = new Klass(contextFor(Object.assign({ tdcache, chatbot }, opts.context)));
  dir.logger = recordingLogger();
  return { dir, tdcache, chatbot, logger: dir.logger, directive: { name: "action", action: action } };
}

/** Runs a directive, resolving with every `stop` value the callback received. */
function run(dir, directive, settleMs) {
  return new Promise((resolve, reject) => {
    const stops = [];
    let timer = null;
    const guard = setTimeout(() => reject(new Error("the directive never called back")), 15000);
    dir.execute(directive, (stop) => {
      stops.push(stop);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { clearTimeout(guard); resolve(stops); }, settleMs === undefined ? 250 : settleMs);
    });
  });
}

// ------------------------------------------------------------------- mock

const OK_QA = {
  answer: "the kb answer",
  success: true,
  id: "123456789",
  source: "http://gethelp.test.com/article",
  sources: ["TextArticle", "http://gethelp.test.com/article"],
  prompt_token_size: 100,
  content_chunks: ["chunk one", "chunk two"]
};

/**
 * The Tiledesk api + the LLM ask service + the OpenAI-compatible completions
 * endpoint, all on MOCK_PORT (that is how run-tests.js points every endpoint
 * variable). Each option either supplies a body or, for the four POST
 * endpoints, a full express handler so a test can answer 4xx/5xx.
 */
function startMock(opts = {}) {
  return new Promise((resolve) => {
    const seen = {
      integrations: [], kbsettings: 0, namespaces: 0, quotaChecks: [], quotaIncr: [],
      answered: [], unanswered: [], kbContent: [], mcpNative: [],
      qa: [], ask: [], thinking: [], completions: []
    };
    const server = express();
    server.use(bodyParser.json());

    if (opts.extra) opts.extra(server, seen);

    server.get('/:project_id/integration/name/:name', (req, res) => {
      seen.integrations.push(req.params.name);
      const body = (opts.integrations || {})[req.params.name];
      if (body === undefined) { res.status(404).send({ error: "integration not found" }); return; }
      res.status(200).send(body);
    });

    server.get('/:project_id/kbsettings', (req, res) => {
      seen.kbsettings += 1;
      if (opts.kbsettings === undefined) { res.status(404).send({ error: "no kb settings" }); return; }
      res.status(200).send(opts.kbsettings);
    });

    server.get('/:project_id/kb/namespace/all', (req, res) => {
      seen.namespaces += 1;
      if (opts.namespaces === undefined) { res.status(500).send({ error: "boom" }); return; }
      res.status(200).send(opts.namespaces);
    });

    server.get('/:project_id/quotes/tokens', (req, res) => {
      seen.quotaChecks.push(req.params.project_id);
      if (opts.quotaStatus) { res.status(opts.quotaStatus).send({ error: "quota service down" }); return; }
      res.status(200).send({ isAvailable: opts.quotaAvailable !== false });
    });

    server.post('/:project_id/quotes/incr/tokens', (req, res) => {
      seen.quotaIncr.push(req.body);
      res.status(200).send({ success: true });
    });

    server.get('/:project_id/mcp/native', (req, res) => {
      seen.mcpNative.push(req.params.project_id);
      if (opts.mcpNativeStatus) { res.status(opts.mcpNativeStatus).send({ error: "no native mcp" }); return; }
      res.status(200).send({ success: true });
    });

    server.post('/:project_id/kb/answered', (req, res) => {
      seen.answered.push(req.body);
      res.status(200).send({ success: true });
    });

    server.post('/:project_id/kb/unanswered', (req, res) => {
      seen.unanswered.push(req.body);
      res.status(200).send({ success: true });
    });

    server.post('/:project_id/kb', (req, res) => {
      seen.kbContent.push({ body: req.body, auth: req.headers.authorization });
      if (opts.addContent) { opts.addContent(req, res); return; }
      res.status(200).send({ success: true, id: "content-1" });
    });

    server.post('/api/qa', (req, res) => {
      seen.qa.push(req.body);
      if (opts.qa) { opts.qa(req, res); return; }
      res.status(200).send(OK_QA);
    });

    server.post('/api/ask', (req, res) => {
      seen.ask.push(req.body);
      if (opts.ask) { opts.ask(req, res); return; }
      res.status(200).send({ success: true, answer: "the llm answer", prompt_token_info: { total_tokens: 42 } });
    });

    server.post('/api/thinking', (req, res) => {
      seen.thinking.push(req.body);
      if (opts.thinking) { opts.thinking(req, res); return; }
      res.status(200).send({ success: true, answer: "the reasoned answer", reasoning_content: "because of X" });
    });

    server.post('/v1/chat/completions', (req, res) => {
      seen.completions.push({ body: req.body, auth: req.headers.authorization });
      if (opts.completions) { opts.completions(req, res); return; }
      res.status(200).send({
        choices: [{ message: { content: "the completion" } }],
        usage: { total_tokens: 77 }
      });
    });

    const listener = server.listen(MOCK_PORT, '0.0.0.0', () => {
      resolve({ seen, close: () => new Promise((r) => listener.close(() => r())) });
    });
  });
}

const NAMESPACES = [
  { id: PROJECT_ID, name: "Default", default: true },
  { id: "NS-HYBRID", name: "Hybrid Namespace", hybrid: true },
  { id: "NS-ENGINE", name: "Engine Namespace", engine: { name: "qdrant", type: "cloud" }, embedding: { provider: "openai", name: "emb", api_key: "" } }
];

const OPENAI_INTEGRATION = { name: "openai", value: { apikey: "sk-project-key" } };

// A chat transcript in the shape utils/ChatbotTranscriptUtil parses: one
// "<user:...>" / "<bot:...>" marker per line, the message on the next line.
const TRANSCRIPT = [
  "<user:12:00>", "/start",
  "<bot:12:01>", "welcome",
  "<user:12:02>", "hello",
  "<bot:12:03>", "hi"
].join("\n");

// ==================================================================== tests

describe('Directives directives/ai, the error and edge paths', function () {

  // A fake tilebot, so every jump to a true/false/fallback connector can be
  // asserted on: DirIntent posts "/INTENT_NAME" to /ext/:botid.
  let tilebot;
  let dispatched = [];
  let GPTKEY_WAS;

  before((done) => {
    GPTKEY_WAS = process.env.GPTKEY;
    const server = express();
    server.use(bodyParser.json());
    server.post('/ext/:botid', (req, res) => {
      dispatched.push(req.body.payload.text);
      res.status(200).send({ success: true });
    });
    tilebot = server.listen(TILEBOT_PORT, '0.0.0.0', () => done());
  });

  after((done) => {
    if (GPTKEY_WAS === undefined) delete process.env.GPTKEY; else process.env.GPTKEY = GPTKEY_WAS;
    tilebot.close(() => done());
  });

  beforeEach(() => {
    dispatched = [];
    delete process.env.GPTKEY;
  });

  // ------------------------------------------------------------ DirAskGPTV2

  describe('DirAskGPTV2', function () {

    it('a directive with no action logs it and carries on without asking anything', async () => {
      const mock = await startMock({});
      try {
        const { dir, logger } = build(DirAskGPTV2, null);
        const stops = await run(dir, { name: "askgptv2" });

        assert.deepStrictEqual(stops, [undefined], 'the flow must carry on');
        assert.ok(logger.at('error').includes('Incorrect action for'), logger.at('error'));
        assert.strictEqual(mock.seen.qa.length, 0, 'nothing may be asked without an action');
      } finally {
        await mock.close();
      }
    });

    it('without a cache it calls back immediately and asks nothing', async () => {
      const mock = await startMock({});
      try {
        const dir = new DirAskGPTV2(contextFor({ chatbot: fakeChatbot() }));
        dir.logger = recordingLogger();
        const stops = await run(dir, { name: "askgptv2", action: { question: "q", llm: "openai", model: "gpt-4" } });

        assert.deepStrictEqual(stops, [undefined]);
        assert.strictEqual(mock.seen.qa.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('a missing question sets flowError, defaults the reply and takes the false connector', async () => {
      const mock = await startMock({});
      try {
        const { dir, tdcache, chatbot } = build(DirAskGPTV2, {
          llm: "openai", model: "gpt-4",
          assignReplyTo: "kb_reply",
          trueIntent: "OK", falseIntent: "KO"
        });
        await run(dir, { name: "askgptv2", action: { llm: "openai", model: "gpt-4", assignReplyTo: "kb_reply", trueIntent: "OK", falseIntent: "KO" } });

        assert.strictEqual(chatbot.params.flowError, "AskKnowledgeBase Error: 'question' attribute is undefined");
        assert.strictEqual(tdcache.attrs().kb_reply, "No answers");
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.strictEqual(mock.seen.qa.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('a missing question with no false connector still sets flowError and jumps nowhere', async () => {
      const mock = await startMock({});
      try {
        const { dir, chatbot } = build(DirAskGPTV2, null);
        const stops = await run(dir, { name: "askgptv2", action: { llm: "openai", model: "gpt-4" } });

        assert.strictEqual(chatbot.params.flowError, "AskKnowledgeBase Error: 'question' attribute is undefined");
        assert.deepStrictEqual(dispatched, []);
        assert.deepStrictEqual(stops, [undefined], 'with no false connector the flow carries on');
      } finally {
        await mock.close();
      }
    });

    it('an llm whose integration is missing reports the integration error and takes the false connector', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir, chatbot } = build(DirAskGPTV2, null);
        await run(dir, {
          name: "askgptv2",
          action: { question: "q", llm: "ollama", model: "llama3", falseIntent: "KO" }
        });

        assert.strictEqual(chatbot.params.flowError, "AskKnowledgeBase Error: ollama integration not found");
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.strictEqual(mock.seen.qa.length, 0, 'no question may be asked without an llm');
      } finally {
        await mock.close();
      }
    });

    it('a vllm integration with no matching server names the server it could not find', async () => {
      const mock = await startMock({
        integrations: { vllm: { name: "vllm", value: { servers: [{ name: "eu-1", url: "http://vllm.test" }] } } }
      });
      try {
        const { dir, chatbot } = build(DirAskGPTV2, null);
        await run(dir, {
          name: "askgptv2",
          action: { question: "q", llm: "vllm", model: "mistral", vllmServer: "us-2", falseIntent: "KO" }
        });

        assert.strictEqual(chatbot.params.flowError, "AskKnowledgeBase Error: vllm server 'us-2' not found");
        assert.deepStrictEqual(dispatched, ["/KO"]);
      } finally {
        await mock.close();
      }
    });

    it('an llm with an integration but no api key reports the missing key', async () => {
      const mock = await startMock({ integrations: { google: { name: "google", value: {} } } });
      try {
        const { dir, chatbot } = build(DirAskGPTV2, null);
        await run(dir, {
          name: "askgptv2",
          action: { question: "q", llm: "google", model: "gemini-2.0", falseIntent: "KO" }
        });

        assert.strictEqual(chatbot.params.flowError, "AskKnowledgeBase Error: missing key for llm google");
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.strictEqual(mock.seen.qa.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('an llm with no key at all and no false connector stops nowhere and asks nothing', async () => {
      const mock = await startMock({ integrations: { google: { name: "google", value: {} } } });
      try {
        const { dir, chatbot } = build(DirAskGPTV2, null);
        const stops = await run(dir, {
          name: "askgptv2",
          action: { question: "q", llm: "google", model: "gemini-2.0" }
        });

        assert.strictEqual(chatbot.params.flowError, "AskKnowledgeBase Error: missing key for llm google");
        assert.deepStrictEqual(stops, [undefined]);
        assert.strictEqual(mock.seen.qa.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('on the shared key an exhausted token quota stops before the question is asked', async () => {
      process.env.GPTKEY = "sk-shared";
      const mock = await startMock({ integrations: {}, quotaAvailable: false, namespaces: NAMESPACES });
      try {
        const { dir, chatbot } = build(DirAskGPTV2, null);
        await run(dir, {
          name: "askgptv2",
          action: { question: "q", llm: "openai", model: "gpt-4", falseIntent: "KO" }
        });

        assert.strictEqual(chatbot.params.flowError, "GPT Error: tokens quota exceeded");
        assert.deepStrictEqual(mock.seen.quotaChecks, [PROJECT_ID]);
        assert.strictEqual(mock.seen.qa.length, 0, 'an exhausted quota must not reach the kb');
        assert.deepStrictEqual(dispatched, ["/KO"]);
      } finally {
        await mock.close();
      }
    });

    it('on the shared key an available quota lets the question through and reports the usage back', async () => {
      process.env.GPTKEY = "sk-shared";
      const mock = await startMock({ integrations: {}, namespaces: NAMESPACES });
      try {
        const { dir, tdcache } = build(DirAskGPTV2, null);
        await run(dir, {
          name: "askgptv2",
          action: { question: "q", llm: "openai", model: "gpt-4", assignReplyTo: "kb_reply", trueIntent: "OK" }
        });

        assert.strictEqual(tdcache.attrs().kb_reply, "the kb answer");
        assert.strictEqual(mock.seen.qa[0].model.api_key, "sk-shared", 'the shared key must be the one sent');
        assert.deepStrictEqual(mock.seen.quotaIncr, [{ tokens: 100, model: mock.seen.qa[0].model }]);
        assert.deepStrictEqual(dispatched, ["/OK"]);
      } finally {
        await mock.close();
      }
    });

    it('a namespace the project does not have sets flowError and never asks', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, namespaces: [] });
      try {
        const { dir, chatbot, tdcache } = build(DirAskGPTV2, null);
        await run(dir, {
          name: "askgptv2",
          action: { question: "q", llm: "openai", model: "gpt-4", assignReplyTo: "kb_reply", falseIntent: "KO" }
        });

        assert.strictEqual(chatbot.params.flowError, "AskGPT Error: namespace not found");
        assert.strictEqual(tdcache.attrs().kb_reply, "No answers");
        assert.strictEqual(mock.seen.qa.length, 0);
        assert.deepStrictEqual(dispatched, ["/KO"]);
      } finally {
        await mock.close();
      }
    });

    it('a namespace lookup that fails outright is reported as "not found" too', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } }); // /kb/namespace/all answers 500
      try {
        const { dir, chatbot } = build(DirAskGPTV2, null);
        const stops = await run(dir, {
          name: "askgptv2",
          action: { question: "q", llm: "openai", model: "gpt-4" }
        });

        assert.strictEqual(chatbot.params.flowError, "AskGPT Error: namespace not found");
        assert.strictEqual(mock.seen.namespaces, 1);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('a namespace searched by a name that does not exist sets flowError', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES });
      try {
        const { dir, chatbot } = build(DirAskGPTV2, null, { vars: { ns_name: "Nope" } });
        await run(dir, {
          name: "askgptv2",
          action: { question: "q", llm: "openai", model: "gpt-4", namespace: "{{ns_name}}", namespaceAsName: true, falseIntent: "KO" }
        });

        assert.strictEqual(chatbot.params.flowError, "AskGPT Error: namespace not found");
        assert.deepStrictEqual(dispatched, ["/KO"]);
      } finally {
        await mock.close();
      }
    });

    it('a 500 from the ask service defaults the reply and takes the false connector', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES,
        qa: (req, res) => res.status(500).send({ detail: "the model exploded" })
      });
      try {
        const { dir, tdcache, logger } = build(DirAskGPTV2, null);
        await run(dir, {
          name: "askgptv2",
          action: { question: "q", llm: "openai", model: "gpt-4", assignReplyTo: "kb_reply", falseIntent: "KO" }
        });

        assert.strictEqual(tdcache.attrs().kb_reply, "No answers");
        assert.ok(logger.at('error').includes('Error getting answer'), logger.at('error'));
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.strictEqual(mock.seen.answered.length, 0, 'a failed ask is not an answered question');
      } finally {
        await mock.close();
      }
    });

    it('a 500 from the ask service with no false connector lets the flow carry on', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES,
        qa: (req, res) => res.status(500).send({ detail: "nope" })
      });
      try {
        const { dir } = build(DirAskGPTV2, null);
        const stops = await run(dir, {
          name: "askgptv2",
          action: { question: "q", llm: "openai", model: "gpt-4" }
        });

        assert.deepStrictEqual(stops, [undefined]);
        assert.deepStrictEqual(dispatched, []);
      } finally {
        await mock.close();
      }
    });

    it('an unsuccessful answer is recorded as unanswered and takes the false connector', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES,
        qa: (req, res) => res.status(200).send({ success: false, answer: "No answers" })
      });
      try {
        const { dir, tdcache } = build(DirAskGPTV2, null);
        await run(dir, {
          name: "askgptv2",
          action: { question: "why", llm: "openai", model: "gpt-4", assignReplyTo: "kb_reply", falseIntent: "KO" }
        });

        assert.strictEqual(tdcache.attrs().kb_reply, "No answers");
        assert.strictEqual(mock.seen.unanswered.length, 1);
        assert.deepStrictEqual(mock.seen.unanswered[0], { namespace: PROJECT_ID, question: "why", request_id: REQUEST_ID });
        assert.deepStrictEqual(dispatched, ["/KO"]);
      } finally {
        await mock.close();
      }
    });

    it('skip_unanswered keeps an unsuccessful answer out of the unanswered list', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES,
        qa: (req, res) => res.status(200).send({ success: false })
      });
      try {
        const { dir } = build(DirAskGPTV2, null);
        const stops = await run(dir, {
          name: "askgptv2",
          action: { question: "why", llm: "openai", model: "gpt-4", skip_unanswered: true }
        });

        assert.strictEqual(mock.seen.unanswered.length, 0);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('the rag system context comes from the model env override when one is set', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES });
      try {
        const { dir } = build(DirAskGPTV2, null);
        await run(dir, { name: "askgptv2", action: { question: "q", llm: "openai", model: "gpt-4" } });

        assert.strictEqual(mock.seen.qa[0].system_context, 'RAG CONTEXT FOR GPT-4, FROM THE ENVIRONMENT');
      } finally {
        await mock.close();
      }
    });

    it('an unknown model falls back to the general context env override', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES });
      try {
        const { dir } = build(DirAskGPTV2, null);
        await run(dir, { name: "askgptv2", action: { question: "q", llm: "openai", model: "a-model-nobody-knows" } });

        assert.strictEqual(mock.seen.qa[0].system_context, 'GENERAL RAG CONTEXT, FROM THE ENVIRONMENT');
      } finally {
        await mock.close();
      }
    });

    it('a known model with no env override reads its prompt file and prefixes the action context', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES });
      try {
        const { dir } = build(DirAskGPTV2, null, { vars: { who: "Ada" } });
        await run(dir, {
          name: "askgptv2",
          action: { question: "q", llm: "openai", model: "gpt-4o", context: "You talk to {{who}}." }
        });

        const ctx = mock.seen.qa[0].system_context;
        assert.ok(ctx.startsWith("You talk to Ada.\n"), ctx.slice(0, 60));
        assert.ok(ctx.length > "You talk to Ada.\n".length, 'the model prompt file must follow the action context');
      } finally {
        await mock.close();
      }
    });

    it('a namespace that carries its own engine and embedding sends them instead of the defaults', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES });
      try {
        const { dir } = build(DirAskGPTV2, null);
        await run(dir, {
          name: "askgptv2",
          action: { question: "q", llm: "openai", model: "gpt-4", namespace: "NS-ENGINE", top_k: 0, temperature: 0, max_tokens: 0 }
        });

        assert.deepStrictEqual(mock.seen.qa[0].engine, { name: "qdrant", type: "cloud" });
        assert.strictEqual(mock.seen.qa[0].embedding.name, "emb");
        assert.strictEqual(mock.seen.qa[0].top_k, undefined, 'a falsy top_k is omitted, not sent as 0');
        assert.strictEqual(mock.seen.qa[0].temperature, undefined);
        assert.strictEqual(mock.seen.qa[0].max_tokens, undefined);
      } finally {
        await mock.close();
      }
    });

    it('a hybrid namespace switches to hybrid search and clamps the reranking multiplier to 100 chunks', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES });
      try {
        const { dir } = build(DirAskGPTV2, null);
        await run(dir, {
          name: "askgptv2",
          action: {
            question: "q", llm: "openai", model: "gpt-4", namespace: "NS-HYBRID",
            alpha: 0.9, reranking: true, reranking_multiplier: 40, top_k: 30
          }
        });

        const body = mock.seen.qa[0];
        assert.strictEqual(body.search_type, 'hybrid');
        assert.strictEqual(body.alpha, 0.9);
        assert.strictEqual(body.reranking, true);
        assert.strictEqual(body.reranker_model, "cross-encoder/ms-marco-MiniLM-L-6-v2");
        assert.strictEqual(body.reranking_multiplier, 3, 'floor(100 / 30) === 3');
      } finally {
        await mock.close();
      }
    });

    it('a top_k above 100 clamps the reranking multiplier to at least 1', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES });
      try {
        const { dir } = build(DirAskGPTV2, null);
        await run(dir, {
          name: "askgptv2",
          action: {
            question: "q", llm: "openai", model: "gpt-4", namespace: "NS-HYBRID",
            reranking: true, reranking_multiplier: 2, top_k: 200
          }
        });

        assert.strictEqual(mock.seen.qa[0].reranking_multiplier, 1, 'floor(100 / 200) is 0, which is not allowed');
      } finally {
        await mock.close();
      }
    });

    it('chunks_only assigns the chunks and never records an answered question', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES,
        qa: (req, res) => res.status(200).send({ success: true, answer: "a", source: "s", chunks: ["c1", "c2"] })
      });
      try {
        const { dir, tdcache } = build(DirAskGPTV2, null);
        await run(dir, {
          name: "askgptv2",
          action: {
            question: "q", llm: "openai", model: "gpt-4", chunks_only: true,
            assignReplyTo: "kb_reply", assignSourceTo: "kb_source", assignChunksTo: "kb_chunks", trueIntent: "OK"
          }
        });

        assert.strictEqual(mock.seen.qa[0].chunks_only, true);
        assert.deepStrictEqual(tdcache.attrs().kb_chunks, ["c1", "c2"]);
        assert.strictEqual(tdcache.attrs().kb_source, "s");
        assert.strictEqual(mock.seen.answered.length, 0);
        assert.deepStrictEqual(dispatched, ["/OK"]);
      } finally {
        await mock.close();
      }
    });

    it('use_hyde, use_cache and tags reach the ask service, a non-string tag list does not', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES });
      try {
        const { dir } = build(DirAskGPTV2, null);
        await run(dir, {
          name: "askgptv2",
          action: { question: "q", llm: "openai", model: "gpt-4", use_hyde: true, use_cache: true, tags: ["a", 7] }
        });

        assert.strictEqual(mock.seen.qa[0].use_hyde, true);
        assert.strictEqual(mock.seen.qa[0].use_cache, true);
        assert.strictEqual(mock.seen.qa[0].tags, undefined, 'a tag list that is not all strings is dropped');
      } finally {
        await mock.close();
      }
    });

    it('the chat transcript is sent as a question/answer dictionary', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES });
      try {
        const { dir } = build(DirAskGPTV2, null, { vars: { transcript: TRANSCRIPT } });
        await run(dir, { name: "askgptv2", action: { question: "q", llm: "openai", model: "gpt-4", history: true } });

        assert.deepStrictEqual(mock.seen.qa[0].chat_history_dict, { 0: { question: "hello", answer: "hi" } },
          'the /start command is not a question and the welcome turn before it is dropped');
      } finally {
        await mock.close();
      }
    });

    it('history: true with no transcript in the cache warns and sends no history', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES });
      try {
        const { dir, logger } = build(DirAskGPTV2, null);
        await run(dir, { name: "askgptv2", action: { question: "q", llm: "openai", model: "gpt-4", history: true } });

        assert.strictEqual(mock.seen.qa[0].chat_history_dict, undefined);
        assert.ok(logger.at('warn').includes('chat transcript is undefined'), logger.at('warn'));
      } finally {
        await mock.close();
      }
    });

    it('transcriptToLLM merges consecutive turns, drops a leading assistant and skips slash commands', async () => {
      const dir = new DirAskGPTV2(contextFor({ tdcache: fakeCache(), chatbot: fakeChatbot() }));

      assert.deepStrictEqual(await dir.transcriptToLLM([]), {});
      assert.deepStrictEqual(
        await dir.transcriptToLLM([
          { role: 'assistant', content: 'welcome' },
          { role: 'user', content: 'a' },
          { role: 'user', content: 'b' },
          { role: 'assistant', content: 'ok' }
        ]),
        { 0: { question: 'a\nb', answer: 'ok' } },
        'the opening assistant turn is dropped and the two user turns merge');
      assert.deepStrictEqual(
        await dir.transcriptToLLM([
          { role: 'user', content: '/start' },
          { role: 'assistant', content: 'hi' }
        ]),
        {},
        'a slash command is not a question');
    });

    it('normalizeCitationSources keeps the first source per name and drops source_id', async () => {
      const dir = new DirAskGPTV2(contextFor({ tdcache: fakeCache(), chatbot: fakeChatbot() }));
      const out = dir.normalizeCitationSources([
        { source_id: 1, source_name: "A", url: "u1" },
        { source_id: 2, source_name: "A", url: "u2" },
        { source_id: 3, source_name: "B", url: "u3" }
      ]);
      assert.deepStrictEqual(out, [{ source_name: "A", url: "u1" }, { source_name: "B", url: "u3" }]);
    });

    it('setDefaultEngine picks the hybrid index only when asked for hybrid', async () => {
      const dir = new DirAskGPTV2(contextFor({ tdcache: fakeCache(), chatbot: fakeChatbot() }));
      const plain = await dir.setDefaultEngine(false);
      const hybrid = await dir.setDefaultEngine(true);
      assert.strictEqual(plain.index_name, 'llm-sample-index');
      assert.strictEqual(hybrid.index_name, 'llm-sample-hybrid-index');
    });

  });

  // -------------------------------------------------------------- DirAskGPT

  describe('DirAskGPT', function () {

    const ASK = { question: "what?", kbid: "kb1", assignReplyTo: "kb_reply", assignSourceTo: "kb_source" };

    it('a directive with no action carries on and asks nothing', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirAskGPT, null);
        const stops = await run(dir, { name: "askgpt" });
        assert.deepStrictEqual(stops, [undefined]);
        assert.strictEqual(mock.seen.qa.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('an empty question defaults the reply, takes the false connector and stops the flow', async () => {
      const mock = await startMock({});
      try {
        const { dir, tdcache } = build(DirAskGPT, null);
        const stops = await run(dir, { name: "askgpt", action: Object.assign({}, ASK, { question: "", falseIntent: "KO" }) });

        assert.strictEqual(tdcache.attrs().kb_reply, "No answers");
        assert.strictEqual(tdcache.attrs().kb_source, undefined, 'a null source is not written');
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
        assert.strictEqual(mock.seen.qa.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('a missing kbid defaults the reply and takes the false connector', async () => {
      const mock = await startMock({});
      try {
        const { dir, tdcache } = build(DirAskGPT, null);
        const stops = await run(dir, { name: "askgpt", action: { question: "what?", assignReplyTo: "kb_reply", falseIntent: "KO" } });

        assert.strictEqual(tdcache.attrs().kb_reply, "No answers");
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
        assert.strictEqual(mock.seen.qa.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('no key in the integration, the kb settings or the environment takes the false connector', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir, tdcache } = build(DirAskGPT, null);
        const stops = await run(dir, { name: "askgpt", action: Object.assign({}, ASK, { falseIntent: "KO" }) });

        assert.deepStrictEqual(mock.seen.integrations, ["openai"]);
        assert.strictEqual(mock.seen.kbsettings, 1, 'the kb settings are the second place looked at');
        assert.strictEqual(tdcache.attrs().kb_reply, "No answers");
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('no key and no false connector lets the flow carry on', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir } = build(DirAskGPT, null);
        const stops = await run(dir, { name: "askgpt", action: ASK });
        assert.deepStrictEqual(stops, [undefined]);
        assert.strictEqual(mock.seen.qa.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('the key found in the kb settings is the one sent to the kb', async () => {
      const mock = await startMock({ integrations: {}, kbsettings: { gptkey: "sk-from-kbsettings" } });
      try {
        const { dir, tdcache } = build(DirAskGPT, null);
        await run(dir, { name: "askgpt", action: Object.assign({}, ASK, { trueIntent: "OK" }) });

        assert.strictEqual(mock.seen.qa[0].gptkey, "sk-from-kbsettings");
        assert.strictEqual(mock.seen.qa[0].kbid, "kb1");
        assert.strictEqual(mock.seen.qa[0].agent_id, "ROOT-1");
        assert.strictEqual(tdcache.attrs().kb_reply, "the kb answer");
        assert.deepStrictEqual(dispatched, ["/OK"]);
      } finally {
        await mock.close();
      }
    });

    it('on the shared key an exhausted quota stops before the kb is asked', async () => {
      process.env.GPTKEY = "sk-shared";
      const mock = await startMock({ integrations: {}, quotaAvailable: false });
      try {
        const { dir, tdcache } = build(DirAskGPT, null);
        const stops = await run(dir, { name: "askgpt", action: Object.assign({}, ASK, { trueIntent: "OK", falseIntent: "KO" }) });

        assert.strictEqual(mock.seen.qa.length, 0);
        assert.deepStrictEqual(dispatched, [], 'neither connector is taken when the quota is out');
        assert.deepStrictEqual(stops, [undefined]);
        assert.strictEqual(tdcache.attrs().kb_reply, undefined);
      } finally {
        await mock.close();
      }
    });

    it('the question is filled from the flow attributes before it is asked', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir } = build(DirAskGPT, null, { vars: { last_user_message: "hats" } });
        await run(dir, { name: "askgpt", action: Object.assign({}, ASK, { question: "about {{last_user_message}}" }) });

        assert.strictEqual(mock.seen.qa[0].question, "about hats");
        assert.strictEqual(mock.seen.qa[0].gptkey, "sk-project-key");
      } finally {
        await mock.close();
      }
    });

    it('an answer flagged unsuccessful still writes what came back and takes the false connector', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        qa: (req, res) => res.status(200).send({ success: false, answer: "I do not know", source_url: "http://s" })
      });
      try {
        const { dir, tdcache } = build(DirAskGPT, null);
        const stops = await run(dir, { name: "askgpt", action: Object.assign({}, ASK, { falseIntent: "KO" }) });

        assert.strictEqual(tdcache.attrs().kb_reply, "I do not know");
        assert.strictEqual(tdcache.attrs().kb_source, "http://s");
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('an unsuccessful answer with no false connector lets the flow carry on', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        qa: (req, res) => res.status(200).send({ success: false })
      });
      try {
        const { dir } = build(DirAskGPT, null);
        const stops = await run(dir, { name: "askgpt", action: ASK });
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    // DEFECT - directives/ai/DirAskGPT.js:142
    //
    //   const { err, resbody } = await llmAskService.askLegacyKb(json, "(DirAskGPT)");
    //   ...
    //   let kb_answer = resbody.answer;      <-- resbody is null on any error
    //
    // askLegacyKb resolves { err, resbody: null } for every non-2xx answer and
    // for a transport failure. Line 142 reads `.answer` off it BEFORE the
    // `if (err)` test three lines below, so a 500 from the kb throws
    // "TypeError: Cannot read properties of null (reading 'answer')" inside
    // go(). execute() does not await go(), so the rejection is unhandled: the
    // callback is NEVER called, the false connector is never taken and the
    // whole conversation stalls. The source comment on line 138-141 even
    // records that the line throws "exactly as before", so this is known and
    // unfixed rather than accidental.
    //
    // Correct behaviour, asserted here: leave the reply at its "No answers"
    // default and take the false connector, exactly like the sibling failure
    // paths above.
    it('a 500 from the kb takes the false connector instead of throwing on a null body', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        qa: (req, res) => res.status(500).send({ error: "kb down" })
      });
      try {
        const { dir, tdcache } = build(DirAskGPT, null);
        const stops = await run(dir, { name: "askgpt", action: Object.assign({}, ASK, { falseIntent: "KO" }) });

        assert.strictEqual(tdcache.attrs().kb_reply, "No answers");
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

  });

  // ------------------------------------------------------------- DirGptTask

  describe('DirGptTask', function () {

    const TASK = { question: "summarise this", model: "gpt-4o", assignReplyTo: "gpt_reply", formatType: "text" };

    it('a directive with no action carries on and calls no completion', async () => {
      const mock = await startMock({});
      try {
        const { dir, logger } = build(DirGptTask, null);
        const stops = await run(dir, { name: "gptTask" });
        assert.deepStrictEqual(stops, [undefined]);
        assert.ok(logger.at('error').includes('Incorrect action for'));
        assert.strictEqual(mock.seen.completions.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('an empty question sets flowError and takes the false connector', async () => {
      const mock = await startMock({});
      try {
        const { dir, chatbot } = build(DirGptTask, null);
        const stops = await run(dir, { name: "gptTask", action: { question: "", falseIntent: "KO" } });

        assert.strictEqual(chatbot.params.flowError, "GPT Error: question attribute is undefined");
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
        assert.strictEqual(mock.seen.completions.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('an empty question with no false connector sets no flowError and carries on', async () => {
      const mock = await startMock({});
      try {
        const { dir, chatbot } = build(DirGptTask, null);
        const stops = await run(dir, { name: "gptTask", action: { question: "" } });

        assert.strictEqual(chatbot.params.flowError, undefined);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('no OpenAI key anywhere sets flowError, defaults the reply and takes the false connector', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir, chatbot, tdcache } = build(DirGptTask, null);
        const stops = await run(dir, { name: "gptTask", action: Object.assign({}, TASK, { falseIntent: "KO" }) });

        assert.strictEqual(chatbot.params.flowError, "GPT Error: gpt apikey is undefined");
        assert.strictEqual(tdcache.attrs().gpt_reply, "No answer.");
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
        assert.strictEqual(mock.seen.completions.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('no OpenAI key and no false connector lets the flow carry on', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir, chatbot } = build(DirGptTask, null);
        const stops = await run(dir, { name: "gptTask", action: TASK });

        assert.strictEqual(chatbot.params.flowError, undefined);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('on the shared key an exhausted quota sets flowError and never calls the completion', async () => {
      process.env.GPTKEY = "sk-shared";
      const mock = await startMock({ integrations: {}, quotaAvailable: false });
      try {
        const { dir, chatbot } = build(DirGptTask, null);
        const stops = await run(dir, { name: "gptTask", action: Object.assign({}, TASK, { falseIntent: "KO" }) });

        assert.strictEqual(chatbot.params.flowError, "GPT Error: tokens quota exceeded");
        assert.strictEqual(mock.seen.completions.length, 0);
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('a 429 from the completion surfaces the vendor message in flowError', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        completions: (req, res) => res.status(429).send({ error: { message: "Rate limit reached" } })
      });
      try {
        const { dir, chatbot, tdcache } = build(DirGptTask, null);
        const stops = await run(dir, { name: "gptTask", action: Object.assign({}, TASK, { falseIntent: "KO" }) });

        assert.strictEqual(chatbot.params.flowError, "GPT Error: Rate limit reached");
        assert.strictEqual(tdcache.attrs().gpt_reply, "No answer.");
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a failing completion with no false connector lets the flow carry on', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        completions: (req, res) => res.status(500).send({ error: { message: "boom" } })
      });
      try {
        const { dir } = build(DirGptTask, null);
        const stops = await run(dir, { name: "gptTask", action: TASK });
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('the project key is sent as a Bearer token and the context becomes a system message', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, tdcache } = build(DirGptTask, null, { vars: { topic: "hats" } });
        await run(dir, {
          name: "gptTask",
          action: Object.assign({}, TASK, {
            context: "You know about {{topic}}", question: "tell me about {{topic}}",
            max_tokens: 128, temperature: 0.2, trueIntent: "OK"
          })
        });

        const call = mock.seen.completions[0];
        assert.strictEqual(call.auth, "Bearer sk-project-key");
        assert.deepStrictEqual(call.body.messages, [
          { role: "system", content: "You know about hats" },
          { role: "user", content: "tell me about hats" }
        ]);
        assert.strictEqual(call.body.max_tokens, 128);
        assert.strictEqual(call.body.temperature, 0.2);
        assert.strictEqual(tdcache.attrs().gpt_reply, "the completion");
        assert.deepStrictEqual(dispatched, ["/OK"]);
      } finally {
        await mock.close();
      }
    });

    it('a json_object answer is parsed into an object, and a non-json answer is left as text', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        completions: (req, res) => res.status(200).send({
          choices: [{ message: { content: req.body.response_format ? '{"city":"Rome"}' : 'not json at all' } }],
          usage: { total_tokens: 5 }
        })
      });
      try {
        const a = build(DirGptTask, null);
        await run(a.dir, { name: "gptTask", action: Object.assign({}, TASK, { formatType: "json_object" }) });
        assert.deepStrictEqual(a.tdcache.attrs().gpt_reply, { city: "Rome" });
        assert.deepStrictEqual(mock.seen.completions[0].body.response_format, { type: "json_object" });

        const b = build(DirGptTask, null);
        await run(b.dir, { name: "gptTask", action: Object.assign({}, TASK, { formatType: undefined }) });
        assert.strictEqual(b.tdcache.attrs().gpt_reply, 'not json at all',
          'an unparseable answer is kept verbatim, not dropped');
      } finally {
        await mock.close();
      }
    });

    it('the transcript becomes the message history and slash commands are left out of it', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir } = build(DirGptTask, null, { vars: { transcript: TRANSCRIPT } });
        await run(dir, { name: "gptTask", action: Object.assign({}, TASK, { history: true }) });

        const messages = mock.seen.completions[0].body.messages;
        assert.ok(messages.every((m) => !m.content.startsWith('/')), JSON.stringify(messages));
        assert.deepStrictEqual(messages, [
          { role: "assistant", content: "welcome" },
          { role: "user", content: "hello" },
          { role: "assistant", content: "hi" },
          { role: "user", content: "summarise this" }
        ], 'the transcript turns come first, minus the /start command');
      } finally {
        await mock.close();
      }
    });

    it('on the shared key a successful completion reports the token usage back', async () => {
      process.env.GPTKEY = "sk-shared";
      const mock = await startMock({ integrations: {} });
      try {
        const { dir } = build(DirGptTask, null);
        await run(dir, { name: "gptTask", action: TASK });

        assert.deepStrictEqual(mock.seen.quotaIncr, [{ tokens: 77, model: "gpt-4o" }]);
      } finally {
        await mock.close();
      }
    });

  });

  // ------------------------------------------------------------ DirAiPrompt

  describe('DirAiPrompt', function () {

    const PROMPT = { question: "what is this?", llm: "openai", model: "gpt-4o", assignReplyTo: "ai_reply" };

    it('a directive with no action carries on and asks nothing', async () => {
      const mock = await startMock({});
      try {
        const { dir, logger } = build(DirAiPrompt, null);
        const stops = await run(dir, { name: "aiPrompt" });
        assert.deepStrictEqual(stops, [undefined]);
        assert.ok(logger.at('error').includes('Incorrect action for'));
        assert.strictEqual(mock.seen.ask.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('without a cache it calls back and asks nothing', async () => {
      const mock = await startMock({});
      try {
        const dir = new DirAiPrompt(contextFor({ chatbot: fakeChatbot() }));
        dir.logger = recordingLogger();
        const stops = await run(dir, { name: "aiPrompt", action: PROMPT });
        assert.deepStrictEqual(stops, [undefined]);
        assert.strictEqual(mock.seen.ask.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('a missing question sets flowError and takes the false connector', async () => {
      const mock = await startMock({});
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        await run(dir, { name: "aiPrompt", action: { llm: "openai", model: "gpt-4o", falseIntent: "KO" } });

        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: 'question' attribute is undefined");
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.strictEqual(mock.seen.ask.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('a missing model with no false connector still sets flowError', async () => {
      const mock = await startMock({});
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        const stops = await run(dir, { name: "aiPrompt", action: { question: "q", llm: "openai" } });

        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: 'model' attribute is undefined");
        assert.deepStrictEqual(dispatched, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('no key for the chosen llm sets flowError and takes the false connector', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        await run(dir, { name: "aiPrompt", action: Object.assign({}, PROMPT, { llm: "anthropic", falseIntent: "KO" }) });

        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: missing key for llm anthropic");
        assert.deepStrictEqual(mock.seen.integrations, ["anthropic"]);
        assert.strictEqual(mock.seen.ask.length, 0);
        assert.deepStrictEqual(dispatched, ["/KO"]);
      } finally {
        await mock.close();
      }
    });

    it('no key and no false connector lets the flow carry on', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir } = build(DirAiPrompt, null);
        const stops = await run(dir, { name: "aiPrompt", action: Object.assign({}, PROMPT, { llm: "anthropic" }) });
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('a missing vllm integration sets flowError and takes the false connector', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        await run(dir, { name: "aiPrompt", action: Object.assign({}, PROMPT, { llm: "vllm", falseIntent: "KO" }) });

        assert.strictEqual(chatbot.params.flowError, "Vllm integration not found");
        assert.deepStrictEqual(dispatched, ["/KO"]);
      } finally {
        await mock.close();
      }
    });

    it('a multi-server vllm integration with no vllmServer names the missing attribute', async () => {
      const mock = await startMock({
        integrations: { vllm: { value: { servers: [{ name: "eu-1", url: "http://vllm.test", apikey: "k" }] } } }
      });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        await run(dir, { name: "aiPrompt", action: Object.assign({}, PROMPT, { llm: "vllm", falseIntent: "KO" }) });

        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: 'vllmServer' attribute is undefined");
        assert.deepStrictEqual(dispatched, ["/KO"]);
      } finally {
        await mock.close();
      }
    });

    it('a vllm server name that is not in the integration is named in flowError', async () => {
      const mock = await startMock({
        integrations: { vllm: { value: { servers: [{ name: "eu-1", url: "http://vllm.test", apikey: "k" }] } } }
      });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null, { vars: { srv: "us-2" } });
        await run(dir, { name: "aiPrompt", action: Object.assign({}, PROMPT, { llm: "vllm", vllmServer: "{{srv}}" }) });

        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: vllm server 'us-2' not found");
      } finally {
        await mock.close();
      }
    });

    it('a single-server vllm integration with no apikey reports the missing key', async () => {
      const mock = await startMock({ integrations: { vllm: { value: { url: "http://vllm.test" } } } });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        await run(dir, { name: "aiPrompt", action: Object.assign({}, PROMPT, { llm: "vllm", falseIntent: "KO" }) });

        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: missing key for llm vllm");
        assert.deepStrictEqual(dispatched, ["/KO"]);
      } finally {
        await mock.close();
      }
    });

    it('a resolved vllm server is sent as the model, with its url and key', async () => {
      const mock = await startMock({
        integrations: { vllm: { value: { servers: [{ name: "eu-1", url: "http://vllm.test", apikey: "vk" }] } } }
      });
      try {
        const { dir, tdcache } = build(DirAiPrompt, null);
        await run(dir, { name: "aiPrompt", action: Object.assign({}, PROMPT, { llm: "vllm", vllmServer: "eu-1" }) });

        assert.deepStrictEqual(mock.seen.ask[0].model,
          { name: "gpt-4o", url: "http://vllm.test", api_key: "vk", provider: "vllm" });
        assert.strictEqual(tdcache.attrs().ai_reply, "the llm answer");
      } finally {
        await mock.close();
      }
    });

    it('an ollama integration is sent as the model, with an empty llm_key', async () => {
      const mock = await startMock({
        integrations: { ollama: { value: { url: "http://ollama.test", token: "ot" } } }
      });
      try {
        const { dir } = build(DirAiPrompt, null);
        await run(dir, { name: "aiPrompt", action: Object.assign({}, PROMPT, { llm: "ollama", model: "llama3" }) });

        assert.deepStrictEqual(mock.seen.ask[0].model, { name: "llama3", url: "http://ollama.test", token: "ot" });
        assert.strictEqual(mock.seen.ask[0].llm_key, "");
        assert.strictEqual(mock.seen.ask[0].stream, false);
      } finally {
        await mock.close();
      }
    });

    // DEFECT - directives/ai/DirAiPrompt.js:122-133 and :268
    //
    //   ollama_integration = await integrationService.getIntegration(...)
    //     .catch(async (err) => { ...flowError, false connector... });
    //   ...
    //   json.model = { name: ..., url: ollama_integration.value.url, ... }
    //
    // IntegrationService.getIntegration NEVER rejects: its httpUtils callback
    // does `resolve(null)` on error. So a project with no ollama integration
    // does not take the .catch() at all - it reaches line 268 with
    // ollama_integration === null and throws "TypeError: Cannot read
    // properties of null (reading 'value')". go() is not awaited by execute(),
    // so nothing catches it: the callback is never called, no flowError is
    // written, no connector is taken, and the conversation stalls.
    // DirAiCondition.js:119-130/:272 is the identical copy of this bug.
    //
    // Correct behaviour, asserted here: the same shape as the vllm branch
    // right below it - flowError, then the false connector.
    it('a missing ollama integration sets flowError instead of throwing on a null integration', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        const stops = await run(dir, { name: "aiPrompt", action: Object.assign({}, PROMPT, { llm: "ollama", model: "llama3", falseIntent: "KO" }) });

        assert.strictEqual(chatbot.params.flowError, "Ollama integration not found");
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
        assert.strictEqual(mock.seen.ask.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('on the shared key an exhausted quota sets flowError and never asks', async () => {
      process.env.GPTKEY = "sk-shared";
      const mock = await startMock({ integrations: {}, quotaAvailable: false });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        await run(dir, { name: "aiPrompt", action: Object.assign({}, PROMPT, { falseIntent: "KO" }) });

        assert.strictEqual(chatbot.params.flowError, "GPT Error: tokens quota exceeded");
        assert.strictEqual(mock.seen.ask.length, 0);
        assert.deepStrictEqual(dispatched, ["/KO"]);
      } finally {
        await mock.close();
      }
    });

    it('on the shared key a successful answer reports the token usage back', async () => {
      process.env.GPTKEY = "sk-shared";
      const mock = await startMock({ integrations: {} });
      try {
        const { dir } = build(DirAiPrompt, null);
        await run(dir, { name: "aiPrompt", action: PROMPT });

        assert.strictEqual(mock.seen.ask[0].llm_key, "sk-shared");
        assert.deepStrictEqual(mock.seen.quotaIncr, [{ tokens: 42, model: "gpt-4o" }]);
      } finally {
        await mock.close();
      }
    });

    it('a 400 whose body carries a detail list surfaces the first message in flowError', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        ask: (req, res) => res.status(400).send({ detail: [{ msg: "question too long" }] })
      });
      try {
        const { dir, chatbot, tdcache } = build(DirAiPrompt, null);
        const stops = await run(dir, { name: "aiPrompt", action: Object.assign({}, PROMPT, { falseIntent: "KO" }) });

        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: question too long");
        assert.strictEqual(tdcache.attrs().ai_reply, "No answer");
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a 400 whose detail carries an answer surfaces that answer', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        ask: (req, res) => res.status(400).send({ detail: { answer: "I cannot do that" } })
      });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        await run(dir, { name: "aiPrompt", action: Object.assign({}, PROMPT, { falseIntent: "KO" }) });

        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: I cannot do that");
      } finally {
        await mock.close();
      }
    });

    it('a 500 with an unrecognised body serialises the whole body into flowError', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        ask: (req, res) => res.status(500).send({ oops: true })
      });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        await run(dir, { name: "aiPrompt", action: Object.assign({}, PROMPT, { falseIntent: "KO" }) });

        assert.strictEqual(chatbot.params.flowError, 'AiPrompt Error: {"oops":true}');
      } finally {
        await mock.close();
      }
    });

    it('a transport failure with no response at all still reports a message', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        ask: (req, res) => { res.socket.destroy(); }
      });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        await run(dir, { name: "aiPrompt", action: Object.assign({}, PROMPT, { falseIntent: "KO" }) });

        assert.ok(chatbot.params.flowError.startsWith("AiPrompt Error: "), chatbot.params.flowError);
        assert.notStrictEqual(chatbot.params.flowError, "AiPrompt Error: undefined");
        assert.deepStrictEqual(dispatched, ["/KO"]);
      } finally {
        await mock.close();
      }
    });

    it('a failing ask with no false connector lets the flow carry on and sets no flowError', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        ask: (req, res) => res.status(500).send({ oops: true })
      });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        const stops = await run(dir, { name: "aiPrompt", action: PROMPT });

        assert.strictEqual(chatbot.params.flowError, undefined);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('reasoning switches to the thinking endpoint and budgets tokens by level', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, tdcache, chatbot } = build(DirAiPrompt, null);
        await run(dir, {
          name: "aiPrompt",
          action: Object.assign({}, PROMPT, {
            reasoning: true, reasoningLevel: "HIGH", max_tokens: 1000,
            assignReasoningContentTo: "why", trueIntent: "OK"
          })
        });

        assert.strictEqual(mock.seen.ask.length, 0, 'reasoning must not use /ask');
        assert.strictEqual(mock.seen.thinking.length, 1);
        assert.deepStrictEqual(mock.seen.thinking[0].thinking, {
          show_thinking_stream: true,
          reasoning_effort: "high",
          reasoning_summary: "auto",
          type: "enabled",
          budget_tokens: 600,
          thinkingBudget: 600,
          thinkingLevel: "high"
        });
        assert.strictEqual(tdcache.attrs().why, "because of X");
        assert.strictEqual(chatbot.params.reasoning_content, "because of X");
        assert.deepStrictEqual(dispatched, ["/OK"]);
      } finally {
        await mock.close();
      }
    });

    it('an unrecognised reasoning level falls back to low, at 20 percent of the budget', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir } = build(DirAiPrompt, null);
        await run(dir, {
          name: "aiPrompt",
          action: Object.assign({}, PROMPT, { reasoning: true, reasoningLevel: "extreme", max_tokens: 1000 })
        });

        assert.strictEqual(mock.seen.thinking[0].thinking.reasoning_effort, "low");
        assert.strictEqual(mock.seen.thinking[0].thinking.budget_tokens, 200);
      } finally {
        await mock.close();
      }
    });

    it('servers that are not an array are refused with a flowError', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, chatbot, logger } = build(DirAiPrompt, null);
        await run(dir, { name: "aiPrompt", action: Object.assign({}, PROMPT, { servers: "not-an-array", falseIntent: "KO" }) });

        assert.strictEqual(chatbot.params.flowError, "Can't process MCP Servers");
        assert.ok(logger.at('warn').includes("'servers' must be an array"), logger.at('warn'));
        assert.strictEqual(mock.seen.ask.length, 0);
        assert.deepStrictEqual(dispatched, ["/KO"]);
      } finally {
        await mock.close();
      }
    });

    it('an mcp server is enriched from the integration and only the allowed fields are forwarded', async () => {
      const mock = await startMock({
        integrations: {
          openai: OPENAI_INTEGRATION,
          mcp: {
            value: {
              servers: [{
                id: "S1", name: "tools", url: "http://mcp.test", transport: "sse",
                authorization: { key: "mcp-key" },
                customHeaders: [
                  { key: "X-Kept", value: 7 },
                  { key: "X-Dropped", value: "no", enabled: false },
                  { value: "no key" }
                ]
              }]
            }
          }
        }
      });
      try {
        const { dir } = build(DirAiPrompt, null);
        await run(dir, {
          name: "aiPrompt",
          action: Object.assign({}, PROMPT, {
            servers: [{ id: "S1", name: "tools", url: "http://stale", enabled_tools: ["a", { name: "b" }, 3], oauth: { secret: "s" } }]
          })
        });

        assert.deepStrictEqual(mock.seen.ask[0].servers, {
          tools: {
            transport: "sse",
            url: "http://mcp.test",
            api_key: "mcp-key",
            enabled_tools: ["a", "b"],
            headers: { "X-Kept": "7" }
          }
        });
      } finally {
        await mock.close();
      }
    });

    it('a native mcp server takes its url from the cache and is given the flow headers', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, tdcache } = build(DirAiPrompt, null, {
          vars: { project_id: PROJECT_ID, conversation_id: "C1", chatbotToken: "CT", lastUserText: "hi" }
        });
        tdcache.strings['native_mcp:servers'] = JSON.stringify([{ id: "N1", url: "http://native.test/mcp" }]);

        await run(dir, {
          name: "aiPrompt",
          action: Object.assign({}, PROMPT, { servers: [{ id: "N1", name: "native", native: true, transport: "http" }] })
        });

        const sent = mock.seen.ask[0].servers.native;
        assert.strictEqual(sent.url, "http://native.test/mcp");
        assert.strictEqual(sent.headers['x-project-id'], PROJECT_ID);
        assert.strictEqual(sent.headers['x-conversation-id'], "C1");
        assert.strictEqual(sent.headers['x-chatbot-id'], "botID");
        assert.strictEqual(sent.headers['x-last-user-text'], "hi");
        assert.strictEqual(mock.seen.mcpNative.length, 0, 'a warm cache must not be refetched');
      } finally {
        await mock.close();
      }
    });

    it('an empty native mcp cache is refetched once, then reported as unavailable', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        await run(dir, {
          name: "aiPrompt",
          action: Object.assign({}, PROMPT, { servers: [{ id: "N1", name: "native", native: true }], falseIntent: "KO" })
        });

        assert.deepStrictEqual(mock.seen.mcpNative, [PROJECT_ID], 'the cache miss must trigger exactly one refetch');
        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: native MCP servers not available");
        assert.strictEqual(mock.seen.ask.length, 0);
        assert.deepStrictEqual(dispatched, ["/KO"]);
      } finally {
        await mock.close();
      }
    });

    it('a native mcp server missing from a populated cache is named in the flowError', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, chatbot, tdcache } = build(DirAiPrompt, null);
        tdcache.strings['native_mcp:servers'] = JSON.stringify({ OTHER: { url: "http://other" } });

        await run(dir, {
          name: "aiPrompt",
          action: Object.assign({}, PROMPT, { servers: [{ id: "N1", name: "calendar", native: true }] })
        });

        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: native MCP server url not found for calendar");
        assert.strictEqual(mock.seen.ask.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('a corrupt native mcp cache entry is treated as empty rather than thrown', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, chatbot, tdcache, logger } = build(DirAiPrompt, null);
        tdcache.strings['native_mcp:servers'] = "{not json";

        await run(dir, {
          name: "aiPrompt",
          action: Object.assign({}, PROMPT, { servers: [{ id: "N1", name: "calendar", native: true }] })
        });

        assert.ok(logger.at('error').includes('Error reading native MCP cache'), logger.at('error'));
        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: native MCP servers not available");
      } finally {
        await mock.close();
      }
    });

    it('an attachment url is classified from its extension', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir } = build(DirAiPrompt, null);
        await run(dir, { name: "aiPrompt", action: Object.assign({}, PROMPT, { attach: "http://files.test/photo.png" }) });

        assert.deepStrictEqual(mock.seen.ask[0].attach, {
          type: "image", source: "http://files.test/photo.png", mime_type: "image/png", detail: "auto"
        });
      } finally {
        await mock.close();
      }
    });

    it('an extensionless attachment url is classified from the Content-Type of a HEAD request', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        extra: (server) => {
          server.head('/blob', (req, res) => res.set('Content-Type', 'audio/mpeg').status(200).end());
        }
      });
      try {
        const { dir } = build(DirAiPrompt, null);
        await run(dir, { name: "aiPrompt", action: Object.assign({}, PROMPT, { attach: "http://localhost:10002/blob" }) });

        assert.strictEqual(mock.seen.ask[0].attach.type, "audio");
        assert.ok(mock.seen.ask[0].attach.mime_type.startsWith("audio/mpeg"), mock.seen.ask[0].attach.mime_type);
      } finally {
        await mock.close();
      }
    });

    it('an attachment whose HEAD request fails falls back to a generic file', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir } = build(DirAiPrompt, null);
        await run(dir, { name: "aiPrompt", action: Object.assign({}, PROMPT, { attach: "http://localhost:10002/nothing-here" }) });

        assert.deepStrictEqual(mock.seen.ask[0].attach, {
          type: "file", source: "http://localhost:10002/nothing-here", mime_type: "application/octet-stream", detail: "auto"
        });
      } finally {
        await mock.close();
      }
    });

    it('the question, context and model are all filled from the flow attributes', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir } = build(DirAiPrompt, null, { vars: { topic: "hats", chosen: "gpt-4.1" } });
        await run(dir, {
          name: "aiPrompt",
          action: { question: "about {{topic}}", context: "you know {{topic}}", llm: "openai", model: "{{chosen}}" }
        });

        assert.strictEqual(mock.seen.ask[0].question, "about hats");
        assert.strictEqual(mock.seen.ask[0].system_context, "you know hats");
        assert.strictEqual(mock.seen.ask[0].model, "gpt-4.1");
        assert.strictEqual(mock.seen.ask[0].agent_id, "ROOT-1");
      } finally {
        await mock.close();
      }
    });

  });

  // ---------------------------------------------------------- DirAiCondition

  describe('DirAiCondition', function () {

    const INTENTS = [
      { label: "medical", prompt: "asking for medical information", conditionIntentId: "MED" },
      { label: "billing", prompt: "asking about an invoice", conditionIntentId: "BILL" }
    ];
    const COND = { llm: "openai", model: "gpt-4o", intents: INTENTS, fallbackIntent: "FALLBACK", errorIntent: "ERR" };

    it('a directive with no action carries on and asks nothing', async () => {
      const mock = await startMock({});
      try {
        const { dir, logger } = build(DirAiCondition, null);
        const stops = await run(dir, { name: "aiCondition" });
        assert.deepStrictEqual(stops, [undefined]);
        assert.ok(logger.at('error').includes('Incorrect action for'));
        assert.strictEqual(mock.seen.ask.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('without a cache it calls back and asks nothing', async () => {
      const mock = await startMock({});
      try {
        const dir = new DirAiCondition(contextFor({ chatbot: fakeChatbot() }));
        dir.logger = recordingLogger();
        const stops = await run(dir, { name: "aiCondition", action: COND });
        assert.deepStrictEqual(stops, [undefined]);
        assert.strictEqual(mock.seen.ask.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('a missing model sets flowError and takes the error connector', async () => {
      const mock = await startMock({});
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        await run(dir, { name: "aiCondition", action: { llm: "openai", intents: INTENTS, errorIntent: "ERR" } });

        assert.strictEqual(chatbot.params.flowError, "AiCondition Error: 'model' attribute is undefined");
        assert.deepStrictEqual(dispatched, ["/ERR"]);
        assert.strictEqual(mock.seen.ask.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('a missing llm with no error connector still sets flowError', async () => {
      const mock = await startMock({});
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        const stops = await run(dir, { name: "aiCondition", action: { model: "gpt-4o", intents: INTENTS } });

        assert.strictEqual(chatbot.params.flowError, "AiCondition Error: 'llm' attribute is undefined");
        assert.deepStrictEqual(dispatched, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('no key for the chosen llm sets flowError and takes the error connector', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        await run(dir, { name: "aiCondition", action: Object.assign({}, COND, { llm: "anthropic" }) });

        assert.strictEqual(chatbot.params.flowError, "AiCondition Error: missing key for llm anthropic");
        assert.deepStrictEqual(dispatched, ["/ERR"]);
        assert.strictEqual(mock.seen.ask.length, 0);
      } finally {
        await mock.close();
      }
    });

    // The four vllm exits below used to read DirAiPrompt's `falseIntent` /
    // `trueIntent`, which DirAiCondition.go() never declares, so every one of
    // them threw ReferenceError instead of routing (see the quarantine README).

    it('a missing vllm integration takes the error connector', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        await run(dir, { name: "aiCondition", action: Object.assign({}, COND, { llm: "vllm" }) });
        assert.strictEqual(chatbot.params.flowError, "Vllm integration not found");
        assert.deepStrictEqual(dispatched, ["/ERR"]);
      } finally {
        await mock.close();
      }
    });

    it('a multi-server vllm integration with no vllmServer takes the error connector', async () => {
      const mock = await startMock({
        integrations: { vllm: { value: { servers: [{ name: "eu-1", url: "http://vllm.test", apikey: "k" }] } } }
      });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        await run(dir, { name: "aiCondition", action: Object.assign({}, COND, { llm: "vllm" }) });
        assert.strictEqual(chatbot.params.flowError, "AiCondition Error: 'vllmServer' attribute is undefined");
        assert.deepStrictEqual(dispatched, ["/ERR"]);
      } finally {
        await mock.close();
      }
    });

    it('a vllm server name that is not in the integration takes the error connector', async () => {
      const mock = await startMock({
        integrations: { vllm: { value: { servers: [{ name: "eu-1", url: "http://vllm.test", apikey: "k" }] } } }
      });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        await run(dir, { name: "aiCondition", action: Object.assign({}, COND, { llm: "vllm", vllmServer: "us-2" }) });
        assert.strictEqual(chatbot.params.flowError, "AiCondition Error: vllm server 'us-2' not found");
        assert.deepStrictEqual(dispatched, ["/ERR"]);
      } finally {
        await mock.close();
      }
    });

    it('a single-server vllm integration with no apikey takes the error connector', async () => {
      const mock = await startMock({ integrations: { vllm: { value: { url: "http://vllm.test" } } } });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        await run(dir, { name: "aiCondition", action: Object.assign({}, COND, { llm: "vllm" }) });
        assert.strictEqual(chatbot.params.flowError, "AiCondition Error: missing key for llm vllm");
        assert.deepStrictEqual(dispatched, ["/ERR"]);
      } finally {
        await mock.close();
      }
    });

    it('a resolved vllm server is sent as the model', async () => {
      const mock = await startMock({
        integrations: { vllm: { value: { servers: [{ name: "eu-1", url: "http://vllm.test", token: "tk" }] } } },
        ask: (req, res) => res.status(200).send({ success: true, answer: "medical" })
      });
      try {
        const { dir } = build(DirAiCondition, null);
        await run(dir, { name: "aiCondition", action: Object.assign({}, COND, { llm: "vllm", vllmServer: "eu-1" }) });

        assert.strictEqual(mock.seen.ask.length, 0,
          'a vllm server whose apikey is empty never gets past the key guard');
      } finally {
        await mock.close();
      }
    });

    it('the prompt sent to the llm lists every label with its condition and the instructions', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        ask: (req, res) => res.status(200).send({ success: true, answer: "medical" })
      });
      try {
        const { dir, tdcache } = build(DirAiCondition, null, { vars: { who: "a patient" } });
        await run(dir, {
          name: "aiCondition",
          action: Object.assign({}, COND, {
            instructions: "The user is {{who}}.", context: "ctx for {{who}}", assignReplyTo: "cond_reply"
          })
        });

        const question = mock.seen.ask[0].question;
        assert.ok(question.includes("- label: medical When: asking for medical information"), question);
        assert.ok(question.includes("- label: billing When: asking about an invoice"), question);
        assert.ok(question.includes("The user is a patient."), question);
        assert.strictEqual(mock.seen.ask[0].system_context, "ctx for a patient");
        assert.strictEqual(tdcache.attrs().cond_reply, "medical");
        assert.deepStrictEqual(dispatched, ["/MED"], 'the matching label decides the connector');
      } finally {
        await mock.close();
      }
    });

    it('the literal answer "fallback" takes the fallback connector', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        ask: (req, res) => res.status(200).send({ success: true, answer: "fallback" })
      });
      try {
        const { dir } = build(DirAiCondition, null);
        const stops = await run(dir, { name: "aiCondition", action: COND });

        assert.deepStrictEqual(dispatched, ["/FALLBACK"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a label the intents list does not contain falls back too', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        ask: (req, res) => res.status(200).send({ success: true, answer: "something-else" })
      });
      try {
        const { dir } = build(DirAiCondition, null);
        await run(dir, { name: "aiCondition", action: COND });

        assert.deepStrictEqual(dispatched, ["/FALLBACK"]);
      } finally {
        await mock.close();
      }
    });

    it('an unmatched label with no fallback connector logs it and lets the flow carry on', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        ask: (req, res) => res.status(200).send({ success: true, answer: "something-else" })
      });
      try {
        const { dir, logger } = build(DirAiCondition, null);
        const stops = await run(dir, {
          name: "aiCondition",
          action: { llm: "openai", model: "gpt-4o", intents: INTENTS, errorIntent: "ERR" }
        });

        assert.deepStrictEqual(dispatched, [], 'the error connector is NOT the fallback connector');
        assert.ok(logger.at('error').includes('Fallback connector not found'), logger.at('error'));
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('a 400 whose body carries a detail list surfaces that message, not a label-matching one', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        ask: (req, res) => res.status(400).send({ detail: [{ msg: "context too long" }] })
      });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        const stops = await run(dir, { name: "aiCondition", action: COND });

        assert.strictEqual(chatbot.params.flowError, "AiCondition Error: context too long");
        assert.deepStrictEqual(dispatched, ["/ERR"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('on the shared key an exhausted quota sets flowError and never asks', async () => {
      process.env.GPTKEY = "sk-shared";
      const mock = await startMock({ integrations: {}, quotaAvailable: false });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        await run(dir, { name: "aiCondition", action: COND });

        assert.strictEqual(chatbot.params.flowError, "GPT Error: tokens quota exceeded");
        assert.strictEqual(mock.seen.ask.length, 0);
        assert.deepStrictEqual(dispatched, ["/ERR"]);
      } finally {
        await mock.close();
      }
    });

    // DEFECT - directives/ai/DirAiCondition.js:298
    //
    //   if (err.response?.data?.detail[0]) {
    //
    // The optional chain stops at `data?.detail`, so when the LLM server
    // answers a non-2xx WITHOUT a `detail` field the expression evaluates
    // `undefined[0]` and throws "TypeError: Cannot read properties of
    // undefined (reading '0')". go() is not awaited, so the callback is never
    // called: no flowError, no error connector, the conversation stalls.
    // The sibling DirAiPrompt.js:378 has the guarded form
    // `err.response?.data?.detail && err.response?.data?.detail[0]`.
    //
    // Correct behaviour, asserted here: the same as the detail-carrying case
    // above, with the serialised body as the reason.
    it('a non-2xx body without a detail field takes the error connector instead of throwing', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        ask: (req, res) => res.status(500).send({ oops: true })
      });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        const stops = await run(dir, { name: "aiCondition", action: COND });

        assert.strictEqual(chatbot.params.flowError, 'AiCondition Error: {"oops":true}');
        assert.deepStrictEqual(dispatched, ["/ERR"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    // DEFECT - directives/ai/DirAiCondition.js:298 and :303
    //
    // A transport failure (connection reset, DNS, timeout) produces an axios
    // error with NO `response` at all. Line 298 short-circuits safely, but
    // line 303 then does `JSON.stringify(err.response.data)` unguarded and
    // throws "TypeError: Cannot read properties of undefined (reading
    // 'data')". Same consequence: the callback is never called and the
    // conversation stalls. DirAiPrompt.js:385 falls back to `err.message`.
    it('a transport failure takes the error connector instead of throwing', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        ask: (req, res) => { res.socket.destroy(); }
      });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        const stops = await run(dir, { name: "aiCondition", action: COND });

        assert.ok(chatbot.params.flowError.startsWith("AiCondition Error: "), chatbot.params.flowError);
        assert.deepStrictEqual(dispatched, ["/ERR"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    // DEFECT - directives/ai/DirAiCondition.js:93
    //
    //   intents.forEach( function(intent) { ... });
    //
    // `intents` is action.intents and is NOT in checkMandatoryParameters
    // (which only guards llm and model), so a block whose connectors have not
    // been wired yet reaches this line with `undefined` and throws
    // "TypeError: Cannot read properties of undefined (reading 'forEach')" -
    // callback never called, conversation stalled.
    //
    // Correct behaviour, asserted here: treat it like the other missing
    // mandatory attributes.
    it('an action with no intents list sets flowError instead of throwing', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        await run(dir, { name: "aiCondition", action: { llm: "openai", model: "gpt-4o", errorIntent: "ERR" } });

        assert.strictEqual(chatbot.params.flowError, "AiCondition Error: 'intents' attribute is undefined");
        assert.deepStrictEqual(dispatched, ["/ERR"]);
        assert.strictEqual(mock.seen.ask.length, 0);
      } finally {
        await mock.close();
      }
    });

  });

  // ------------------------------------------------------------ DirAssistant

  describe('DirAssistant', function () {

    // DirAssistant talks to the hardcoded api.openai.com Assistants v2 api
    // (see services/OpenAIAssistantsService.js - the base url is a literal, not
    // an endpoint setting), so the service is stubbed here and the requests it
    // WOULD make are asserted on their arguments instead. The service's own
    // request shaping is covered in services_units_test.js.
    function stubAssistants(impl) {
      const names = ['createThread', 'addMessage', 'createRun', 'getRun', 'threadMessages'];
      const original = {};
      const calls = [];
      for (const name of names) {
        original[name] = openAIAssistantsService[name];
        openAIAssistantsService[name] = async (...args) => {
          calls.push([name, args]);
          if (impl && impl[name]) return impl[name](...args);
          return undefined;
        };
      }
      return {
        calls,
        of(name) { return calls.filter((c) => c[0] === name).map((c) => c[1]); },
        restore() { for (const name of names) openAIAssistantsService[name] = original[name]; }
      };
    }

    const HAPPY = {
      createThread: async () => ({ id: "th-1" }),
      addMessage: async () => undefined,
      createRun: async () => ({ id: "run-1" }),
      getRun: async () => ({ status: "completed" }),
      threadMessages: async () => ({ data: [{ content: [{ type: "text", text: { value: "the assistant reply", annotations: [] } }] }] })
    };

    it('a directive with no action carries on and calls nothing', async () => {
      const stub = stubAssistants(HAPPY);
      const mock = await startMock({});
      try {
        const { dir, logger } = build(DirAssistant, null);
        const stops = await run(dir, { name: "gptassistant" });
        assert.deepStrictEqual(stops, [undefined]);
        assert.ok(logger.at('error').includes('Incorrect action for'));
        assert.deepStrictEqual(stub.calls, []);
      } finally {
        stub.restore();
        await mock.close();
      }
    });

    it('a missing assistantId stops before any api call', async () => {
      const stub = stubAssistants(HAPPY);
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, logger } = build(DirAssistant, null);
        const stops = await run(dir, { name: "gptassistant", action: { prompt: "hi" } });

        assert.deepStrictEqual(stops, [undefined]);
        assert.ok(logger.at('error').includes('No assistantId provided'), logger.at('error'));
        assert.deepStrictEqual(stub.calls, []);
      } finally {
        stub.restore();
        await mock.close();
      }
    });

    it('a missing prompt stops before any api call', async () => {
      const stub = stubAssistants(HAPPY);
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, logger } = build(DirAssistant, null);
        const stops = await run(dir, { name: "gptassistant", action: { assistantId: "asst_1" } });

        assert.deepStrictEqual(stops, [undefined]);
        assert.ok(logger.at('error').includes('No prompt provided'), logger.at('error'));
        assert.deepStrictEqual(stub.calls, []);
      } finally {
        stub.restore();
        await mock.close();
      }
    });

    it('no OpenAI key writes the explanation to the error attribute and takes the false connector', async () => {
      const stub = stubAssistants(HAPPY);
      const mock = await startMock({ integrations: {} });
      try {
        const { dir, tdcache } = build(DirAssistant, null);
        const stops = await run(dir, {
          name: "gptassistant",
          action: { assistantId: "asst_1", prompt: "hi", assignErrorTo: "ass_error", falseIntent: "KO" }
        });

        assert.ok(String(tdcache.attrs().ass_error).includes("OpenAI APIKEY is mandatory"), tdcache.attrs().ass_error);
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
        assert.deepStrictEqual(stub.calls, []);
      } finally {
        stub.restore();
        await mock.close();
      }
    });

    // DEFECT - directives/ai/DirAssistant.js:135-139
    //
    //   if (falseIntent) {
    //     await this._executeCondition(false, ...);
    //     callback(true);
    //   }
    //   return;
    //
    // The `callback(true)` sits INSIDE the `if`. With no false connector wired
    // - the default for a freshly dropped ChatGPT Assistant block - the
    // directive returns having called back exactly zero times, so the
    // directive queue never advances and the conversation stalls with no
    // reply and nothing logged beyond the winston line. Every sibling exit in
    // this file (no assistantId, no prompt, the catch) calls back
    // unconditionally.
    //
    // Correct behaviour, asserted here: still write the error attribute, then
    // call back so the flow carries on.
    it('no OpenAI key and no false connector still calls back', async () => {
      const stub = stubAssistants(HAPPY);
      const mock = await startMock({ integrations: {} });
      try {
        const { dir, tdcache } = build(DirAssistant, null);
        const stops = await run(dir, {
          name: "gptassistant",
          action: { assistantId: "asst_1", prompt: "hi", assignErrorTo: "ass_error" }
        });

        assert.ok(String(tdcache.attrs().ass_error).includes("OpenAI APIKEY is mandatory"));
        assert.strictEqual(stops.length, 1, 'the directive must call back exactly once');
      } finally {
        stub.restore();
        await mock.close();
      }
    });

    it('a run that completes writes the reply, the raw content and the new thread id', async () => {
      const stub = stubAssistants(HAPPY);
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, tdcache } = build(DirAssistant, null, { vars: { who: "Ada" } });
        const stops = await run(dir, {
          name: "gptassistant",
          action: {
            assistantId: "asst_{{who}}", prompt: "hello {{who}}",
            assignResultTo: "ass_reply", threadIdAttribute: "myThread", trueIntent: "OK"
          }
        }, 400);

        assert.strictEqual(tdcache.attrs().ass_reply, "the assistant reply");
        assert.strictEqual(tdcache.attrs().myThread, "th-1");
        assert.deepStrictEqual(tdcache.attrs().lastMessageData, [{ type: "text", text: { value: "the assistant reply", annotations: [] } }]);
        assert.deepStrictEqual(stub.of('addMessage')[0].slice(0, 3), ["hello Ada", "th-1", "Bearer sk-project-key"]);
        assert.deepStrictEqual(stub.of('createRun')[0].slice(0, 3), ["th-1", "asst_Ada", "Bearer sk-project-key"]);
        assert.strictEqual(stub.of('createThread')[0][1], 20000, 'the default timeout');
        assert.deepStrictEqual(dispatched, ["/OK"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        stub.restore();
        await mock.close();
      }
    });

    it('a thread id already in the flow attributes is reused instead of creating a new one', async () => {
      const stub = stubAssistants(HAPPY);
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir } = build(DirAssistant, null, { vars: { firstThread: "th-existing" } });
        const stops = await run(dir, {
          name: "gptassistant",
          action: { assistantId: "asst_1", prompt: "hi", settings: { timeout: 5000 } }
        }, 400);

        assert.deepStrictEqual(stub.of('createThread'), [], 'an existing thread must not be recreated');
        assert.strictEqual(stub.of('addMessage')[0][1], "th-existing");
        assert.strictEqual(stub.of('addMessage')[0][3], 5000, 'the action timeout is passed through');
        assert.deepStrictEqual(stops, [false], 'with no true connector the flow carries on');
      } finally {
        stub.restore();
        await mock.close();
      }
    });

    it('a timeout outside the accepted range falls back to the default', async () => {
      const stub = stubAssistants(HAPPY);
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir } = build(DirAssistant, null, { vars: { firstThread: "th-existing" } });
        await run(dir, {
          name: "gptassistant",
          action: { assistantId: "asst_1", prompt: "hi", settings: { timeout: 999999 } }
        }, 400);

        assert.strictEqual(stub.of('addMessage')[0][3], 20000);
      } finally {
        stub.restore();
        await mock.close();
      }
    });

    it('a thread whose last message carries no text writes null and takes the false connector', async () => {
      const stub = stubAssistants(Object.assign({}, HAPPY, {
        threadMessages: async () => ({ data: [{ content: [] }] })
      }));
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, tdcache } = build(DirAssistant, null, { vars: { firstThread: "th-existing" } });
        const stops = await run(dir, {
          name: "gptassistant",
          action: { assistantId: "asst_1", prompt: "hi", assignResultTo: "ass_reply", falseIntent: "KO" }
        }, 400);

        assert.strictEqual(tdcache.attrs().ass_reply, null);
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        stub.restore();
        await mock.close();
      }
    });

    it('an empty thread with no false connector still calls back', async () => {
      const stub = stubAssistants(Object.assign({}, HAPPY, { threadMessages: async () => ({ data: [] }) }));
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir } = build(DirAssistant, null, { vars: { firstThread: "th-existing" } });
        const stops = await run(dir, {
          name: "gptassistant",
          action: { assistantId: "asst_1", prompt: "hi" }
        }, 400);

        assert.deepStrictEqual(stops, [false]);
        assert.deepStrictEqual(dispatched, []);
      } finally {
        stub.restore();
        await mock.close();
      }
    });

    it('a failing api call writes the error to the error attribute and takes the false connector', async () => {
      const stub = stubAssistants(Object.assign({}, HAPPY, {
        addMessage: async () => { throw new Error("openai is down"); }
      }));
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, tdcache } = build(DirAssistant, null, { vars: { firstThread: "th-existing" } });
        const stops = await run(dir, {
          name: "gptassistant",
          action: { assistantId: "asst_1", prompt: "hi", assignErrorTo: "ass_error", falseIntent: "KO" }
        });

        assert.ok('ass_error' in tdcache.attrs(), 'the failure must be recorded on the flow attribute');
        assert.deepStrictEqual(stub.of('createRun'), [], 'nothing runs after the failed call');
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        stub.restore();
        await mock.close();
      }
    });

    it('a run keeps being polled while it is queued', async () => {
      let polls = 0;
      const stub = stubAssistants(Object.assign({}, HAPPY, {
        getRun: async () => { polls += 1; return { status: polls < 2 ? "queued" : "completed" }; }
      }));
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, tdcache } = build(DirAssistant, null, { vars: { firstThread: "th-existing" } });
        await run(dir, {
          name: "gptassistant",
          action: { assistantId: "asst_1", prompt: "hi", assignResultTo: "ass_reply" }
        }, 400);

        assert.strictEqual(polls, 2, 'a queued run is polled again');
        assert.strictEqual(tdcache.attrs().ass_reply, "the assistant reply");
      } finally {
        stub.restore();
        await mock.close();
      }
    });

    it('the TEST_OPENAI_APIKEY override wins over the project integration', async () => {
      const stub = stubAssistants(HAPPY);
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      const was = process.env.TEST_OPENAI_APIKEY;
      process.env.TEST_OPENAI_APIKEY = "sk-from-env";
      try {
        const { dir } = build(DirAssistant, null, { vars: { firstThread: "th-existing" } });
        await run(dir, { name: "gptassistant", action: { assistantId: "asst_1", prompt: "hi" } }, 400);

        assert.strictEqual(stub.of('addMessage')[0][2], "Bearer sk-from-env");
        assert.deepStrictEqual(mock.seen.integrations, [], 'the override short-circuits the integration lookup');
      } finally {
        if (was === undefined) delete process.env.TEST_OPENAI_APIKEY; else process.env.TEST_OPENAI_APIKEY = was;
        stub.restore();
        await mock.close();
      }
    });

  });

  // --------------------------------------------------------- DirAddKbContent

  describe('DirAddKbContent', function () {

    const ADD = { type: "text", name: "note-{{who}}", content: "remember {{who}}" };

    it('a directive with no action carries on and adds nothing', async () => {
      const mock = await startMock({});
      try {
        const { dir, logger } = build(DirAddKbContent, null);
        const stops = await run(dir, { name: "addkbcontent" });
        assert.deepStrictEqual(stops, [undefined]);
        assert.ok(logger.at('error').includes('Incorrect action for'));
        assert.strictEqual(mock.seen.kbContent.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('without a cache it calls back and adds nothing', async () => {
      const mock = await startMock({});
      try {
        const dir = new DirAddKbContent(contextFor({ chatbot: fakeChatbot() }));
        dir.logger = recordingLogger();
        const stops = await run(dir, { name: "addkbcontent", action: ADD });
        assert.deepStrictEqual(stops, [undefined]);
        assert.strictEqual(mock.seen.kbContent.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('no OpenAI key anywhere sets flowError and adds nothing', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir, chatbot } = build(DirAddKbContent, null);
        const stops = await run(dir, { name: "addkbcontent", action: ADD });

        assert.strictEqual(chatbot.params.flowError, "[DirAddKbContent] Error: gptkey is mandatory");
        assert.deepStrictEqual(stops, [undefined]);
        assert.strictEqual(mock.seen.kbContent.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('on the shared key an exhausted quota sets flowError and stops the flow', async () => {
      process.env.GPTKEY = "sk-shared";
      const mock = await startMock({ integrations: {}, quotaAvailable: false, namespaces: NAMESPACES });
      try {
        const { dir, chatbot } = build(DirAddKbContent, null);
        const stops = await run(dir, { name: "addkbcontent", action: ADD });

        assert.strictEqual(chatbot.params.flowError, "[DirAddKbContent] Error: tokens quota exceeded");
        assert.deepStrictEqual(stops, [true]);
        assert.strictEqual(mock.seen.kbContent.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('a namespace the project does not have sets flowError and adds nothing', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, namespaces: [] });
      try {
        const { dir, chatbot } = build(DirAddKbContent, null);
        const stops = await run(dir, { name: "addkbcontent", action: Object.assign({}, ADD, { namespace: "NS-NOPE" }) });

        assert.strictEqual(chatbot.params.flowError, "[DirAddKbContent] Error: namespace not found");
        assert.deepStrictEqual(stops, [undefined]);
        assert.strictEqual(mock.seen.kbContent.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('the content and name are filled from the flow attributes and the name doubles as the source', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES });
      try {
        const { dir } = build(DirAddKbContent, null, { vars: { who: "Ada" } });
        const stops = await run(dir, { name: "addkbcontent", action: Object.assign({}, ADD, { tags: ["t1", "t2"] }) });

        assert.strictEqual(mock.seen.kbContent.length, 1);
        assert.deepStrictEqual(mock.seen.kbContent[0].body, {
          content: "remember Ada",
          namespace: PROJECT_ID,
          type: "text",
          name: "note-Ada",
          source: "note-Ada",
          tags: ["t1", "t2"]
        });
        assert.strictEqual(mock.seen.kbContent[0].auth, "JWT XXX");
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('a tag list that is not all strings is left out of the request', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES });
      try {
        const { dir } = build(DirAddKbContent, null, { vars: { who: "Ada" } });
        await run(dir, { name: "addkbcontent", action: Object.assign({}, ADD, { tags: ["t1", 2] }) });

        assert.strictEqual(mock.seen.kbContent[0].body.tags, undefined);
      } finally {
        await mock.close();
      }
    });

    it('a namespace given by name is resolved to its id before the content is added', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES });
      try {
        const { dir } = build(DirAddKbContent, null, { vars: { who: "Ada", ns: "Engine Namespace" } });
        await run(dir, {
          name: "addkbcontent",
          action: Object.assign({}, ADD, { namespace: "{{ns}}", namespaceAsName: true })
        });

        assert.strictEqual(mock.seen.kbContent[0].body.namespace, "NS-ENGINE");
      } finally {
        await mock.close();
      }
    });

    // DEFECT - directives/ai/DirAddKbContent.js:163
    //
    //   this.logger.error("[Add to KnwoledgeBase] error: " + JSON.stringify(err?.response));
    //
    // `err.response` is the raw axios response, whose `request` -> `res` ->
    // `req` chain is circular, so JSON.stringify throws "TypeError:
    // Converting circular structure to JSON". It throws while EVALUATING the
    // argument, i.e. before the `callback()` three lines below on line 166, so
    // any non-2xx from POST /{projectId}/kb leaves the directive without ever
    // calling back: the conversation stalls with nothing logged. go() is not
    // awaited by execute(), so nothing catches it either.
    //
    // Every other error exit in this file calls back. The sibling directives
    // that log an axios error do it safely, by logging the parts they need
    // (winston.error(..., { status, statusText, data })) rather than the whole
    // response - see DirAskGPTV2.js:384-388.
    //
    // Correct behaviour, asserted here: log it and let the flow carry on.
    it('a 500 from the kb is logged and the flow carries on', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES,
        addContent: (req, res) => res.status(500).send({ error: "kb down" })
      });
      try {
        const { dir, logger } = build(DirAddKbContent, null, { vars: { who: "Ada" } });
        const stops = await run(dir, { name: "addkbcontent", action: ADD });

        assert.strictEqual(mock.seen.kbContent.length, 1);
        assert.ok(logger.at('error').includes('[Add to KnwoledgeBase] error'), logger.at('error'));
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('a 200 that is not flagged successful still lets the flow carry on', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES,
        addContent: (req, res) => res.status(200).send({ success: false })
      });
      try {
        const { dir } = build(DirAddKbContent, null, { vars: { who: "Ada" } });
        const stops = await run(dir, { name: "addkbcontent", action: ADD });
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

  });

  // ------------------------- the "no connector wired" half of the error exits

  describe('the exits taken when no connector is wired', function () {

    it('DirAskGPT without a cache calls back and asks nothing', async () => {
      const mock = await startMock({});
      try {
        const dir = new DirAskGPT(contextFor({ chatbot: fakeChatbot() }));
        dir.logger = recordingLogger();
        const stops = await run(dir, { name: "askgpt", action: { question: "q", kbid: "kb1" } });
        assert.deepStrictEqual(stops, [undefined]);
        assert.strictEqual(mock.seen.qa.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('DirGptTask without a cache calls back and calls no completion', async () => {
      const mock = await startMock({});
      try {
        const dir = new DirGptTask(contextFor({ chatbot: fakeChatbot() }));
        dir.logger = recordingLogger();
        const stops = await run(dir, { name: "gptTask", action: { question: "q", model: "gpt-4o" } });
        assert.deepStrictEqual(stops, [undefined]);
        assert.strictEqual(mock.seen.completions.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('DirGptTask with history but no transcript sends only the question', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir } = build(DirGptTask, null);
        await run(dir, { name: "gptTask", action: { question: "q", model: "gpt-4o", history: true } });

        assert.deepStrictEqual(mock.seen.completions[0].body.messages, [{ role: "user", content: "q" }]);
      } finally {
        await mock.close();
      }
    });

    it('DirAiPrompt sends the transcript as a question/answer dictionary', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir } = build(DirAiPrompt, null, { vars: { transcript: TRANSCRIPT } });
        await run(dir, {
          name: "aiPrompt",
          action: { question: "q", llm: "openai", model: "gpt-4o", history: true }
        });

        assert.deepStrictEqual(mock.seen.ask[0].chat_history_dict, { 0: { question: "hello", answer: "hi" } });
      } finally {
        await mock.close();
      }
    });

    it('DirAiPrompt with history but no transcript warns and sends no history', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, logger } = build(DirAiPrompt, null);
        await run(dir, { name: "aiPrompt", action: { question: "q", llm: "openai", model: "gpt-4o", history: true } });

        assert.strictEqual(mock.seen.ask[0].chat_history_dict, undefined);
        assert.ok(logger.at('warn').includes('no chat transcript found'), logger.at('warn'));
      } finally {
        await mock.close();
      }
    });

    it('DirAiPrompt: each vllm failure with no false connector still sets flowError and asks nothing', async () => {
      const noIntegration = await startMock({ integrations: {} });
      try {
        const a = build(DirAiPrompt, null);
        const stops = await run(a.dir, { name: "aiPrompt", action: { question: "q", llm: "vllm", model: "m" } });
        assert.strictEqual(a.chatbot.params.flowError, "Vllm integration not found");
        assert.deepStrictEqual(stops, [undefined]);
        assert.strictEqual(noIntegration.seen.ask.length, 0);
      } finally {
        await noIntegration.close();
      }
    });

    it('DirAiPrompt: a missing vllmServer with no false connector still sets flowError', async () => {
      const mock = await startMock({
        integrations: { vllm: { value: { servers: [{ name: "eu-1", url: "u", apikey: "k" }] } } }
      });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        const stops = await run(dir, { name: "aiPrompt", action: { question: "q", llm: "vllm", model: "m" } });
        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: 'vllmServer' attribute is undefined");
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('DirAiPrompt: an unknown vllm server with no false connector still sets flowError', async () => {
      const mock = await startMock({
        integrations: { vllm: { value: { servers: [{ name: "eu-1", url: "u", apikey: "k" }] } } }
      });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        const stops = await run(dir, { name: "aiPrompt", action: { question: "q", llm: "vllm", model: "m", vllmServer: "us-2" } });
        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: vllm server 'us-2' not found");
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('DirAiPrompt: a keyless vllm integration with no false connector still sets flowError', async () => {
      const mock = await startMock({ integrations: { vllm: { value: { url: "http://vllm.test" } } } });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        const stops = await run(dir, { name: "aiPrompt", action: { question: "q", llm: "vllm", model: "m" } });
        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: missing key for llm vllm");
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('DirAiPrompt: an exhausted quota with no false connector still sets flowError and asks nothing', async () => {
      process.env.GPTKEY = "sk-shared";
      const mock = await startMock({ integrations: {}, quotaAvailable: false });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        const stops = await run(dir, { name: "aiPrompt", action: { question: "q", llm: "openai", model: "gpt-4o" } });
        assert.strictEqual(chatbot.params.flowError, "GPT Error: tokens quota exceeded");
        assert.strictEqual(mock.seen.ask.length, 0);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('DirAiPrompt: unprocessable servers with no false connector still set flowError and ask nothing', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        const stops = await run(dir, {
          name: "aiPrompt",
          action: { question: "q", llm: "openai", model: "gpt-4o", servers: "not-an-array" }
        });
        assert.strictEqual(chatbot.params.flowError, "Can't process MCP Servers");
        assert.strictEqual(mock.seen.ask.length, 0);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('DirAiPrompt: a native mcp cache holding neither an array nor an object resolves no url', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, chatbot, tdcache } = build(DirAiPrompt, null);
        tdcache.strings['native_mcp:servers'] = '42';

        await run(dir, {
          name: "aiPrompt",
          action: { question: "q", llm: "openai", model: "gpt-4o", servers: [{ id: "N1", name: "calendar", native: true }] }
        });

        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: native MCP server url not found for calendar");
        assert.strictEqual(mock.seen.ask.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('DirAiPrompt: a failing native mcp refetch is logged and still reported as unavailable', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, mcpNativeStatus: 500 });
      try {
        const { dir, chatbot, logger } = build(DirAiPrompt, null);
        await run(dir, {
          name: "aiPrompt",
          action: { question: "q", llm: "openai", model: "gpt-4o", servers: [{ id: "N1", name: "calendar", native: true }] }
        });

        assert.deepStrictEqual(mock.seen.mcpNative, [PROJECT_ID]);
        assert.ok(logger.at('error').includes('Error fetching native MCP servers'), logger.at('error'));
        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: native MCP servers not available");
      } finally {
        await mock.close();
      }
    });

    it('DirAiCondition: a missing vllm integration with no error connector still sets flowError', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        const stops = await run(dir, { name: "aiCondition", action: { llm: "vllm", model: "m", intents: [] } });
        assert.strictEqual(chatbot.params.flowError, "Vllm integration not found");
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('DirAiCondition: a missing vllmServer with no error connector still sets flowError', async () => {
      const mock = await startMock({
        integrations: { vllm: { value: { servers: [{ name: "eu-1", url: "u", apikey: "k" }] } } }
      });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        const stops = await run(dir, { name: "aiCondition", action: { llm: "vllm", model: "m", intents: [] } });
        assert.strictEqual(chatbot.params.flowError, "AiCondition Error: 'vllmServer' attribute is undefined");
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('DirAiCondition: an unknown vllm server with no error connector still sets flowError', async () => {
      const mock = await startMock({
        integrations: { vllm: { value: { servers: [{ name: "eu-1", url: "u", apikey: "k" }] } } }
      });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        const stops = await run(dir, { name: "aiCondition", action: { llm: "vllm", model: "m", intents: [], vllmServer: "us-2" } });
        assert.strictEqual(chatbot.params.flowError, "AiCondition Error: vllm server 'us-2' not found");
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('DirAiCondition: a keyless vllm integration with no error connector still sets flowError', async () => {
      const mock = await startMock({ integrations: { vllm: { value: { url: "http://vllm.test" } } } });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        const stops = await run(dir, { name: "aiCondition", action: { llm: "vllm", model: "m", intents: [] } });
        assert.strictEqual(chatbot.params.flowError, "AiCondition Error: missing key for llm vllm");
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('DirAiCondition: no key with no error connector still sets flowError and asks nothing', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        const stops = await run(dir, { name: "aiCondition", action: { llm: "anthropic", model: "m", intents: [] } });
        assert.strictEqual(chatbot.params.flowError, "AiCondition Error: missing key for llm anthropic");
        assert.strictEqual(mock.seen.ask.length, 0);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('DirAiCondition: an exhausted quota with no error connector still sets flowError', async () => {
      process.env.GPTKEY = "sk-shared";
      const mock = await startMock({ integrations: {}, quotaAvailable: false });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        const stops = await run(dir, { name: "aiCondition", action: { llm: "openai", model: "m", intents: [] } });
        assert.strictEqual(chatbot.params.flowError, "GPT Error: tokens quota exceeded");
        assert.strictEqual(mock.seen.ask.length, 0);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('DirAiCondition: a 400 whose detail carries an answer surfaces that answer', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        ask: (req, res) => res.status(400).send({ detail: { answer: "I cannot classify that" } })
      });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        await run(dir, { name: "aiCondition", action: { llm: "openai", model: "m", intents: [], errorIntent: "ERR" } });

        assert.strictEqual(chatbot.params.flowError, "AiCondition Error: I cannot classify that");
        assert.deepStrictEqual(dispatched, ["/ERR"]);
      } finally {
        await mock.close();
      }
    });

    it('DirAiCondition: a failing ask with no error connector sets no flowError and carries on', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        ask: (req, res) => res.status(400).send({ detail: [{ msg: "too long" }] })
      });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        const stops = await run(dir, { name: "aiCondition", action: { llm: "openai", model: "m", intents: [] } });

        assert.strictEqual(chatbot.params.flowError, undefined);
        assert.deepStrictEqual(dispatched, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('DirAiCondition: a matched label whose connector is not wired logs it and stops the flow', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION },
        ask: (req, res) => res.status(200).send({ success: true, answer: "orphan" })
      });
      try {
        const { dir, logger } = build(DirAiCondition, null);
        const stops = await run(dir, {
          name: "aiCondition",
          action: {
            llm: "openai", model: "m",
            intents: [{ label: "orphan", prompt: "p" }],
            fallbackIntent: "FALLBACK"
          }
        });

        assert.deepStrictEqual(dispatched, [], 'a label with no conditionIntentId goes nowhere');
        assert.ok(logger.at('native').includes('no block connected to intentId'), logger.at('native'));
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('DirAskGPTV2: an unresolvable llm with no false connector still sets flowError', async () => {
      const mock = await startMock({ integrations: {} });
      try {
        const { dir, chatbot } = build(DirAskGPTV2, null);
        const stops = await run(dir, { name: "askgptv2", action: { question: "q", llm: "ollama", model: "m" } });
        assert.strictEqual(chatbot.params.flowError, "AskKnowledgeBase Error: ollama integration not found");
        assert.deepStrictEqual(stops, [undefined]);
        assert.strictEqual(mock.seen.qa.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('DirAskGPTV2: an exhausted quota with no false connector still sets flowError', async () => {
      process.env.GPTKEY = "sk-shared";
      const mock = await startMock({ integrations: {}, quotaAvailable: false, namespaces: NAMESPACES });
      try {
        const { dir, chatbot } = build(DirAskGPTV2, null);
        const stops = await run(dir, { name: "askgptv2", action: { question: "q", llm: "openai", model: "gpt-4" } });
        assert.strictEqual(chatbot.params.flowError, "GPT Error: tokens quota exceeded");
        assert.strictEqual(mock.seen.qa.length, 0);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('DirAskGPTV2: a project with no id at all reports an undefined namespace', async () => {
      // With no project id the integration and quota urls have an empty path
      // segment and 404; the shared key and the fail-open quota check carry the
      // directive as far as the namespace guard, which is what is under test.
      process.env.GPTKEY = "sk-shared";
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES });
      try {
        const { dir, chatbot } = build(DirAskGPTV2, null, { context: { projectId: "" } });
        const stops = await run(dir, {
          name: "askgptv2",
          action: { question: "q", llm: "openai", model: "gpt-4", falseIntent: "KO" }
        });

        assert.strictEqual(chatbot.params.flowError, "AskGPT Error: namespace is undefined");
        assert.strictEqual(mock.seen.namespaces, 0, 'no namespace lookup is attempted');
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('DirAskGPTV2: pinecone reranking is declared and its multiplier clamped to 100 chunks', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES });
      try {
        const a = build(DirAskGPTV2, null);
        await run(a.dir, {
          name: "askgptv2",
          action: { question: "q", llm: "openai", model: "gpt-4", reranking: true, reranking_multiplier: 50, top_k: 30 }
        });
        assert.strictEqual(mock.seen.qa[0].search_type, undefined, 'a non-hybrid namespace stays on dense search');
        assert.strictEqual(mock.seen.qa[0].reranking.provider, "pinecone");
        assert.strictEqual(mock.seen.qa[0].reranking.model, "bge-reranker-v2-m3");
        assert.strictEqual(mock.seen.qa[0].reranking_multiplier, 3, 'floor(100 / 30)');

        const b = build(DirAskGPTV2, null);
        await run(b.dir, {
          name: "askgptv2",
          action: { question: "q", llm: "openai", model: "gpt-4", reranking: true, reranking_multiplier: 2, top_k: 200 }
        });
        assert.strictEqual(mock.seen.qa[1].reranking_multiplier, 1, 'floor(100 / 200) is 0, which is not allowed');
      } finally {
        await mock.close();
      }
    });

    it('DirAskGPTV2: chunks_only with no true connector lets the flow carry on', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES,
        qa: (req, res) => res.status(200).send({ success: true, answer: "a", chunks: ["c1"] })
      });
      try {
        const { dir, tdcache } = build(DirAskGPTV2, null);
        const stops = await run(dir, {
          name: "askgptv2",
          action: { question: "q", llm: "openai", model: "gpt-4", chunks_only: true, assignChunksTo: "kb_chunks" }
        });

        assert.deepStrictEqual(tdcache.attrs().kb_chunks, ["c1"]);
        assert.deepStrictEqual(dispatched, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('DirAskGPTV2: a quota or answered-question call that fails does not disturb the reply', async () => {
      process.env.GPTKEY = "sk-shared";
      const mock = await startMock({
        integrations: {}, namespaces: NAMESPACES,
        extra: (server) => {
          server.post('/:project_id/quotes/incr/tokens', (req, res) => res.status(500).send({ error: "quota down" }));
          server.post('/:project_id/kb/answered', (req, res) => res.status(500).send({ error: "kb down" }));
        }
      });
      try {
        const { dir, tdcache } = build(DirAskGPTV2, null);
        const stops = await run(dir, {
          name: "askgptv2",
          action: { question: "q", llm: "openai", model: "gpt-4", assignReplyTo: "kb_reply", trueIntent: "OK" }
        }, 400);

        assert.strictEqual(tdcache.attrs().kb_reply, "the kb answer",
          'the bookkeeping calls are fire-and-forget: their failure must not lose the answer');
        assert.deepStrictEqual(dispatched, ["/OK"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('DirAskGPTV2: an unanswered-question call that fails is warned about, not fatal', async () => {
      const mock = await startMock({
        integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES,
        qa: (req, res) => res.status(200).send({ success: false }),
        extra: (server) => {
          server.post('/:project_id/kb/unanswered', (req, res) => res.status(500).send({ error: "kb down" }));
        }
      });
      try {
        const { dir, logger, tdcache } = build(DirAskGPTV2, null);
        const stops = await run(dir, {
          name: "askgptv2",
          action: { question: "why", llm: "openai", model: "gpt-4", assignReplyTo: "kb_reply", falseIntent: "KO" }
        }, 400);

        assert.strictEqual(tdcache.attrs().kb_reply, "No answers");
        assert.ok(logger.at('warn').includes('Unable to add unanswered question'), logger.at('warn'));
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('DirAddKbContent: a project with no id at all reports an undefined namespace', async () => {
      process.env.GPTKEY = "sk-shared";
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION }, namespaces: NAMESPACES });
      try {
        const { dir, chatbot } = build(DirAddKbContent, null, { context: { projectId: "" } });
        const stops = await run(dir, { name: "addkbcontent", action: { type: "text", name: "n", content: "c" } });

        assert.strictEqual(chatbot.params.flowError, "[DirAddKbContent] Error: namespace is undefined");
        assert.strictEqual(mock.seen.kbContent.length, 0);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

  });

  describe('two last connector shapes', function () {

    it('DirAiPrompt: an unknown vllm server WITH a false connector routes there', async () => {
      const mock = await startMock({
        integrations: { vllm: { value: { servers: [{ name: "eu-1", url: "u", apikey: "k" }] } } }
      });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        const stops = await run(dir, {
          name: "aiPrompt",
          action: { question: "q", llm: "vllm", model: "m", vllmServer: "us-2", falseIntent: "KO" }
        });

        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: vllm server 'us-2' not found");
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
        assert.strictEqual(mock.seen.ask.length, 0);
      } finally {
        await mock.close();
      }
    });

    it('DirAssistant: connectors that are only whitespace count as not wired', async () => {
      // A designer that saves an empty connector writes "" or "  ", not null.
      // Without the trim() those would be truthy and the directive would try to
      // jump to an intent whose name is blank.
      const names = ['createThread', 'addMessage', 'createRun', 'getRun', 'threadMessages'];
      const original = {};
      for (const name of names) original[name] = openAIAssistantsService[name];
      openAIAssistantsService.createThread = async () => ({ id: "th-1" });
      openAIAssistantsService.addMessage = async () => undefined;
      openAIAssistantsService.createRun = async () => ({ id: "run-1" });
      openAIAssistantsService.getRun = async () => ({ status: "completed" });
      openAIAssistantsService.threadMessages = async () => ({ data: [{ content: [{ text: { value: "hi back" } }] }] });

      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, tdcache } = build(DirAssistant, null, { vars: { firstThread: "th-existing" } });
        const stops = await run(dir, {
          name: "gptassistant",
          action: {
            assistantId: "asst_1", prompt: "hi", assignResultTo: "ass_reply",
            trueIntent: "   ", falseIntent: ""
          }
        }, 400);

        assert.strictEqual(tdcache.attrs().ass_reply, "hi back");
        assert.deepStrictEqual(dispatched, [], 'a blank connector name must not be dispatched');
        assert.deepStrictEqual(stops, [false]);
      } finally {
        for (const name of names) openAIAssistantsService[name] = original[name];
        await mock.close();
      }
    });

  });

  // ------------------------------------- the missing-mandatory-attribute abort

  // DirAskGPTV2, DirAiPrompt and DirAiCondition all abort go() the same way
  // when a mandatory attribute is missing:
  //
  //   await this.checkMandatoryParameters(action).catch(async (missing) => {
  //     ...callback...
  //     return Promise.reject();     <-- rejects the awaited expression
  //   })
  //
  // The catch handler returning a rejected promise is deliberate: it is how
  // go() stops after it has already called back. But execute() called go()
  // without a .catch(), so that rejection was UNHANDLED - and an unhandled
  // rejection terminates a default node process, so every Ask KB / AI Prompt /
  // AI Condition block saved with an attribute still blank could take the
  // whole worker down. DirWebRequestV2.execute has the .catch() that makes the
  // same pattern safe; these three now do too.
  //
  // Each case below asserts the visible outcome (flowError, false connector,
  // nothing asked) AND that no unhandledRejection was emitted for it.
  describe('a missing mandatory attribute aborts without an unhandled rejection', function () {

    /** Runs `fn` with mocha's own handler off, collecting any unhandled rejection. */
    async function withoutUnhandledRejectionHandlers(fn) {
      const previous = process.listeners('unhandledRejection');
      const seen = [];
      process.removeAllListeners('unhandledRejection');
      process.on('unhandledRejection', (reason) => { seen.push(reason); });
      try {
        await fn();
        // An unhandled rejection is reported one macrotask after the promise
        // is abandoned; the 250ms settle inside run() is already past that,
        // but give the loop one more turn before reading the list.
        await new Promise((r) => setImmediate(r));
        await new Promise((r) => setTimeout(r, 50));
      } finally {
        process.removeAllListeners('unhandledRejection');
        for (const l of previous) process.on('unhandledRejection', l);
      }
      return seen;
    }

    it('DirAskGPTV2: no question sets flowError, takes the false connector and never rejects', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, chatbot, tdcache } = build(DirAskGPTV2, null);
        let stops;
        const unhandled = await withoutUnhandledRejectionHandlers(async () => {
          stops = await run(dir, { name: "askgptv2", action: { llm: "openai", model: "gpt-4o", falseIntent: "KO" } });
        });

        assert.deepStrictEqual(unhandled, [], 'the abort must not surface as an unhandled rejection');
        assert.strictEqual(chatbot.params.flowError, "AskKnowledgeBase Error: 'question' attribute is undefined");
        assert.strictEqual(tdcache.attrs().kb_reply, undefined);
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
        assert.strictEqual(mock.seen.qa.length, 0, 'nothing may be asked without a question');
      } finally {
        await mock.close();
      }
    });

    it('DirAiPrompt: no question sets flowError, takes the false connector and never rejects', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        let stops;
        const unhandled = await withoutUnhandledRejectionHandlers(async () => {
          stops = await run(dir, { name: "aiPrompt", action: { llm: "openai", model: "gpt-4o", falseIntent: "KO" } });
        });

        assert.deepStrictEqual(unhandled, [], 'the abort must not surface as an unhandled rejection');
        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: 'question' attribute is undefined");
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
        assert.strictEqual(mock.seen.ask.length, 0, 'nothing may be asked without a question');
      } finally {
        await mock.close();
      }
    });

    it('DirAiCondition: no model sets flowError, takes the error connector and never rejects', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, chatbot } = build(DirAiCondition, null);
        let stops;
        const unhandled = await withoutUnhandledRejectionHandlers(async () => {
          stops = await run(dir, { name: "aiCondition", action: { llm: "openai", intents: [{ label: "a", prompt: "p" }], errorIntent: "ERR" } });
        });

        assert.deepStrictEqual(unhandled, [], 'the abort must not surface as an unhandled rejection');
        assert.strictEqual(chatbot.params.flowError, "AiCondition Error: 'model' attribute is undefined");
        assert.deepStrictEqual(dispatched, ["/ERR"]);
        assert.deepStrictEqual(stops, [true]);
        assert.strictEqual(mock.seen.ask.length, 0, 'nothing may be asked without a model');
      } finally {
        await mock.close();
      }
    });

    it('an abort with no connector wired still calls back exactly once and never rejects', async () => {
      const mock = await startMock({ integrations: { openai: OPENAI_INTEGRATION } });
      try {
        const { dir, chatbot } = build(DirAiPrompt, null);
        let stops;
        const unhandled = await withoutUnhandledRejectionHandlers(async () => {
          stops = await run(dir, { name: "aiPrompt", action: { llm: "openai", model: "gpt-4o" } });
        });

        assert.deepStrictEqual(unhandled, []);
        assert.strictEqual(chatbot.params.flowError, "AiPrompt Error: 'question' attribute is undefined");
        assert.deepStrictEqual(dispatched, []);
        assert.deepStrictEqual(stops, [undefined]);
        assert.strictEqual(mock.seen.ask.length, 0);
      } finally {
        await mock.close();
      }
    });

  });

});
