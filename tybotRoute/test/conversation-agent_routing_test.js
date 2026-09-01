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
const bots_data = require('./conversation-agent_routing_bot.js').bots_data;
const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID";
const tilebotService = require('../services/TilebotService.js');

let SERVER_PORT = 10001;

/** See conversation-contact_update_test.js: never throw inside a mock handler. */
function finish(listener, done, assertions) {
  let error = null;
  try {
    assertions();
  } catch (e) {
    error = e;
  }
  listener.close(() => done(error));
}

function messageFor(text) {
  return {
    "payload": {
      "senderFullname": "guest#367e",
      "type": "text",
      "sender": "A-SENDER",
      "recipient": REQUEST_ID,
      "text": text,
      "id_project": PROJECT_ID,
      "metadata": "",
      "request": { "request_id": REQUEST_ID }
    },
    "token": "XXX"
  };
}

/** Splits the hidden "/start" info message from the visitor reply. */
function messagesRoute(server, onReply) {
  const hidden = [];
  server.post('/:projectId/requests/:requestId/messages', function (req, res) {
    res.send({ success: true });
    const message = req.body;
    if (message.attributes && message.attributes.commands) {
      onReply(message, hidden);
    } else {
      hidden.push(message);
    }
  });
}

const DEPARTMENTS = [
  { _id: "DEP-SALES", name: "Sales", hasBot: false, id_bot: null },
  { _id: "DEP-SUPPORT", name: "Support", hasBot: true, id_bot: "DEP-BOT-ID" }
];

