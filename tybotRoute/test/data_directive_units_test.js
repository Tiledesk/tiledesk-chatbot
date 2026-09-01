'use strict';

// directives/data, driven directly instead of through a whole bot flow.
//
// These ten directives write flow attributes, call arbitrary http endpoints
// and evaluate designer-supplied expressions. Their happy paths are covered by
// the conversation-* files; the uncovered half is what happens when the action
// is malformed, the expression throws, the endpoint answers 4xx/5xx or the
// connection never settles - which is exactly where the four stalls recorded
// in the it.skip() blocks below live.
//
// Every test asserts something observable: the request that went out (url,
// method, headers, body), the flow attributes written to the cache, the
// flowError set, or which connector was taken.

var assert = require('assert');
var express = require('express');
const bodyParser = require('body-parser');

const { DirAssign } = require('../directives/data/DirAssign');
const { DirAssignFromFunction } = require('../directives/data/DirAssignFromFunction');
const { DirCode } = require('../directives/data/DirCode');
const { DirDataTables } = require('../directives/data/DirDataTables');
const { DirDeleteVariable } = require('../directives/data/DirDeleteVariable');
const { DirSetAttribute } = require('../directives/data/DirSetAttribute');
const { DirSetAttributeV2 } = require('../directives/data/DirSetAttributeV2');
const { DirWebRequest } = require('../directives/data/DirWebRequest');
const { DirWebRequestV2 } = require('../directives/data/DirWebRequestV2');
const { DirWebResponse } = require('../directives/data/DirWebResponse');

const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-dataunits";
const MOCK_PORT = 10002;
const TILEBOT_PORT = 10001;
const MOCK = 'http://localhost:' + MOCK_PORT;
const API_ENDPOINT = process.env.API_ENDPOINT || MOCK;

// ------------------------------------------------------------------ fakes

function fakeCache(vars, overrides) {
  const hashes = {};
  const key = "tilebot:requests:" + REQUEST_ID + ":parameters";
  hashes[key] = {};
  for (const [k, v] of Object.entries(vars || {})) hashes[key][k] = JSON.stringify(v);
  const published = [];
  return Object.assign({
    hashes,
    published,
    attrs() {
      const out = {};
      for (const [k, v] of Object.entries(hashes[key] || {})) {
        try { out[k] = JSON.parse(v); } catch (e) { out[k] = v; }
      }
      return out;
    },
    async hgetall(k) { return hashes[k] || {}; },
    async hget(k, f) { return (hashes[k] || {})[f]; },
    async hset(k, f, v) { (hashes[k] || (hashes[k] = {}))[f] = v; },
    async hdel(k, f) { delete (hashes[k] || {})[f]; },
    async get() { return null; },
    async set() { },
    async del() { },
    async expire() { },
    publish(topic, payload) { published.push({ topic, payload }); }
  }, overrides);
}

function fakeChatbot() {
  const params = {};
  return {
    params,
    botId: "botID",
    bot: { name: "Test Bot", root_id: "ROOT-1" },
    async getParameter(k) { return params[k]; },
    async addParameter(k, v) { params[k] = v; },
    async deleteParameter(k) { delete params[k]; }
  };
}

