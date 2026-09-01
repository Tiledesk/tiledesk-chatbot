var assert = require('assert');
const tybot = require("../index.js");
const tybotRoute = tybot.router;
var express = require('express');
var app = express();
const winston = require('../utils/winston');
app.use("/", tybotRoute);
app.use((err, req, res, next) => {
  winston.error("General error", err);
});
require('dotenv').config();
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const bots_data = require('./conversation-online_agents_bot.js').bots_data;
const PROJECT_ID = "projectID";
const BOT_ID = "botID";
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil.js');
const tilebotService = require('../services/TilebotService.js');

let SERVER_PORT = 10001;

/** A fresh conversation per test: flow attributes (department_id, flowError)
 *  must not leak from one condition to the next. */
function newRequestId() {
  return "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
}

function messageFor(requestId, text) {
  return {
    "payload": {
      "senderFullname": "guest#367e",
      "type": "text",
      "sender": "A-SENDER",
      "recipient": requestId,
      "text": text,
      "id_project": PROJECT_ID,
      "metadata": "",
      "request": { "request_id": requestId }
    },
    "token": "XXX"
  };
}

/**
 * Collects every reply the bot sends and settles 250ms after the first one, so
 * a test can assert not only WHICH branch replied but that nothing else did --
 * that is how stopOnConditionMet is verified.
 */
function repliesRoute(server, onSettled) {
  const replies = [];
  let timer = null;
  server.post('/:projectId/requests/:requestId/messages', function (req, res) {
    res.send({ success: true });
    replies.push(req.body);
    if (timer === null) {
      timer = setTimeout(() => onSettled(replies), 250);
    }
  });
}

function textOf(reply) {
  return reply.attributes.commands[1].message.text;
}

/** Close the mock and end the test, turning an assertion failure into a test
 *  failure instead of an uncaught throw. */
function finish(listener, done, assertions) {
  let error = null;
  try {
    assertions();
  } catch (e) {
    error = e;
  }
  listener.close(() => done(error));
}