describe('Conversation for the agent-routing directives', async () => {

  let app_listener;

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

  // ------------------------------------------------------------------ agent

  it('agent PUTs /{projectId}/requests/{requestId}/agent and lets the flow continue', (done) => {

    let listener;
    let seen = null;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/requests/:requestId/agent', function (req, res) {
      seen = {
        projectId: req.params.projectId,
        requestId: req.params.requestId,
        authorization: req.headers.authorization
      };
      res.status(200).send({ success: true });
    });

    messagesRoute(endpointServer, (reply) => {
      finish(listener, done, () => {
        assert.ok(seen, 'Expected a PUT on /{projectId}/requests/{requestId}/agent');
        assert.strictEqual(seen.projectId, PROJECT_ID);
        assert.strictEqual(seen.requestId, REQUEST_ID);
        assert.ok(seen.authorization, 'Expect an "Authorization" header');
        assert.strictEqual(reply.attributes.commands[1].message.text, "agent-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/to_agent'), BOT_ID, () => { });
    });
  });

  it('agent logs and continues when the handover call fails', (done) => {

    let listener;
    let calls = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/requests/:requestId/agent', function (req, res) {
      calls += 1;
      res.status(500).send({ success: false, msg: "boom" });
    });

    messagesRoute(endpointServer, (reply) => {
      finish(listener, done, () => {
        assert.strictEqual(calls, 1);
        assert.strictEqual(reply.attributes.commands[1].message.text, "agent-done",
          'A failed handover must not stall the conversation');
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/to_agent'), BOT_ID, () => { });
    });
  });

  // ------------------------------------------------------- move_to_unassigned

  it('move_to_unassigned PUTs an EMPTY participants list, which is what moves the request to unassigned', (done) => {

    let listener;
    let seen = null;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/requests/:requestId/participants', function (req, res) {
      seen = { requestId: req.params.requestId, body: req.body };
      res.status(200).send({ success: true });
    });

    messagesRoute(endpointServer, (reply) => {
      finish(listener, done, () => {
        assert.ok(seen, 'Expected a PUT on /{projectId}/requests/{requestId}/participants');
        assert.strictEqual(seen.requestId, REQUEST_ID);
        assert.deepStrictEqual(seen.body, [],
          'The participants list must be emptied - a non-empty body would not unassign');
        assert.strictEqual(reply.attributes.commands[1].message.text, "unassigned-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/to_unassigned'), BOT_ID, () => { });
    });
  });

  it('move_to_unassigned logs and continues when the participants call fails', (done) => {

    let listener;
    let calls = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/requests/:requestId/participants', function (req, res) {
      calls += 1;
      res.status(503).send({ success: false });
    });

    messagesRoute(endpointServer, (reply) => {
      finish(listener, done, () => {
        assert.strictEqual(calls, 1);
        assert.strictEqual(reply.attributes.commands[1].message.text, "unassigned-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/to_unassigned'), BOT_ID, () => { });
    });
  });

  // ------------------------------------------------------------------ close

  it('close PUTs /{projectId}/requests/{requestId}/close and lets the flow continue', (done) => {

    let listener;
    let seen = null;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/requests/:requestId/close', function (req, res) {
      seen = {
        requestId: req.params.requestId,
        authorization: req.headers.authorization,
        body: req.body
      };
      res.status(200).send({ success: true });
    });

    messagesRoute(endpointServer, (reply) => {
      finish(listener, done, () => {
        assert.ok(seen, 'Expected a PUT on /{projectId}/requests/{requestId}/close');
        assert.strictEqual(seen.requestId, REQUEST_ID);
        assert.ok(seen.authorization, 'Expect an "Authorization" header');
        assert.deepStrictEqual(seen.body, {}, 'The close call carries an empty body');
        assert.strictEqual(reply.attributes.commands[1].message.text, "close-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/close_conversation'), BOT_ID, () => { });
    });
  });

  // QUARANTINED -- asserts the CORRECT behaviour, currently red. See the report.
  //
  // TiledeskClient.closeRequest() (node_modules/@tiledesk/tiledesk-client/
  // index.js:934-939) BOTH rejects its promise and invokes the callback on a
  // non-2xx answer. DirClose.execute (directives/agents/DirClose.js:22) ignores
  // the returned promise, so a failing close produces an unhandled promise
  // rejection, which under Node's default --unhandled-rejections=throw kills
  // the process. The error branch it does have (DirClose.js:23-26) is therefore
  // unreachable in practice. Un-skip once the rejection is handled.
  it('close logs and continues when the close call fails', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/requests/:requestId/close', function (req, res) {
      res.status(500).send({ success: false });
    });

    messagesRoute(endpointServer, (reply) => {
      finish(listener, done, () => {
        assert.strictEqual(reply.attributes.commands[1].message.text, "close-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/close_conversation'), BOT_ID, () => { });
    });
  });

  // ------------------------------------------------------------- department

  it('department moves the request to the matching department and sends no hidden message when triggerBot is false', (done) => {

    let listener;
    let depBody = null;
    let listed = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/:projectId/departments/allstatus', function (req, res) {
      listed += 1;
      res.status(200).send(DEPARTMENTS);
    });
    endpointServer.put('/:projectId/requests/:requestId/departments', function (req, res) {
      depBody = req.body;
      res.status(200).send({ success: true });
    });

    messagesRoute(endpointServer, (reply, hidden) => {
      finish(listener, done, () => {
        assert.strictEqual(listed, 1, 'The department list must be fetched once');
        assert.deepStrictEqual(depBody, { departmentid: "DEP-SALES" },
          'The department is resolved by name to its _id');
        assert.strictEqual(hidden.length, 0, 'triggerBot false must send no hidden message');
        assert.strictEqual(reply.attributes.commands[1].message.text, "dep-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/to_department'), BOT_ID, () => { });
    });
  });

  it('department with triggerBot sends the hidden "/start" info message to the department bot', (done) => {

    let listener;
    let depBody = null;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/:projectId/departments/allstatus', function (req, res) {
      res.status(200).send(DEPARTMENTS);
    });
    endpointServer.put('/:projectId/requests/:requestId/departments', function (req, res) {
      depBody = req.body;
      res.status(200).send({ success: true });
    });

    messagesRoute(endpointServer, (reply, hidden) => {
      finish(listener, done, () => {
        assert.deepStrictEqual(depBody, { departmentid: "DEP-SUPPORT" });
        assert.strictEqual(hidden.length, 1, 'Exactly one hidden message must be sent');
        assert.deepStrictEqual(hidden[0], {
          type: "text",
          text: "/start",
          attributes: { subtype: "info" }
        });
        assert.strictEqual(reply.attributes.commands[1].message.text, "dep-trigger-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/to_department_trigger'), BOT_ID, () => { });
    });
  });

  it('department continues when the hidden "/start" message cannot be delivered', (done) => {

    let listener;
    let hiddenAttempts = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/:projectId/departments/allstatus', function (req, res) {
      res.status(200).send(DEPARTMENTS);
    });
    endpointServer.put('/:projectId/requests/:requestId/departments', function (req, res) {
      res.status(200).send({ success: true });
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      const message = req.body;
      if (message.attributes && message.attributes.commands) {
        res.send({ success: true });
        finish(listener, done, () => {
          assert.strictEqual(hiddenAttempts, 1);
          assert.strictEqual(message.attributes.commands[1].message.text, "dep-trigger-done",
            'A rejected hidden message must not stall the conversation');
        });
      } else {
        hiddenAttempts += 1;
        res.status(500).send({ success: false });
      }
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/to_department_trigger'), BOT_ID, () => { });
    });
  });

  it('department continues when the department list cannot be fetched', (done) => {

    let listener;
    let depCalls = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/:projectId/departments/allstatus', function (req, res) {
      res.status(500).send({ success: false });
    });
    endpointServer.put('/:projectId/requests/:requestId/departments', function (req, res) {
      depCalls += 1;
      res.status(200).send({ success: true });
    });

    messagesRoute(endpointServer, (reply) => {
      finish(listener, done, () => {
        assert.strictEqual(depCalls, 0, 'No request may be re-routed when the list is unavailable');
        assert.strictEqual(reply.attributes.commands[1].message.text, "dep-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/to_department'), BOT_ID, () => { });
    });
  });

  it('department continues when the re-routing call itself fails', (done) => {

    let listener;
    let depCalls = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/:projectId/departments/allstatus', function (req, res) {
      res.status(200).send(DEPARTMENTS);
    });
    endpointServer.put('/:projectId/requests/:requestId/departments', function (req, res) {
      depCalls += 1;
      res.status(500).send({ success: false });
    });

    messagesRoute(endpointServer, (reply) => {
      finish(listener, done, () => {
        assert.strictEqual(depCalls, 1);
        assert.strictEqual(reply.attributes.commands[1].message.text, "dep-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/to_department'), BOT_ID, () => { });
    });
  });

  // QUARANTINED -- asserts the CORRECT behaviour, currently red. See the report.
  //
  // DirDepartment.moveToDepartment (directives/agents/DirDepartment.js:129-140)
  // has an `if (dep)` with NO else: when no department carries the configured
  // name, nothing calls back, `go()` never resolves and the conversation stalls
  // silently - no reply, no log, no error. The directive even has a
  // "Department not found" warning at :63-68 which can therefore never fire.
  it('department continues when no department carries the configured name', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/:projectId/departments/allstatus', function (req, res) {
      res.status(200).send([{ _id: "DEP-OTHER", name: "Marketing" }]);
    });

    messagesRoute(endpointServer, (reply) => {
      finish(listener, done, () => {
        assert.strictEqual(reply.attributes.commands[1].message.text, "dep-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/to_department'), BOT_ID, () => { });
    });
  });

  // QUARANTINED -- asserts the CORRECT behaviour, currently red. See the report.
  //
  // DirDepartment.go (directives/agents/DirDepartment.js:80-102): with
  // triggerBot true, the callback is only reached inside
  // `if (dep && dep.hasBot === true && dep.id_bot)`. Routing to a department
  // that has no bot therefore stalls the conversation in exactly the same way.
  it('department with triggerBot continues when the target department has no bot', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/:projectId/departments/allstatus', function (req, res) {
      res.status(200).send([{ _id: "DEP-SUPPORT", name: "Support", hasBot: false, id_bot: null }]);
    });
    endpointServer.put('/:projectId/requests/:requestId/departments', function (req, res) {
      res.status(200).send({ success: true });
    });

    messagesRoute(endpointServer, (reply) => {
      finish(listener, done, () => {
        assert.strictEqual(reply.attributes.commands[1].message.text, "dep-trigger-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/to_department_trigger'), BOT_ID, () => { });
    });
  });

});
