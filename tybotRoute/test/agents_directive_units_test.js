var assert = require('assert');
var express = require('express');
const bodyParser = require('body-parser');
const { DirClose } = require('../directives/agents/DirClose');
const { DirDepartment } = require('../directives/agents/DirDepartment');
const { DirIfOnlineAgents } = require('../directives/agents/DirIfOnlineAgents');
const { DirIfOnlineAgentsV2 } = require('../directives/agents/DirIfOnlineAgentsV2');
const { DirIfOpenHours } = require('../directives/agents/DirIfOpenHours');
const { DirMoveToAgent } = require('../directives/agents/DirMoveToAgent');

// The directives/agents branches a designer flow cannot reach:
//
//  * the guard clauses -- Directives.actionToDirective() always sets `action`,
//    so no flow ever produces a directive without one;
//  * DirDepartment's `directive.parameter` form, same reason;
//  * DirMoveToAgent's published-run analytics branch, which reads
//    `chatbot.bot.root_id`: the test harness's MockBotsDataSource rebuilds the
//    bot from four fields and drops root_id;
//  * two error shapes the HTTP layer cannot produce -- an available-agents
//    callback carrying an error without a rejected promise, and an openNow()
//    result that is neither open nor closed. Both are driven through an
//    injected tdClient, which is also the only way to reach them without
//    tripping the unhandled rejection documented in the report.

const API_ENDPOINT = process.env.API_ENDPOINT || 'http://localhost:10002';
const PROJECT_ID = "projectID";
const REQUEST_ID = "A-REQUEST-ID";
const MOCK_PORT = 10002;

function contextFor(overrides) {
  return Object.assign({
    projectId: PROJECT_ID,
    token: "XXX",
    API_ENDPOINT: API_ENDPOINT,
    requestId: REQUEST_ID,
    supportRequest: { id_project: PROJECT_ID, request_id: REQUEST_ID, bot_id: "botID" }
  }, overrides);
}

function startMock(routes) {
  return new Promise((resolve) => {
    const seen = { calls: [] };
    const server = express();
    server.use(bodyParser.json());
    routes(server, seen);
    const listener = server.listen(MOCK_PORT, '0.0.0.0', () => {
      resolve({ seen: seen, close: () => new Promise((r) => listener.close(() => r())) });
    });
  });
}

/** Runs a directive, resolving with every `stop` value the callback received. */
function run(dir, directive) {
  return new Promise((resolve) => {
    const stops = [];
    dir.execute(directive, (stop) => {
      stops.push(stop);
      if (stops.length === 1) setTimeout(() => resolve(stops), 150);
    });
  });
}