function recordingLogger() {
  const lines = [];
  const mk = (level) => (...args) => lines.push([level, args.map(String).join(' ')]);
  return {
    lines,
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

function build(Klass, opts = {}) {
  const tdcache = opts.noCache ? undefined : fakeCache(opts.vars, opts.cache);
  const chatbot = fakeChatbot();
  const dir = new Klass(contextFor(Object.assign({ tdcache, chatbot }, opts.context)));
  dir.logger = recordingLogger();
  return { dir, tdcache, chatbot, logger: dir.logger };
}

function run(dir, directive, settleMs) {
  return new Promise((resolve, reject) => {
    const stops = [];
    let timer = null;
    const guard = setTimeout(() => reject(new Error("the directive never called back")), 12000);
    dir.execute(directive, (stop) => {
      stops.push(stop);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { clearTimeout(guard); resolve(stops); }, settleMs === undefined ? 200 : settleMs);
    });
  });
}

// ------------------------------------------------------------------- mock

/**
 * One express app carrying:
 *  - /echo and /echo/:code, which reflect the request back (and can answer any
 *    status), for the two web-request directives;
 *  - the five data-table row endpoints;
 *  - whatever else a test registers through opts.extra.
 */
function startMock(opts = {}) {
  return new Promise((resolve) => {
    const seen = { echo: [], tables: [] };
    const server = express();
    server.use(bodyParser.json());
    if (opts.extra) opts.extra(server, seen);

    const echo = (req, res) => {
      seen.echo.push({
        method: req.method, url: req.originalUrl, headers: req.headers,
        body: req.body, query: req.query
      });
      const code = Number(req.params.code || 200);
      if (opts.echoBody !== undefined) { res.status(code).send(opts.echoBody); return; }
      res.status(code).send({ ok: true, saw: { method: req.method, body: req.body } });
    };
    server.all('/echo', echo);
    server.all('/echo/:code', echo);

    const table = (kind) => (req, res) => {
      seen.tables.push({
        kind, method: req.method, tableId: req.params.tableId,
        body: req.body, query: req.query, auth: req.headers.authorization
      });
      if (opts.tables) { opts.tables(kind, req, res); return; }
      res.status(200).send({ rows: [] });
    };
    server.get('/:projectId/tables/:tableId/rows/list', table('list'));
    server.post('/:projectId/tables/:tableId/row/insert', table('insert'));
    server.put('/:projectId/tables/:tableId/row/update', table('update'));
    server.put('/:projectId/tables/:tableId/row/upsert', table('upsert'));
    server.put('/:projectId/tables/:tableId/row/delete', table('delete'));

    const listener = server.listen(MOCK_PORT, '0.0.0.0', () => {
      resolve({ seen, close: () => new Promise((r) => listener.close(() => r())) });
    });
  });
}

// ==================================================================== tests

describe('Directives directives/data, the error and edge paths', function () {

  let tilebot;
  let dispatched = [];

  before((done) => {
    const server = express();
    server.use(bodyParser.json());
    server.post('/ext/:botid', (req, res) => {
      dispatched.push(req.body.payload.text);
      res.status(200).send({ success: true });
    });
    tilebot = server.listen(TILEBOT_PORT, '0.0.0.0', () => done());
  });

  after((done) => { tilebot.close(() => done()); });
  beforeEach(() => { dispatched = []; });

  // ---------------------------------------------------------------- DirAssign

  describe('DirAssign', function () {

    it('a directive with neither an action nor a parameter writes nothing', async () => {
      const { dir, tdcache } = build(DirAssign);
      const stops = await run(dir, { name: "assign" }, 50);
      assert.deepStrictEqual(stops, [undefined]);
      assert.deepStrictEqual(tdcache.attrs(), {});
    });

    it('the command-line parameter form is parsed into an expression and a destination', async () => {
      const { dir, tdcache } = build(DirAssign);
      await run(dir, { name: "assign", parameter: '--expression "2 + 3" --assignTo total' }, 50);
      assert.strictEqual(tdcache.attrs().total, 5);
    });

    it('an explicitly null destination is refused and nothing is written', async () => {
      const { dir, tdcache } = build(DirAssign);
      const stops = await run(dir, { name: "assign", action: { expression: "1", assignTo: null } }, 50);
      assert.deepStrictEqual(stops, [undefined]);
      assert.deepStrictEqual(tdcache.attrs(), {});
    });

    it('the destination name is itself filled from the flow attributes', async () => {
      const { dir, tdcache } = build(DirAssign, { vars: { suffix: "b", a: 2 } });
      await run(dir, { name: "assign", action: { expression: "$a * 10", assignTo: "total_{{suffix}}" } }, 50);
      assert.strictEqual(tdcache.attrs().total_b, 20);
    });

    it('without a cache nothing is written and the flow carries on', async () => {
      const { dir } = build(DirAssign, { noCache: true });
      const stops = await run(dir, { name: "assign", action: { expression: "1", assignTo: "x" } }, 50);
      assert.deepStrictEqual(stops, [undefined]);
    });

  });

  // ------------------------------------------------------ DirAssignFromFunction

  describe('DirAssignFromFunction', function () {

    it('a directive with no action writes nothing', async () => {
      const { dir, tdcache } = build(DirAssignFromFunction);
      const stops = await run(dir, { name: "functionValue" }, 50);
      assert.deepStrictEqual(stops, [undefined]);
      assert.deepStrictEqual(tdcache.attrs(), {});
    });

    it('openNow assigns the isopen flag', async () => {
      const { dir, tdcache } = build(DirAssignFromFunction);
      dir.tdClient = { openNow: (cb) => cb(null, { isopen: true }) };
      await run(dir, { name: "functionValue", action: { functionName: "openNow", assignTo: "is_open" } }, 50);
      assert.strictEqual(tdcache.attrs().is_open, true);
    });

    it('openNow with no result at all assigns false rather than nothing', async () => {
      const { dir, tdcache } = build(DirAssignFromFunction);
      dir.tdClient = { openNow: (cb) => cb(null, null) };
      await run(dir, { name: "functionValue", action: { functionName: "openNow", assignTo: "is_open" } }, 50);
      assert.strictEqual(tdcache.attrs().is_open, false);
    });

    it('a failing openNow leaves the attribute unwritten', async () => {
      const { dir, tdcache } = build(DirAssignFromFunction);
      dir.tdClient = { openNow: (cb) => cb(new Error("hours service down")) };
      const stops = await run(dir, { name: "functionValue", action: { functionName: "openNow", assignTo: "is_open" } }, 50);
      assert.deepStrictEqual(tdcache.attrs(), {});
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('availableAgents assigns how many agents came back', async () => {
      const { dir, tdcache } = build(DirAssignFromFunction);
      dir.tdClient = { getProjectAvailableAgents: (cb) => cb(null, [{ id: 1 }, { id: 2 }]) };
      await run(dir, { name: "functionValue", action: { functionName: "availableAgents", assignTo: "agents" } }, 50);
      assert.strictEqual(tdcache.attrs().agents, 2);
    });

    it('a failing availableAgents leaves the attribute unwritten', async () => {
      const { dir, tdcache } = build(DirAssignFromFunction);
      dir.tdClient = { getProjectAvailableAgents: (cb) => cb(new Error("nope"), null) };
      await run(dir, { name: "functionValue", action: { functionName: "availableAgents", assignTo: "agents" } }, 50);
      assert.deepStrictEqual(tdcache.attrs(), {});
    });

    it('an unknown function name writes nothing and still calls back', async () => {
      const { dir, tdcache } = build(DirAssignFromFunction);
      const stops = await run(dir, { name: "functionValue", action: { functionName: "teleport", assignTo: "x" } }, 50);
      assert.deepStrictEqual(tdcache.attrs(), {});
      assert.deepStrictEqual(stops, [undefined]);
    });

  });

  // ------------------------------------------------------------------ DirCode

  describe('DirCode', function () {

    it('a directive with no action carries on', async () => {
      const { dir, logger } = build(DirCode);
      const stops = await run(dir, { name: "code" }, 50);
      assert.deepStrictEqual(stops, [undefined]);
      assert.ok(logger.at('error').includes('Incorrect action for'));
    });

    it('blank source code is refused', async () => {
      const { dir, logger, tdcache } = build(DirCode);
      const stops = await run(dir, { name: "code", action: { source: "   " } }, 50);
      assert.ok(logger.at('warn').includes('Invalid source_code'), logger.at('warn'));
      assert.deepStrictEqual(tdcache.attrs(), {});
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('without a cache the code is not run', async () => {
      const { dir } = build(DirCode, { noCache: true });
      const stops = await run(dir, { name: "code", action: { source: "context.setAttribute('x', 1);" } }, 50);
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('setAttribute and deleteAttribute from the sandbox reach the cache', async () => {
      const { dir, tdcache } = build(DirCode, { vars: { old: "gone", n: 3 } });
      await run(dir, {
        name: "code",
        action: { source: "context.setAttribute('doubled', context.allAttributes().n * 2); context.deleteAttribute('old');" }
      }, 100);

      assert.strictEqual(tdcache.attrs().doubled, 6);
      assert.strictEqual('old' in tdcache.attrs(), false, 'deleteAttribute must remove the attribute');
    });

    it('source that throws is logged and the flow carries on', async () => {
      // The sandbox swallows the throw itself; this one blows up in the
      // Object.entries() loop that follows, which is what the catch is for.
      const { dir, logger } = build(DirCode, {
        cache: { hset: async () => { throw new Error("redis is gone"); } },
        vars: {}
      });
      const stops = await run(dir, { name: "code", action: { source: "context.setAttribute('x', 1);" } }, 100);

      assert.ok(logger.at('error').includes('[Code] An error occurred'), logger.at('error'));
      assert.deepStrictEqual(stops, [undefined]);
    });

  });

  // -------------------------------------------------------- DirDeleteVariable

  describe('DirDeleteVariable', function () {

    it('a directive with neither an action nor a parameter is refused', async () => {
      const { dir, logger, tdcache } = build(DirDeleteVariable, { vars: { keep: 1 } });
      const stops = await run(dir, { name: "delete" }, 50);
      assert.ok(logger.at('error').includes('Incorrect action for'));
      assert.deepStrictEqual(tdcache.attrs(), { keep: 1 });
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('the parameter form deletes the named attribute', async () => {
      const { dir, tdcache } = build(DirDeleteVariable, { vars: { gone: 1, keep: 2 } });
      await run(dir, { name: "delete", parameter: "gone" }, 50);
      assert.deepStrictEqual(tdcache.attrs(), { keep: 2 });
    });

    it('an action with no variableName warns and deletes nothing', async () => {
      const { dir, logger, tdcache } = build(DirDeleteVariable, { vars: { keep: 1 } });
      const stops = await run(dir, { name: "delete", action: {} }, 50);
      assert.ok(logger.at('warn').includes("Missing 'variableName'"), logger.at('warn'));
      assert.deepStrictEqual(tdcache.attrs(), { keep: 1 });
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('the attribute name is itself filled from the flow attributes', async () => {
      const { dir, tdcache } = build(DirDeleteVariable, { vars: { which: "b", val_b: 9, val_a: 1 } });
      await run(dir, { name: "delete", action: { variableName: "val_{{which}}" } }, 50);
      assert.strictEqual('val_b' in tdcache.attrs(), false);
      assert.strictEqual(tdcache.attrs().val_a, 1);
    });

    // DEFECT - directives/data/DirDeleteVariable.js:69
    //
    //   catch(err) {
    //     ...
    //     if (completion) {      <-- `completion` is not declared anywhere
    //       completion();
    //     }
    //   }
    //
    // The parameter is called `callback`; `completion` is a leftover from an
    // older signature. Reading an undeclared identifier throws
    // "ReferenceError: completion is not defined", so the one path that exists
    // to recover from a cache failure instead replaces it with a second,
    // fatal error - and the callback is never called, so the conversation
    // stalls. execute() does not await go(), so nothing catches it either.
    //
    // Correct behaviour, asserted here: log it and call back.
    it('a cache failure while deleting is logged and the flow carries on', async () => {
      const { dir, logger } = build(DirDeleteVariable, {
        cache: { hgetall: async () => { throw new Error("redis is gone"); } }
      });
      const stops = await run(dir, { name: "delete", action: { variableName: "gone" } }, 50);

      assert.ok(logger.at('error').includes('Error deleting attribute'), logger.at('error'));
      assert.strictEqual(stops.length, 1, 'the directive must call back exactly once');
    });

  });

  // ---------------------------------------------------------- DirSetAttribute

  describe('DirSetAttribute', function () {

    const OK = {
      _tdActionType: "setattribute",
      destination: "total",
      operation: { operands: [{ value: "10", isVariable: false }] }
    };

    it('a directive with no action writes nothing', async () => {
      const { dir, tdcache } = build(DirSetAttribute);
      const stops = await run(dir, { name: "setattribute" }, 50);
      assert.deepStrictEqual(tdcache.attrs(), {});
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('an action the schema rejects writes nothing', async () => {
      const { dir, tdcache } = build(DirSetAttribute);
      await run(dir, { name: "setattribute", action: { _tdActionType: "setattribute", destination: "total" } }, 50);
      assert.deepStrictEqual(tdcache.attrs(), {}, 'a missing operation must not be assigned');
    });

    it('two operands with no operators are refused', async () => {
      const { dir, tdcache } = build(DirSetAttribute);
      await run(dir, {
        name: "setattribute",
        action: Object.assign({}, OK, {
          operation: { operands: [{ value: "1", isVariable: false }, { value: "2", isVariable: false }] }
        })
      }, 50);
      assert.deepStrictEqual(tdcache.attrs(), {});
    });

    it('an operator list that does not match the operand count is refused', async () => {
      const { dir, tdcache } = build(DirSetAttribute);
      await run(dir, {
        name: "setattribute",
        action: Object.assign({}, OK, {
          operation: {
            operators: ["addAsNumber", "addAsNumber"],
            operands: [{ value: "1", isVariable: false }, { value: "2", isVariable: false }]
          }
        })
      }, 50);
      assert.deepStrictEqual(tdcache.attrs(), {});
    });

    it('a well-formed operation is evaluated and assigned', async () => {
      const { dir, tdcache } = build(DirSetAttribute, { vars: { n: "4" } });
      await run(dir, {
        name: "setattribute",
        action: Object.assign({}, OK, {
          operation: {
            operators: ["addAsNumber"],
            operands: [{ value: "n", isVariable: true }, { value: "6", isVariable: false }]
          }
        })
      }, 50);
      assert.strictEqual(tdcache.attrs().total, 10);
    });

  });

  // -------------------------------------------------------- DirSetAttributeV2

  describe('DirSetAttributeV2', function () {

    it('a directive with no action writes nothing', async () => {
      const { dir, tdcache, logger } = build(DirSetAttributeV2);
      const stops = await run(dir, { name: "setattributev2" }, 50);
      assert.ok(logger.at('error').includes('Incorrect action for'));
      assert.deepStrictEqual(tdcache.attrs(), {});
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('an action with no operation writes nothing', async () => {
      const { dir, tdcache } = build(DirSetAttributeV2);
      const stops = await run(dir, { name: "setattributev2", action: { destination: "total" } }, 50);
      assert.deepStrictEqual(tdcache.attrs(), {});
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('two operands with no operators are refused', async () => {
      const { dir, tdcache } = build(DirSetAttributeV2);
      await run(dir, {
        name: "setattributev2",
        action: { destination: "total", operation: { operands: [{ value: "1" }, { value: "2" }] } }
      }, 50);
      assert.deepStrictEqual(tdcache.attrs(), {});
    });

    it('an operator list that does not match the operand count is refused', async () => {
      const { dir, tdcache } = build(DirSetAttributeV2);
      await run(dir, {
        name: "setattributev2",
        action: {
          destination: "total",
          operation: { operators: ["addAsNumber", "addAsNumber"], operands: [{ value: "1" }, { value: "2" }] }
        }
      }, 50);
      assert.deepStrictEqual(tdcache.attrs(), {});
    });

    it('operand values and the destination name are both filled from the flow attributes', async () => {
      const { dir, tdcache } = build(DirSetAttributeV2, { vars: { amount: "7", suffix: "eur" } });
      await run(dir, {
        name: "setattributev2",
        action: {
          destination: "total_{{suffix}}",
          operation: {
            operators: ["addAsNumber"],
            operands: [{ value: "{{amount}}", isVariable: false }, { value: "3", isVariable: false }]
          }
        }
      }, 50);
      assert.strictEqual(tdcache.attrs().total_eur, 10);
    });

    it('a single json operand is parsed and assigned as an object, with no operation applied', async () => {
      const { dir, tdcache } = build(DirSetAttributeV2);
      await run(dir, {
        name: "setattributev2",
        action: {
          destination: "payload",
          operation: { operands: [{ value: '{"city":"Rome","n":2}', isVariable: false, type: "json" }] }
        }
      }, 50);
      assert.deepStrictEqual(tdcache.attrs().payload, { city: "Rome", n: 2 });
    });

    it('an expression that cannot be evaluated leaves the destination unwritten', async () => {
      const { dir, tdcache } = build(DirSetAttributeV2, {
        cache: { hgetall: async () => { throw new Error("redis is gone"); } }
      });
      const stops = await run(dir, {
        name: "setattributev2",
        action: { destination: "total", operation: { operands: [{ value: "1", isVariable: false }] } }
      }, 50);
      assert.deepStrictEqual(tdcache.attrs(), {});
      assert.deepStrictEqual(stops, [undefined], 'a failed evaluation must still let the flow carry on');
    });

    it('convertOperandValues casts by declared type and survives an unparseable json', async () => {
      const { dir } = build(DirSetAttributeV2);

      const operands = [
        { value: "12", type: "number" },
        { value: '{"a":1}', type: "JSON" },
        { value: "left alone", type: "something-else" },
        { value: "untyped" }
      ];
      dir.convertOperandValues(operands);
      assert.strictEqual(operands[0].value, 12);
      assert.deepStrictEqual(operands[1].value, { a: 1 });
      assert.strictEqual(operands[2].value, "left alone");
      assert.strictEqual(operands[3].value, "untyped");

      const broken = [{ value: "{not json", type: "json" }, { value: "9", type: "number" }];
      dir.convertOperandValues(broken);
      assert.strictEqual(broken[0].value, "{not json", 'the parse failure is caught, the value left as it was');
      assert.strictEqual(broken[1].value, "9", 'and the loop stops there rather than throwing out');
    });

    it('fixToken adds the JWT prefix only when it is missing', async () => {
      const { dir } = build(DirSetAttributeV2);
      assert.strictEqual(dir.fixToken("abc"), "JWT abc");
      assert.strictEqual(dir.fixToken("JWT abc"), "JWT abc");
    });

    it('persistOnTiledesk does nothing at all when no persistence endpoint is configured', async () => {
      const was = process.env.PERSIST_API_ENDPOINT;
      delete process.env.PERSIST_API_ENDPOINT;
      const mock = await startMock({});
      try {
        const { dir } = build(DirSetAttributeV2);
        assert.strictEqual(await dir.persistOnTiledesk("k", "v"), undefined);
        assert.deepStrictEqual(mock.seen.echo, [], 'nothing may be sent when persistence is off');
      } finally {
        if (was === undefined) delete process.env.PERSIST_API_ENDPOINT; else process.env.PERSIST_API_ENDPOINT = was;
        await mock.close();
      }
    });

    // DEFECT - directives/data/DirSetAttributeV2.js:197
    //
    //   const HTTPREQUEST = { url: persist_api_endpoint, ..., json: json, ... }
    //
    // There is no `json` in scope: persistOnTiledesk(key, value) never builds
    // one. With PERSIST_API_ENDPOINT set, the very first statement past the
    // guard throws "ReferenceError: json is not defined", so attribute
    // persistence cannot work at all. It is currently unreachable from go()
    // (the only call was commented out at line 164), which is why nothing has
    // noticed - but the method is public and this is what happens the moment
    // it is wired back up.
    //
    // Correct behaviour, asserted here: POST the key/value pair to the
    // configured endpoint with the project token.
    it('persistOnTiledesk posts the attribute to the configured endpoint', async () => {
      const was = process.env.PERSIST_API_ENDPOINT;
      process.env.PERSIST_API_ENDPOINT = MOCK + '/echo';
      const mock = await startMock({});
      try {
        const { dir } = build(DirSetAttributeV2);
        await dir.persistOnTiledesk("counter", 7);
        await new Promise((r) => setTimeout(r, 200));

        assert.strictEqual(mock.seen.echo.length, 1);
        assert.strictEqual(mock.seen.echo[0].method, "POST");
        assert.strictEqual(mock.seen.echo[0].headers.authorization, "JWT XXX");
        assert.deepStrictEqual(mock.seen.echo[0].body, { counter: 7 });
      } finally {
        if (was === undefined) delete process.env.PERSIST_API_ENDPOINT; else process.env.PERSIST_API_ENDPOINT = was;
        await mock.close();
      }
    });

  });

  // ------------------------------------------------------------ DirWebRequest

  describe('DirWebRequest', function () {

    it('a directive with no action sends nothing', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirWebRequest);
        const stops = await run(dir, { name: "webRequest" }, 50);
        assert.deepStrictEqual(stops, [undefined]);
        assert.deepStrictEqual(mock.seen.echo, []);
      } finally {
        await mock.close();
      }
    });

    it('the url, the headers and the json body are all filled from the flow attributes', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirWebRequest, { vars: { who: "Ada", tok: "t-1" } });
        await run(dir, {
          name: "webRequest",
          action: {
            url: MOCK + "/echo?who={{who}}",
            method: "POST",
            headersString: { "X-Token": "Bearer {{tok}}" },
            jsonBody: '{"name":"{{who}}"}'
          }
        });

        assert.strictEqual(mock.seen.echo.length, 1);
        assert.strictEqual(mock.seen.echo[0].method, "POST");
        assert.strictEqual(mock.seen.echo[0].query.who, "Ada");
        assert.strictEqual(mock.seen.echo[0].headers['x-token'], "Bearer t-1");
        assert.deepStrictEqual(mock.seen.echo[0].body, { name: "Ada" });
      } finally {
        await mock.close();
      }
    });

    it('a jsonBody that is not valid json is dropped and the request is still sent', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirWebRequest);
        await run(dir, {
          name: "webRequest",
          action: { url: MOCK + "/echo", method: "POST", jsonBody: '{"name": }' }
        });

        assert.strictEqual(mock.seen.echo.length, 1);
        assert.deepStrictEqual(mock.seen.echo[0].body, {}, 'an unparseable body is sent as nothing');
      } finally {
        await mock.close();
      }
    });

    it('the deprecated assignTo writes the whole response body to one attribute', async () => {
      const mock = await startMock({ echoBody: { greeting: "hello" } });
      try {
        const { dir, tdcache } = build(DirWebRequest);
        await run(dir, { name: "webRequest", action: { url: MOCK + "/echo", method: "GET", assignTo: "resp" } });

        assert.deepStrictEqual(tdcache.attrs().resp, { greeting: "hello" });
      } finally {
        await mock.close();
      }
    });

    it('assignments pull individual fields out of the response with a json path', async () => {
      const mock = await startMock({ echoBody: { data: { user: { name: "Ada" }, ids: [7, 8] } } });
      try {
        const { dir, tdcache } = build(DirWebRequest);
        await run(dir, {
          name: "webRequest",
          action: {
            url: MOCK + "/echo", method: "GET",
            assignments: { user_name: "data.user.name", first_id: "data.ids.[0]", missing: "data.nope.deeper" }
          }
        });

        assert.strictEqual(tdcache.attrs().user_name, "Ada");
        // TiledeskJSONEval renders through handlebars, so every extracted value
        // arrives as a string - see the 'time' case in json_eval_test.js.
        assert.strictEqual(tdcache.attrs().first_id, "7");
        assert.strictEqual(tdcache.attrs().missing, "",
          'a path that does not resolve is written as the empty string');
      } finally {
        await mock.close();
      }
    });

    it('a plain-text response is wrapped under "body" before the assignments run', async () => {
      const mock = await startMock({ echoBody: "just some text" });
      try {
        const { dir, tdcache } = build(DirWebRequest);
        await run(dir, {
          name: "webRequest",
          action: { url: MOCK + "/echo", method: "GET", assignments: { text: "body" } }
        });

        assert.strictEqual(tdcache.attrs().text, "just some text");
      } finally {
        await mock.close();
      }
    });

    it('a 201 is treated as a failure and no attribute is written', async () => {
      const mock = await startMock({});
      try {
        const { dir, tdcache } = build(DirWebRequest);
        const stops = await run(dir, {
          name: "webRequest",
          action: { url: MOCK + "/echo/201", method: "POST", assignTo: "resp" }
        });

        assert.strictEqual(mock.seen.echo.length, 1, 'the request IS made');
        assert.deepStrictEqual(tdcache.attrs(), {}, 'but only a literal 200 counts as success');
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('a 500 is logged and the flow carries on without writing anything', async () => {
      const mock = await startMock({});
      try {
        const { dir, tdcache } = build(DirWebRequest);
        const stops = await run(dir, {
          name: "webRequest",
          action: { url: MOCK + "/echo/500", method: "GET", assignTo: "resp" }
        });

        assert.deepStrictEqual(tdcache.attrs(), {});
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    // DEFECT - directives/data/DirWebRequest.js:153
    //
    //   .catch( (error) => {
    //     winston.error("(DirWebRequest) Axios error: ", error.response.data);
    //
    // `error.response` is undefined for every TRANSPORT failure - connection
    // refused, DNS failure, socket reset, timeout - which is exactly the case
    // this catch exists for. Reading `.data` off it throws "TypeError: Cannot
    // read properties of undefined (reading 'data')" INSIDE the axios catch
    // handler, so `callback(error, null)` on the next line never runs, the
    // directive never calls back and the conversation stalls. A 4xx/5xx is
    // fine (it has a response); an unreachable host is not.
    //
    // Correct behaviour, asserted here: log it and carry on, as the non-2xx
    // path already does.
    it('a connection that is refused is logged and the flow carries on', async () => {
      const { dir, tdcache } = build(DirWebRequest);
      // Nothing is listening on this port: axios rejects with no `response`.
      const stops = await run(dir, {
        name: "webRequest",
        action: { url: "http://127.0.0.1:10099/nothing", method: "GET", assignTo: "resp" }
      });

      assert.deepStrictEqual(tdcache.attrs(), {});
      assert.strictEqual(stops.length, 1, 'the directive must call back exactly once');
    });

  });

  // ---------------------------------------------------------- DirWebRequestV2

  describe('DirWebRequestV2', function () {

    it('a directive with no action sends nothing', async () => {
      const mock = await startMock({});
      try {
        const { dir, logger } = build(DirWebRequestV2);
        const stops = await run(dir, { name: "webRequestV2" }, 50);
        assert.ok(logger.at('error').includes('Incorrect action for'));
        assert.deepStrictEqual(mock.seen.echo, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('without a cache it sends nothing', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirWebRequestV2, { noCache: true });
        const stops = await run(dir, { name: "webRequestV2", action: { url: MOCK + "/echo", method: "GET" } }, 50);
        assert.deepStrictEqual(mock.seen.echo, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('a 2xx assigns the body and the status and takes the true connector', async () => {
      const mock = await startMock({ echoBody: { greeting: "hello" } });
      try {
        const { dir, tdcache } = build(DirWebRequestV2, { vars: { who: "Ada" } });
        const stops = await run(dir, {
          name: "webRequestV2",
          action: {
            url: MOCK + "/echo", method: "POST", bodyType: "json", jsonBody: '{"name":"{{who}}"}',
            headersString: { "X-Who": "{{who}}" },
            assignResultTo: "resp", assignStatusTo: "status", assignErrorTo: "err",
            trueIntent: "OK", falseIntent: "KO"
          }
        });

        assert.deepStrictEqual(mock.seen.echo[0].body, { name: "Ada" });
        assert.strictEqual(mock.seen.echo[0].headers['x-who'], "Ada");
        assert.deepStrictEqual(tdcache.attrs().resp, { greeting: "hello" });
        assert.strictEqual(tdcache.attrs().status, 200);
        assert.strictEqual(tdcache.attrs().err, undefined, 'nothing is written to the error attribute on success');
        assert.deepStrictEqual(dispatched, ["/OK"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a 404 assigns the status and the error and takes the false connector', async () => {
      const mock = await startMock({ echoBody: { message: "no such thing" } });
      try {
        const { dir, tdcache, logger } = build(DirWebRequestV2);
        const stops = await run(dir, {
          name: "webRequestV2",
          action: {
            url: MOCK + "/echo/404", method: "GET",
            assignResultTo: "resp", assignStatusTo: "status", assignErrorTo: "err",
            trueIntent: "OK", falseIntent: "KO"
          }
        });

        assert.deepStrictEqual(tdcache.attrs().resp, { message: "no such thing" });
        assert.strictEqual(tdcache.attrs().status, 404);
        assert.ok(typeof tdcache.attrs().err === 'string' && tdcache.attrs().err.length > 0, tdcache.attrs().err);
        assert.ok(logger.at('error').includes('[Web Request] error'), logger.at('error'));
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a 404 with no false connector lets the flow carry on', async () => {
      const mock = await startMock({ echoBody: { message: "nope" } });
      try {
        const { dir } = build(DirWebRequestV2);
        const stops = await run(dir, { name: "webRequestV2", action: { url: MOCK + "/echo/404", method: "GET" } });
        assert.deepStrictEqual(dispatched, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('a 2xx with no true connector lets the flow carry on', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirWebRequestV2);
        const stops = await run(dir, { name: "webRequestV2", action: { url: MOCK + "/echo", method: "GET" } });
        assert.deepStrictEqual(dispatched, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('a jsonBody that is not valid json sets flowError and takes the false connector', async () => {
      const mock = await startMock({});
      try {
        const { dir, chatbot } = build(DirWebRequestV2);
        await run(dir, {
          name: "webRequestV2",
          action: { url: MOCK + "/echo", method: "POST", bodyType: "json", jsonBody: '{"name": }', falseIntent: "KO" }
        });

        assert.strictEqual(chatbot.params.flowError, "Error parsing json body");
        assert.deepStrictEqual(mock.seen.echo, [], 'a body that will not parse must not be sent');
        assert.deepStrictEqual(dispatched, ["/KO"]);
      } finally {
        await mock.close();
      }
    });

    it('a jsonBody that is not valid json with no false connector sets flowError and sends nothing', async () => {
      const mock = await startMock({});
      try {
        const { dir, chatbot } = build(DirWebRequestV2);
        const stops = await run(dir, {
          name: "webRequestV2",
          action: { url: MOCK + "/echo", method: "POST", bodyType: "json", jsonBody: '{oops' }
        });

        assert.strictEqual(chatbot.params.flowError, "Error parsing json body");
        assert.deepStrictEqual(mock.seen.echo, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('form-data fields are filled and sent, disabled ones are left out', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirWebRequestV2, { vars: { who: "Ada" } });
        await run(dir, {
          name: "webRequestV2",
          action: {
            url: MOCK + "/echo", method: "POST", bodyType: "form-data",
            formData: [
              { name: "name", value: "{{who}}", type: "Text", enabled: true },
              { name: "skipped", value: "x", type: "Text", enabled: false },
              { name: "empty", value: "", type: "Text", enabled: true }
            ]
          }
        });

        assert.deepStrictEqual(mock.seen.echo[0].body, { name: "Ada" });
      } finally {
        await mock.close();
      }
    });

    it('a form-data URL field that cannot be fetched sets flowError and sends nothing', async () => {
      const mock = await startMock({});
      try {
        const { dir, chatbot } = build(DirWebRequestV2);
        await run(dir, {
          name: "webRequestV2",
          action: {
            url: MOCK + "/echo", method: "POST", bodyType: "form-data",
            formData: [{ name: "file", value: "http://127.0.0.1:10099/nothing", type: "URL", enabled: true }],
            falseIntent: "KO"
          }
        });

        assert.strictEqual(chatbot.params.flowError, "Error parsing json body");
        assert.deepStrictEqual(mock.seen.echo, []);
        assert.deepStrictEqual(dispatched, ["/KO"]);
      } finally {
        await mock.close();
      }
    });

    it('a request that times out is reported with a synthetic status and takes the false connector', async () => {
      const mock = await startMock({
        extra: (server) => { server.get('/slow', () => { /* never answers */ }); }
      });
      try {
        const { dir, tdcache } = build(DirWebRequestV2);
        const stops = await run(dir, {
          name: "webRequestV2",
          action: {
            url: MOCK + "/slow", method: "GET", settings: { timeout: 300 },
            assignStatusTo: "status", assignErrorTo: "err", falseIntent: "KO"
          }
        }, 400);

        assert.ok(typeof tdcache.attrs().err === 'string' && tdcache.attrs().err.length > 0, tdcache.attrs().err);
        assert.ok(tdcache.attrs().status !== 200, 'a timeout is not a 200');
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a timeout outside the accepted range falls back to the 20s default', async () => {
      const mock = await startMock({
        extra: (server, seen) => {
          server.get('/slowish', (req, res) => { setTimeout(() => res.status(200).send({ ok: true }), 400); });
        }
      });
      try {
        const { dir, tdcache } = build(DirWebRequestV2);
        await run(dir, {
          name: "webRequestV2",
          action: { url: MOCK + "/slowish", method: "GET", settings: { timeout: 999999 }, assignStatusTo: "status" }
        }, 700);

        assert.strictEqual(tdcache.attrs().status, 200,
          'an out-of-range timeout must not be honoured, or this 400ms request would be cut off');
      } finally {
        await mock.close();
      }
    });

    // DEFECT - directives/data/DirWebRequestV2.js:266 and :315-317
    //
    //   if (options.url.startsWith("https:")) { ... }
    //   ...
    //   catch (error) { winston.error("DirWebRequestV2 Error:", error); }
    //
    // With no url on the action - a Web Request block whose url attribute
    // resolved to nothing, e.g. an unset flow attribute - `options.url` is
    // undefined and `.startsWith` throws. The outer try/catch swallows it and
    // returns WITHOUT calling the callback, so the directive never calls back
    // and the conversation stalls: no reply, no false connector, one winston
    // line. That catch is the only exit in the file that does not call back.
    //
    // Correct behaviour, asserted here: report it like any other failed
    // request - the error attribute plus the false connector.
    it('an action with no url reports the failure instead of stalling', async () => {
      const mock = await startMock({});
      try {
        const { dir, tdcache } = build(DirWebRequestV2);
        const stops = await run(dir, {
          name: "webRequestV2",
          action: { method: "GET", assignErrorTo: "err", falseIntent: "KO" }
        });

        assert.ok(tdcache.attrs().err, 'the failure must reach the error attribute');
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.strictEqual(stops.length, 1, 'the directive must call back exactly once');
      } finally {
        await mock.close();
      }
    });

  });

  // ----------------------------------------------------------- DirWebResponse

  describe('DirWebResponse', function () {

    it('a directive with no action publishes nothing', async () => {
      const { dir, tdcache, logger } = build(DirWebResponse);
      const stops = await run(dir, { name: "webResponse" }, 50);
      assert.ok(logger.at('error').includes('Incorrect action for'));
      assert.deepStrictEqual(tdcache.published, []);
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('without a cache it publishes nothing', async () => {
      const { dir } = build(DirWebResponse, { noCache: true });
      const stops = await run(dir, { name: "webResponse", action: { status: "200" } }, 50);
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('the status and the filled json payload are published on the request webhook topic', async () => {
      const { dir, tdcache } = build(DirWebResponse, { vars: { who: "Ada", code: "201" } });
      const stops = await run(dir, {
        name: "webResponse",
        action: { status: "{{code}}", bodyType: "json", payload: '{"name":"{{who}}"}' }
      }, 50);

      assert.strictEqual(tdcache.published.length, 1);
      assert.strictEqual(tdcache.published[0].topic, "/webhooks/" + REQUEST_ID);
      assert.deepStrictEqual(JSON.parse(tdcache.published[0].payload), { status: "201", payload: { name: "Ada" } });
      assert.deepStrictEqual(stops, [undefined]);
    });

    it('an action with no json payload publishes a null payload', async () => {
      const { dir, tdcache } = build(DirWebResponse);
      await run(dir, { name: "webResponse", action: { status: "204" } }, 50);

      assert.deepStrictEqual(JSON.parse(tdcache.published[0].payload), { status: "204", payload: null });
    });

    it('a cache that cannot publish is logged and the flow carries on', async () => {
      const { dir } = build(DirWebResponse, {
        cache: { publish: () => { throw new Error("no pubsub here"); } }
      });
      const stops = await run(dir, { name: "webResponse", action: { status: "200" } }, 50);
      assert.deepStrictEqual(stops, [undefined]);
    });

    // DEFECT - directives/data/DirWebResponse.js:48 and :84
    //
    //   const json = await this.getJsonFromAction(action, filler, requestAttributes)
    //   ...
    //   catch (err) { ...; reject("Error parsing jsonBody"); }
    //
    // getJsonFromAction REJECTS when the payload is not valid json, and line 48
    // awaits it with no .catch(). go() therefore rejects, and execute() does
    // not await go(), so the rejection is unhandled: nothing is published, the
    // callback is never called and the conversation stalls. The sibling
    // DirWebRequestV2 has exactly the same helper and DOES attach a .catch()
    // (line 90-100) that sets flowError and routes.
    //
    // Correct behaviour, asserted here: at minimum, still call back.
    it('a payload that is not valid json is reported instead of stalling', async () => {
      const { dir, tdcache, logger } = build(DirWebResponse);
      const stops = await run(dir, {
        name: "webResponse",
        action: { status: "200", bodyType: "json", payload: '{"name": }' }
      }, 50);

      assert.ok(logger.at('error').includes('Error parsing webRequest jsonBody'), logger.at('error'));
      assert.deepStrictEqual(tdcache.published, [], 'a payload that will not parse must not be published');
      assert.strictEqual(stops.length, 1, 'the directive must call back exactly once');
    });

  });

  // ------------------------------------------------------------ DirDataTables

  describe('DirDataTables', function () {

    it('a directive with no action calls no table endpoint', async () => {
      const mock = await startMock({});
      try {
        const { dir, logger } = build(DirDataTables);
        const stops = await run(dir, { name: "datatables" }, 50);
        assert.ok(logger.at('error').includes('Incorrect action for'));
        assert.deepStrictEqual(mock.seen.tables, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('without a cache it calls no table endpoint', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirDataTables, { noCache: true });
        const stops = await run(dir, { name: "datatables", action: { tableId: "T1", operation: "get" } }, 50);
        assert.deepStrictEqual(mock.seen.tables, []);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('a tableId that resolves to nothing is reported on the error attribute', async () => {
      const mock = await startMock({});
      try {
        const { dir, tdcache } = build(DirDataTables);
        const stops = await run(dir, {
          name: "datatables",
          action: { tableId: "{{missing_table}}", operation: "get", assignErrorTo: "dt_error", falseIntent: "KO" }
        });

        assert.strictEqual(tdcache.attrs().dt_error, "tableId is required");
        assert.deepStrictEqual(mock.seen.tables, []);
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a missing tableId with no false connector still records the error', async () => {
      const mock = await startMock({});
      try {
        const { dir, tdcache } = build(DirDataTables);
        const stops = await run(dir, { name: "datatables", action: { operation: "get", assignErrorTo: "dt_error" } }, 50);

        assert.strictEqual(tdcache.attrs().dt_error, "tableId is required");
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('an unsupported operation is reported with the list of the ones that are', async () => {
      const mock = await startMock({});
      try {
        const { dir, tdcache } = build(DirDataTables);
        await run(dir, {
          name: "datatables",
          action: { tableId: "T1", operation: "truncate", assignErrorTo: "dt_error", falseIntent: "KO" }
        });

        assert.strictEqual(tdcache.attrs().dt_error, "operation must be one of: get, insert, update, delete, upsert");
        assert.deepStrictEqual(mock.seen.tables, []);
        assert.deepStrictEqual(dispatched, ["/KO"]);
      } finally {
        await mock.close();
      }
    });

    it('an action with no operation at all is refused the same way', async () => {
      const mock = await startMock({});
      try {
        const { dir, tdcache } = build(DirDataTables);
        const stops = await run(dir, { name: "datatables", action: { tableId: "T1", assignErrorTo: "dt_error" } }, 50);

        assert.ok(String(tdcache.attrs().dt_error).startsWith("operation must be one of"), tdcache.attrs().dt_error);
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('get sends the filled conditions as a query parameter and assigns the rows', async () => {
      const mock = await startMock({ tables: (kind, req, res) => res.status(200).send([{ id: 1 }, { id: 2 }]) });
      try {
        const { dir, tdcache } = build(DirDataTables, { vars: { who: "Ada", table: "T-9" } });
        const stops = await run(dir, {
          name: "datatables",
          action: {
            tableId: "{{table}}", operation: "get", must_match: "all",
            conditions: [{ column: "name", operator: "eq", value: "{{who}}" }, { column: "age", operator: "gt" }],
            assignResultTo: "rows", trueIntent: "OK"
          }
        });

        assert.strictEqual(mock.seen.tables.length, 1);
        assert.strictEqual(mock.seen.tables[0].kind, "list");
        assert.strictEqual(mock.seen.tables[0].tableId, "T-9");
        assert.strictEqual(mock.seen.tables[0].auth, "JWT XXX");
        assert.strictEqual(mock.seen.tables[0].query.must_match, "all");
        assert.deepStrictEqual(JSON.parse(mock.seen.tables[0].query.conditions), [
          { column: "name", operator: "eq", value: "Ada" },
          { column: "age", operator: "gt" }
        ]);
        assert.deepStrictEqual(tdcache.attrs().rows, [{ id: 1 }, { id: 2 }]);
        assert.deepStrictEqual(dispatched, ["/OK"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('get with no conditions sends no conditions parameter', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirDataTables);
        await run(dir, { name: "datatables", action: { tableId: "T1", operation: "get", conditions: [] } });

        assert.strictEqual(mock.seen.tables[0].query.conditions, undefined);
        assert.strictEqual(mock.seen.tables[0].query.must_match, undefined);
      } finally {
        await mock.close();
      }
    });

    it('insert POSTs the filled data and unwraps the row document it gets back', async () => {
      const mock = await startMock({
        tables: (kind, req, res) => res.status(200).send({ _id: "r1", data: { name: "Ada", age: 36 } })
      });
      try {
        const { dir, tdcache } = build(DirDataTables, { vars: { who: "Ada" } });
        await run(dir, {
          name: "datatables",
          action: {
            tableId: "T1", operation: "insert", id_row: "row-{{who}}",
            data: { name: "{{who}}", age: 36, note: null, tags: ["x"] },
            assignResultTo: "row"
          }
        });

        assert.strictEqual(mock.seen.tables[0].kind, "insert");
        assert.strictEqual(mock.seen.tables[0].method, "POST");
        assert.deepStrictEqual(mock.seen.tables[0].body, {
          data: { name: "Ada", age: 36, note: null, tags: ["x"] },
          id_row: "row-Ada"
        });
        assert.deepStrictEqual(tdcache.attrs().row, { name: "Ada", age: 36 },
          'a row document is unwrapped to its data for insert/update/delete/upsert');
      } finally {
        await mock.close();
      }
    });

    it('insert with no data at all still sends an empty data object', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirDataTables);
        await run(dir, { name: "datatables", action: { tableId: "T1", operation: "insert" } });
        assert.deepStrictEqual(mock.seen.tables[0].body, { data: {} });
      } finally {
        await mock.close();
      }
    });

    it('update PUTs the mutation body with the conditions and the match mode', async () => {
      const mock = await startMock({ tables: (kind, req, res) => res.status(200).send([{ data: { n: 1 } }, { n: 2 }]) });
      try {
        const { dir, tdcache } = build(DirDataTables);
        await run(dir, {
          name: "datatables",
          action: {
            tableId: "T1", operation: "update", id_row: "r1", must_match: "any",
            conditions: [{ column: "n", operator: "eq", value: 1 }],
            data: { n: 5 }, assignResultTo: "rows"
          }
        });

        assert.strictEqual(mock.seen.tables[0].kind, "update");
        assert.strictEqual(mock.seen.tables[0].method, "PUT");
        assert.deepStrictEqual(mock.seen.tables[0].body, {
          data: { n: 5 }, id_row: "r1", must_match: "any",
          conditions: [{ column: "n", operator: "eq", value: "1" }]
        });
        assert.deepStrictEqual(tdcache.attrs().rows, [{ n: 1 }, { n: 2 }],
          'each row of an array result is unwrapped independently');
      } finally {
        await mock.close();
      }
    });

    it('upsert PUTs the mutation body plus the multi flag', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirDataTables);
        await run(dir, {
          name: "datatables",
          action: { tableId: "T1", operation: "upsert", data: { n: 1 }, multi: false }
        });

        assert.strictEqual(mock.seen.tables[0].kind, "upsert");
        assert.deepStrictEqual(mock.seen.tables[0].body, { data: { n: 1 }, multi: false });
      } finally {
        await mock.close();
      }
    });

    it('delete PUTs only the selectors, never a data object', async () => {
      const mock = await startMock({});
      try {
        const { dir } = build(DirDataTables);
        await run(dir, {
          name: "datatables",
          action: {
            tableId: "T1", operation: "delete", id_row: "r1", must_match: "all",
            conditions: [{ column: "n", operator: "eq", value: 2 }],
            data: { should: "be ignored" }
          }
        });

        assert.strictEqual(mock.seen.tables[0].kind, "delete");
        assert.deepStrictEqual(mock.seen.tables[0].body, {
          id_row: "r1", must_match: "all", conditions: [{ column: "n", operator: "eq", value: "2" }]
        });
      } finally {
        await mock.close();
      }
    });

    it('a table endpoint that answers with a message surfaces that message on the error attribute', async () => {
      const mock = await startMock({ tables: (kind, req, res) => res.status(422).send({ message: "column 'age' is unknown" }) });
      try {
        const { dir, tdcache } = build(DirDataTables);
        const stops = await run(dir, {
          name: "datatables",
          action: { tableId: "T1", operation: "insert", data: { age: 1 }, assignErrorTo: "dt_error", falseIntent: "KO" }
        });

        assert.strictEqual(tdcache.attrs().dt_error, "column 'age' is unknown");
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

    it('a table endpoint that answers with an error field surfaces that instead', async () => {
      const mock = await startMock({ tables: (kind, req, res) => res.status(500).send({ error: "table locked" }) });
      try {
        const { dir, tdcache } = build(DirDataTables);
        await run(dir, {
          name: "datatables",
          action: { tableId: "T1", operation: "get", assignErrorTo: "dt_error" }
        });

        assert.strictEqual(tdcache.attrs().dt_error, "table locked");
      } finally {
        await mock.close();
      }
    });

    it('a table endpoint that answers with an unrecognised body serialises it', async () => {
      const mock = await startMock({ tables: (kind, req, res) => res.status(500).send({ code: 17 }) });
      try {
        const { dir, tdcache } = build(DirDataTables);
        const stops = await run(dir, {
          name: "datatables",
          action: { tableId: "T1", operation: "get", assignErrorTo: "dt_error" }
        });

        assert.strictEqual(tdcache.attrs().dt_error, '{"code":17}');
        assert.deepStrictEqual(stops, [undefined], 'with no false connector the flow carries on');
      } finally {
        await mock.close();
      }
    });

    it('a table endpoint that cannot be reached at all still reports a message', async () => {
      const { dir, tdcache } = build(DirDataTables, {
        context: { API_ENDPOINT: "http://127.0.0.1:10099" }
      });
      const mock = await startMock({});
      try {
        // The service resolves its url through config/endpoints, not through the
        // directive context, so point the whole lookup at a dead port instead.
        const was = process.env.API_ENDPOINT;
        process.env.API_ENDPOINT = "http://127.0.0.1:10099";
        try {
          await run(dir, {
            name: "datatables",
            action: { tableId: "T1", operation: "get", assignErrorTo: "dt_error" }
          });
        } finally {
          process.env.API_ENDPOINT = was;
        }

        assert.ok(typeof tdcache.attrs().dt_error === 'string' && tdcache.attrs().dt_error.length > 0,
          tdcache.attrs().dt_error);
      } finally {
        await mock.close();
      }
    });

    it('a get that returns nothing writes no result attribute at all', async () => {
      const mock = await startMock({ tables: (kind, req, res) => res.status(204).send() });
      try {
        const { dir, tdcache } = build(DirDataTables);
        const stops = await run(dir, {
          name: "datatables",
          action: { tableId: "T1", operation: "get", assignResultTo: "rows", assignErrorTo: "dt_error", falseIntent: "KO" }
        });

        // A 204 carries no body, so httpUtils treats it as a failure: the error
        // attribute is written and the false connector is taken.
        assert.ok('dt_error' in tdcache.attrs());
        assert.strictEqual('rows' in tdcache.attrs(), false);
        assert.deepStrictEqual(dispatched, ["/KO"]);
        assert.deepStrictEqual(stops, [true]);
      } finally {
        await mock.close();
      }
    });

  });

  // ------------------------------- the remaining assignment and transport paths

  describe('assignment and transport corner cases', function () {

    it('DirWebRequest: an assignment expression that will not compile is skipped, the others still run', async () => {
      const mock = await startMock({ echoBody: { name: "Ada" } });
      try {
        const { dir, tdcache } = build(DirWebRequest);
        const stops = await run(dir, {
          name: "webRequest",
          action: {
            url: MOCK + "/echo", method: "GET",
            assignments: { broken: "{{#each}}", good: "name" }
          }
        });

        assert.strictEqual(tdcache.attrs().good, "Ada", 'one bad expression must not lose the others');
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('DirWebRequest: a cache that refuses one write does not stop the rest', async () => {
      const mock = await startMock({ echoBody: { name: "Ada", town: "Rome" } });
      try {
        const { dir, tdcache } = build(DirWebRequest, {
          cache: {
            async hset(k, f, v) {
              if (f === "who") throw new Error("redis refused that key");
              (this.hashes[k] || (this.hashes[k] = {}))[f] = v;
            }
          }
        });
        const stops = await run(dir, {
          name: "webRequest",
          action: { url: MOCK + "/echo", method: "GET", assignments: { who: "name", where: "town" } }
        });

        assert.strictEqual('who' in tdcache.attrs(), false);
        assert.strictEqual(tdcache.attrs().where, "Rome", 'the write after the failed one still happens');
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        await mock.close();
      }
    });

    it('DirWebRequestV2: an https url that cannot be reached is reported, not thrown', async () => {
      const { dir, tdcache } = build(DirWebRequestV2);
      const stops = await run(dir, {
        name: "webRequestV2",
        action: {
          url: "https://127.0.0.1:10099/nothing", method: "GET",
          assignStatusTo: "status", assignErrorTo: "err", falseIntent: "KO"
        }
      });

      assert.ok(typeof tdcache.attrs().err === 'string' && tdcache.attrs().err.length > 0, tdcache.attrs().err);
      assert.deepStrictEqual(dispatched, ["/KO"]);
      assert.deepStrictEqual(stops, [true]);
    });

    it('DirDataTables: a rejection that is not an Error at all is still reported as text', async () => {
      const dataTablesService = require('../services/DataTablesService');
      const original = dataTablesService.listRows;
      dataTablesService.listRows = async () => { throw "the table service said no"; };
      try {
        const { dir, tdcache } = build(DirDataTables);
        const stops = await run(dir, {
          name: "datatables",
          action: { tableId: "T1", operation: "get", assignErrorTo: "dt_error" }
        }, 50);

        assert.strictEqual(tdcache.attrs().dt_error, "the table service said no");
        assert.deepStrictEqual(stops, [undefined]);
      } finally {
        dataTablesService.listRows = original;
      }
    });

  });

});