describe('Conversation for the online-agents / operating-hours conditions', async () => {

  let app_listener;
  let util = new TiledeskChatbotUtil();

  before(() => {
    return new Promise(async (resolve, reject) => {
      winston.info("Starting tilebot server...");
      try {
        tybot.startApp(
          {
            bots: bots_data,
            TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT,
            API_ENDPOINT: process.env.API_ENDPOINT,
            REDIS_HOST: process.env.REDIS_HOST,
            REDIS_PORT: process.env.REDIS_PORT,
            REDIS_PASSWORD: process.env.REDIS_PASSWORD
          }, () => {
            winston.info("Tilebot route successfully started.");
            var port = SERVER_PORT;
            app_listener = app.listen(port, () => {
              winston.info('Tilebot connector listening on port ', port);
              resolve();
            });
          });
      }
      catch (error) {
        winston.error("Unable to start Tilebot server", error);
        reject(error);
      }
    })
  });

  after(function (done) {
    app_listener.close(() => {
      done();
    });
  });

  // ==================================================== ifonlineagentsv2

  it('v2 with ignoreOperatingHours skips the isopen call, asks project-wide and takes the true branch', (done) => {

    const requestId = newRequestId();
    let listener;
    let isopenCalls = 0;
    let availablesQuery = null;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/isopen', function (req, res) {
      isopenCalls += 1;
      res.status(200).send({ isopen: true });
    });
    endpointServer.get('/projects/:projectId/users/availables', function (req, res) {
      availablesQuery = req.query;
      res.status(200).send([{ id_user: "AGENT-1" }]);
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.strictEqual(isopenCalls, 0,
          'ignoreOperatingHours must skip the project operating-hours check entirely');
        assert.strictEqual(availablesQuery.raw, 'true');
        assert.strictEqual(availablesQuery.department, undefined,
          'The default option is project-wide: no department filter');
        assert.deepStrictEqual(replies.map(textOf), ["online-branch"],
          'The true branch runs and stopOnConditionMet stops the trailing action');
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v2_ignore_hours'), BOT_ID, () => { });
    });
  });

  it('v2 without ignoreOperatingHours consults isopen and takes the false branch when closed', (done) => {

    const requestId = newRequestId();
    let listener;
    let availablesCalls = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/isopen', function (req, res) {
      res.status(200).send({ isopen: false });
    });
    endpointServer.get('/projects/:projectId/users/availables', function (req, res) {
      availablesCalls += 1;
      res.status(200).send([{ id_user: "AGENT-1" }]);
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.strictEqual(availablesCalls, 0,
          'Outside operating hours the agents are never asked for');
        // NOT deepStrictEqual on purpose: this branch also lets the trailing
        // action run (see the skipped test below), which is a defect, not a
        // behaviour worth pinning.
        assert.ok(replies.map(textOf).includes("offline-branch"),
          'Expected the false branch to run, got: ' + JSON.stringify(replies.map(textOf)));
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v2_with_hours'), BOT_ID, () => { });
    });
  });

  // QUARANTINED -- asserts the CORRECT behaviour, currently red. See the report.
  //
  // DirIfOnlineAgentsV2.go (directives/agents/DirIfOnlineAgentsV2.js:136-143):
  // the "outside operating hours" branch calls `callback()` where every other
  // branch in the same method calls `callback(stopOnConditionMet)` -- and
  // stopOnConditionMet is hardcoded `true` at :54. The block therefore runs its
  // false branch AND the actions that follow it, so the visitor gets two
  // replies, the fall-through one first. Observed: ["v2-fallthrough",
  // "offline-branch"].
  it('v2 outside operating hours runs the false branch and nothing else', (done) => {

    const requestId = newRequestId();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/isopen', function (req, res) {
      res.status(200).send({ isopen: false });
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.deepStrictEqual(replies.map(textOf), ["offline-branch"]);
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v2_with_hours'), BOT_ID, () => { });
    });
  });

  it('v2 takes the false branch when the project is open but no agent is available', (done) => {

    const requestId = newRequestId();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/isopen', function (req, res) {
      res.status(200).send({ isopen: true });
    });
    endpointServer.get('/projects/:projectId/users/availables', function (req, res) {
      res.status(200).send({ empty: true });   // a 2xx body that is not a list of agents
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.deepStrictEqual(replies.map(textOf), ["offline-branch"]);
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v2_with_hours'), BOT_ID, () => { });
    });
  });

  it('v2 with selectedDep filters the agents by the configured department', (done) => {

    const requestId = newRequestId();
    let listener;
    let availablesQuery = null;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/users/availables', function (req, res) {
      availablesQuery = req.query;
      res.status(200).send([{ id_user: "AGENT-1" }]);
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.strictEqual(availablesQuery.department, "DEP-42");
        assert.strictEqual(availablesQuery.raw, 'true');
        assert.deepStrictEqual(replies.map(textOf), ["online-branch"]);
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v2_selected_dep'), BOT_ID, () => { });
    });
  });

  it('v2 with currentDep filters the agents by the department_id in the flow attributes', (done) => {

    const requestId = newRequestId();
    let listener;
    let availablesQuery = null;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/users/availables', function (req, res) {
      availablesQuery = req.query;
      res.status(200).send([{ id_user: "AGENT-1" }]);
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.strictEqual(availablesQuery.department, "DEP-CURRENT");
        assert.deepStrictEqual(replies.map(textOf), ["online-branch"]);
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(
        messageFor(requestId, '/v2_current_dep{"department_id":"DEP-CURRENT"}'), BOT_ID, () => { });
    });
  });

  it('v2 with currentDep and no department_id reports a flowError and takes the false branch', (done) => {

    const requestId = newRequestId();
    let listener;
    let availablesCalls = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/users/availables', function (req, res) {
      availablesCalls += 1;
      res.status(200).send([{ id_user: "AGENT-1" }]);
    });

    repliesRoute(endpointServer, (replies) => {
      util.getChatbotParameters(requestId, (err, attributes) => {
        finish(listener, done, () => {
          assert.strictEqual(availablesCalls, 0, 'With no department there is nothing to ask for');
          assert.strictEqual(attributes.flowError,
            "(If online Agents) No departmentId found in attributes.");
          assert.deepStrictEqual(replies.map(textOf), ["offline-branch"]);
        });
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v2_current_dep'), BOT_ID, () => { });
    });
  });

  it('v2 with neither intent configured does nothing and lets the flow continue', (done) => {

    const requestId = newRequestId();
    let listener;
    let availablesCalls = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/users/availables', function (req, res) {
      availablesCalls += 1;
      res.status(200).send([{ id_user: "AGENT-1" }]);
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.strictEqual(availablesCalls, 0,
          'A condition with no branches must not call the API at all');
        assert.deepStrictEqual(replies.map(textOf), ["v2-no-intents-done"]);
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v2_no_intents'), BOT_ID, () => { });
    });
  });

  it('v2 with agents available but no true branch reports a flowError and falls through', (done) => {

    const requestId = newRequestId();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/users/availables', function (req, res) {
      res.status(200).send([{ id_user: "AGENT-1" }]);
    });

    repliesRoute(endpointServer, (replies) => {
      util.getChatbotParameters(requestId, (err, attributes) => {
        finish(listener, done, () => {
          assert.strictEqual(attributes.flowError,
            "(If online Agents) No IfOnlineAgents success path defined.");
          assert.deepStrictEqual(replies.map(textOf), ["v2-no-true-done"],
            'Without a true branch the directive does not stop the flow');
        });
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v2_no_true_intent'), BOT_ID, () => { });
    });
  });

  it('v2 reports a flowError and falls through when the availables call fails', (done) => {

    const requestId = newRequestId();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/users/availables', function (req, res) {
      res.status(500).send({ success: false, msg: "boom" });
    });

    repliesRoute(endpointServer, (replies) => {
      util.getChatbotParameters(requestId, (err, attributes) => {
        finish(listener, done, () => {
          assert.ok(
            typeof attributes.flowError === 'string' &&
            attributes.flowError.startsWith("(If online Agents) An error occurred:"),
            'Expected the catch-all flowError, got: ' + attributes.flowError
          );
          assert.deepStrictEqual(replies.map(textOf), ["v2-fallthrough"],
            'A failed availables call must not stall the conversation');
        });
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v2_ignore_hours'), BOT_ID, () => { });
    });
  });

  // QUARANTINED -- asserts the CORRECT behaviour, currently red. See the report.
  //
  // DirIfOnlineAgentsV2.go (directives/agents/DirIfOnlineAgentsV2.js:132) logs
  // `winston.error("... No falseIntent defined", intentDirective)` in the branch
  // where NO agents are available and no falseIntent is configured. There is no
  // `intentDirective` in that scope -- the two `let intentDirective` declarations
  // are block-scoped to the sibling branches at :111 and :125 -- so the line
  // throws ReferenceError. The surrounding try/catch swallows it, and the
  // flowError the user sees is the generic
  //   "(If online Agents) An error occurred: ReferenceError: intentDirective is not defined"
  // instead of the intended message asserted below. Same defect family as the
  // DirAiCondition ReferenceErrors fixed earlier (see test/quarantine/README.md).
  it('v2 with no agents and no false branch reports the "no path" flowError', (done) => {

    const requestId = newRequestId();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/users/availables', function (req, res) {
      res.status(200).send({ empty: true });
    });

    repliesRoute(endpointServer, (replies) => {
      util.getChatbotParameters(requestId, (err, attributes) => {
        finish(listener, done, () => {
          assert.strictEqual(attributes.flowError,
            "(If online Agents) No path for 'no available agents' defined.");
          assert.deepStrictEqual(replies.map(textOf), ["v2-no-false-done"]);
        });
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v2_no_false_intent'), BOT_ID, () => { });
    });
  });

  it('v2 with currentDep, no department_id and no false branch just falls through', (done) => {

    const requestId = newRequestId();
    let listener;
    let availablesCalls = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/users/availables', function (req, res) {
      availablesCalls += 1;
      res.status(200).send([{ id_user: "AGENT-1" }]);
    });

    repliesRoute(endpointServer, (replies) => {
      util.getChatbotParameters(requestId, (err, attributes) => {
        finish(listener, done, () => {
          assert.strictEqual(availablesCalls, 0);
          assert.strictEqual(attributes.flowError,
            "(If online Agents) No departmentId found in attributes.");
          assert.deepStrictEqual(replies.map(textOf), ["v2-currentdep-true-only-done"]);
        });
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v2_current_dep_true_only'), BOT_ID, () => { });
    });
  });

  it('v2 outside operating hours with no false branch falls through', (done) => {

    const requestId = newRequestId();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/isopen', function (req, res) {
      res.status(200).send({ isopen: false });
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.deepStrictEqual(replies.map(textOf), ["v2-closed-true-only-done"]);
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v2_closed_true_only'), BOT_ID, () => { });
    });
  });

  it('v2 reports a flowError and falls through when the operating-hours call fails', (done) => {

    const requestId = newRequestId();
    let listener;
    let availablesCalls = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/isopen', function (req, res) {
      res.status(500).send({ success: false });
    });
    endpointServer.get('/projects/:projectId/users/availables', function (req, res) {
      availablesCalls += 1;
      res.status(200).send([{ id_user: "AGENT-1" }]);
    });

    repliesRoute(endpointServer, (replies) => {
      util.getChatbotParameters(requestId, (err, attributes) => {
        finish(listener, done, () => {
          assert.strictEqual(availablesCalls, 0);
          assert.ok(
            typeof attributes.flowError === 'string' &&
            attributes.flowError.startsWith("(If online Agents) An error occurred:"),
            'openNow() rejects and must surface as the catch-all flowError, got: ' + attributes.flowError
          );
          assert.deepStrictEqual(replies.map(textOf), ["v2-fallthrough"]);
        });
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v2_with_hours'), BOT_ID, () => { });
    });
  });

  // ====================================================== ifonlineagents (v1)

  it('v1 takes the true branch when the project is open and an agent is available', (done) => {

    const requestId = newRequestId();
    let listener;
    let availablesCalls = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/isopen', function (req, res) {
      res.status(200).send({ isopen: true });
    });
    endpointServer.get('/projects/:projectId/users/availables', function (req, res) {
      availablesCalls += 1;
      res.status(200).send([{ id_user: "AGENT-1" }]);
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.strictEqual(availablesCalls, 1);
        assert.deepStrictEqual(replies.map(textOf), ["online-branch"]);
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v1_agents'), BOT_ID, () => { });
    });
  });

  it('v1 takes the false branch when the project is open but no agent is available', (done) => {

    const requestId = newRequestId();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/isopen', function (req, res) {
      res.status(200).send({ isopen: true });
    });
    endpointServer.get('/projects/:projectId/users/availables', function (req, res) {
      res.status(200).send({ length: 0 });   // a 2xx body with no agents in it
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.deepStrictEqual(replies.map(textOf), ["offline-branch"]);
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v1_agents'), BOT_ID, () => { });
    });
  });

  it('v1 takes the false branch when the project is closed, without asking for agents', (done) => {

    const requestId = newRequestId();
    let listener;
    let availablesCalls = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/isopen', function (req, res) {
      res.status(200).send({ isopen: false });
    });
    endpointServer.get('/projects/:projectId/users/availables', function (req, res) {
      availablesCalls += 1;
      res.status(200).send([{ id_user: "AGENT-1" }]);
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.strictEqual(availablesCalls, 0);
        // NOT deepStrictEqual: same defect as the v2 closed branch, see below.
        assert.ok(replies.map(textOf).includes("offline-branch"),
          'Expected the false branch to run, got: ' + JSON.stringify(replies.map(textOf)));
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v1_agents'), BOT_ID, () => { });
    });
  });

  // QUARANTINED -- asserts the CORRECT behaviour, currently red. See the report.
  //
  // DirIfOnlineAgents.go (directives/agents/DirIfOnlineAgents.js:97-103): the
  // "project closed" branch calls `callback()` while the three sibling branches
  // call `callback(stopOnConditionMet)`. With stopOnConditionMet true in the
  // action, the block runs its false branch AND the actions after it. Observed:
  // ["v1-fallthrough", "offline-branch"]. Identical to the V2 defect.
  it('v1 with the project closed runs the false branch and nothing else', (done) => {

    const requestId = newRequestId();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/isopen', function (req, res) {
      res.status(200).send({ isopen: false });
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.deepStrictEqual(replies.map(textOf), ["offline-branch"]);
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v1_agents'), BOT_ID, () => { });
    });
  });

  it('v1 falls through when the operating-hours call fails', (done) => {

    const requestId = newRequestId();
    let listener;
    let availablesCalls = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/isopen', function (req, res) {
      res.status(500).send({ success: false });
    });
    endpointServer.get('/projects/:projectId/users/availables', function (req, res) {
      availablesCalls += 1;
      res.status(200).send([{ id_user: "AGENT-1" }]);
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.strictEqual(availablesCalls, 0);
        assert.deepStrictEqual(replies.map(textOf), ["v1-fallthrough"]);
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v1_agents'), BOT_ID, () => { });
    });
  });

  it('v1 with neither intent configured never calls the API and falls through', (done) => {

    const requestId = newRequestId();
    let listener;
    let apiCalls = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/isopen', function (req, res) {
      apiCalls += 1;
      res.status(200).send({ isopen: true });
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.strictEqual(apiCalls, 0);
        assert.deepStrictEqual(replies.map(textOf), ["v1-no-intents-done"]);
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v1_no_intents'), BOT_ID, () => { });
    });
  });

  it('v1 configured with only a true branch falls through when the project is closed', (done) => {

    const requestId = newRequestId();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/isopen', function (req, res) {
      res.status(200).send({ isopen: false });
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.deepStrictEqual(replies.map(textOf), ["v1-true-only-done"]);
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v1_true_only'), BOT_ID, () => { });
    });
  });

  it('v1 configured with only a true branch falls through when no agent is available', (done) => {

    const requestId = newRequestId();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/isopen', function (req, res) {
      res.status(200).send({ isopen: true });
    });
    endpointServer.get('/projects/:projectId/users/availables', function (req, res) {
      res.status(200).send({ length: 0 });
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.deepStrictEqual(replies.map(textOf), ["v1-true-only-done"]);
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v1_true_only'), BOT_ID, () => { });
    });
  });

  it('v1 configured with only a false branch falls through when agents ARE available', (done) => {

    const requestId = newRequestId();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/isopen', function (req, res) {
      res.status(200).send({ isopen: true });
    });
    endpointServer.get('/projects/:projectId/users/availables', function (req, res) {
      res.status(200).send([{ id_user: "AGENT-1" }]);
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.deepStrictEqual(replies.map(textOf), ["v1-false-only-done"]);
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/v1_false_only'), BOT_ID, () => { });
    });
  });

  // ============================================================= ifopenhours

  it('ifopenhours with neither intent configured never calls isopen and falls through', (done) => {

    const requestId = newRequestId();
    let listener;
    let isopenCalls = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/isopen', function (req, res) {
      isopenCalls += 1;
      res.status(200).send({ isopen: true });
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.strictEqual(isopenCalls, 0);
        assert.deepStrictEqual(replies.map(textOf), ["oh-no-intents-done"]);
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/oh_no_intents'), BOT_ID, () => { });
    });
  });

  it('ifopenhours takes the false branch when the isopen call fails', (done) => {

    const requestId = newRequestId();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/isopen', function (req, res) {
      res.status(500).send({ success: false });
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.deepStrictEqual(replies.map(textOf), ["offline-branch"],
          'An unreachable operating-hours API is treated as closed');
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/oh_error'), BOT_ID, () => { });
    });
  });

  // QUARANTINED -- asserts the CORRECT behaviour, currently red. See the report.
  //
  // DirIfOpenHours.go (directives/agents/DirIfOpenHours.js:77-85): on an error
  // from the isopen call the callback is only reached inside
  // `if (falseIntent)`. A block configured with only a true branch therefore
  // never calls back and the conversation stalls silently when the
  // operating-hours API is down - no reply, no log, no error.
  it('ifopenhours with only a true branch falls through when the isopen call fails', (done) => {

    const requestId = newRequestId();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/projects/:projectId/isopen', function (req, res) {
      res.status(500).send({ success: false });
    });

    repliesRoute(endpointServer, (replies) => {
      finish(listener, done, () => {
        assert.deepStrictEqual(replies.map(textOf), ["oh-true-only-done"]);
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor(requestId, '/oh_error_true_only'), BOT_ID, () => { });
    });
  });

});