describe('Directives directives/agents, paths a flow cannot reach', function () {

  it('DirClose logs and calls back when the close call reports an error', async () => {
    let deleted = [];
    const dir = new DirClose(contextFor({
      chatbot: { deleteParameter: async (name) => { deleted.push(name); } }
    }));
    let closedRequestId = null;
    // Injected so the error arrives through the callback alone. The real client
    // ALSO rejects its promise here, which DirClose does not handle - see the
    // quarantined test in conversation-agent_routing_test.js.
    dir.tdClient = {
      closeRequest: (requestId, cb) => { closedRequestId = requestId; cb(new Error("close failed")); }
    };

    const stops = await run(dir, { name: "close" });

    assert.strictEqual(closedRequestId, REQUEST_ID);
    assert.deepStrictEqual(deleted, [],
      'A failed close must NOT clear the pending user input');
    assert.deepStrictEqual(stops, [undefined], 'The flow carries on after a failed close');
  });

  it('DirClose clears the pending user input when the close succeeds', async () => {
    let deleted = [];
    const dir = new DirClose(contextFor({
      chatbot: { deleteParameter: async (name) => { deleted.push(name); } }
    }));
    dir.tdClient = { closeRequest: (requestId, cb) => cb(null, { success: true }) };

    const stops = await run(dir, { name: "close" });

    assert.deepStrictEqual(deleted, ["_userInput"],
      'A closed request must not leave a pending user input behind');
    assert.deepStrictEqual(stops, [undefined]);
  });

  it('DirMoveToAgent on a published bot still PUTs the handover and calls back once', async () => {
    const mock = await startMock((server, seen) => {
      server.put('/:projectId/requests/:requestId/agent', (req, res) => {
        seen.calls.push('agent:' + req.params.requestId);
        res.status(200).send({ success: true });
      });
    });
    try {
      const dir = new DirMoveToAgent(contextFor({
        chatbot: { bot: { root_id: "ROOT-1" } },
        departmentId: "DEP-7",
        reply: { attributes: { intent_info: { intent_name: "handover" } } }
      }));
      const stops = await run(dir, { name: "agent" });

      assert.deepStrictEqual(mock.seen.calls, ['agent:' + REQUEST_ID]);
      assert.deepStrictEqual(stops, [undefined]);
    } finally {
      await mock.close();
    }
  });

  it('DirDepartment takes the department name from a directive parameter, trimmed', async () => {
    let depBody = null;
    const mock = await startMock((server, seen) => {
      server.get('/:projectId/departments/allstatus', (req, res) => {
        seen.calls.push('list');
        res.status(200).send([{ _id: "DEP-A", name: "Sales" }]);
      });
      server.put('/:projectId/requests/:requestId/departments', (req, res) => {
        seen.calls.push('route');
        depBody = req.body;
        res.status(200).send({ success: true });
      });
    });
    try {
      const dir = new DirDepartment(contextFor({}));
      const stops = await run(dir, { name: "department", parameter: "   Sales   " });

      assert.deepStrictEqual(mock.seen.calls, ['list', 'route']);
      assert.deepStrictEqual(depBody, { departmentid: "DEP-A" },
        'An untrimmed parameter would not match the department name');
      assert.deepStrictEqual(stops, [undefined]);
    } finally {
      await mock.close();
    }
  });

  it('DirDepartment falls back to "default department" with neither action nor parameter', async () => {
    let depBody = null;
    const mock = await startMock((server) => {
      server.get('/:projectId/departments/allstatus', (req, res) => {
        res.status(200).send([
          { _id: "DEP-A", name: "Sales" },
          { _id: "DEP-DEFAULT", name: "Default Department" }
        ]);
      });
      server.put('/:projectId/requests/:requestId/departments', (req, res) => {
        depBody = req.body;
        res.status(200).send({ success: true });
      });
    });
    try {
      const dir = new DirDepartment(contextFor({}));
      const stops = await run(dir, { name: "department" });

      // The fallback name is matched case-insensitively against the department list.
      assert.deepStrictEqual(depBody, { departmentid: "DEP-DEFAULT" });
      assert.deepStrictEqual(stops, [undefined]);
    } finally {
      await mock.close();
    }
  });

  it('DirIfOnlineAgents calls back once when the available-agents lookup errors', async () => {
    const dir = new DirIfOnlineAgents(contextFor({}));
    let askedForAgents = 0;
    dir.tdClient = {
      openNow: (cb) => cb(null, { isopen: true }),
      getProjectAvailableAgents: (cb) => { askedForAgents += 1; cb(new Error("agents down")); }
    };

    const stops = await run(dir, {
      name: "ifonlineagents",
      action: { trueIntent: "#ONLINE", falseIntent: "#OFFLINE" }
    });

    assert.strictEqual(askedForAgents, 1);
    assert.deepStrictEqual(stops, [undefined],
      'Neither branch may run, and the flow must not be stopped');
  });

  it('DirIfOnlineAgents calls back once on an operating-hours result it cannot interpret', async () => {
    const dir = new DirIfOnlineAgents(contextFor({}));
    let askedForAgents = 0;
    dir.tdClient = {
      openNow: (cb) => cb(null, null),          // neither open nor closed
      getProjectAvailableAgents: (cb) => { askedForAgents += 1; cb(null, [{}]); }
    };

    const stops = await run(dir, {
      name: "ifonlineagents",
      action: { trueIntent: "#ONLINE", falseIntent: "#OFFLINE" }
    });

    assert.strictEqual(askedForAgents, 0, 'An uninterpretable result must not fall through to the agents');
    assert.deepStrictEqual(stops, [undefined]);
  });

  it('DirIfOnlineAgents calls back once on a directive with no action', async () => {
    const dir = new DirIfOnlineAgents(contextFor({}));
    dir.tdClient = { openNow: () => assert.fail('openNow must not be called') };
    const stops = await run(dir, { name: "ifonlineagents" });
    assert.deepStrictEqual(stops, [undefined]);
  });

  it('DirIfOnlineAgentsV2 calls back once on a directive with no action', async () => {
    const dir = new DirIfOnlineAgentsV2(contextFor({ chatbot: {} }));
    const stops = await run(dir, { name: "ifonlineagentsv2" });
    assert.deepStrictEqual(stops, [undefined]);
  });

  it('DirIfOpenHours calls back once on a directive with no action', async () => {
    const dir = new DirIfOpenHours(contextFor({}));
    const stops = await run(dir, { name: "ifopenhours" });
    assert.deepStrictEqual(stops, [undefined]);
  });

});
