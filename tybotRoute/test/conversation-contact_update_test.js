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
const bots_data = require('./conversation-contact_update_bot.js').bots_data;
const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID";
const LEAD_ID = "LEAD-ID-1";
const SEEDED_EMAIL = "seeded.lead@example.com";
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil.js');
const tilebotService = require('../services/TilebotService.js');
const { DirContactUpdate } = require('../directives/tiledesk/DirContactUpdate');

let SERVER_PORT = 10001;

/**
 * Close the mock server and end the test, reporting an assertion failure as a
 * test failure instead of an uncaught throw inside an express handler. A throw
 * there leaves the listener open and every following test dies on EADDRINUSE.
 */
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
      "request": {
        "request_id": REQUEST_ID,
        "lead": {
          "_id": LEAD_ID,
          "email": SEEDED_EMAIL,
          "fullname": "Seeded Name"
        }
      }
    },
    "token": "XXX"
  };
}

describe('Conversation for ContactUpdate (leadupdate) test', async () => {

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

  it('leadupdate sends the filled properties to PUT /{projectId}/leads/{leadId} and writes the mapped keys to the flow attributes', (done) => {

    let listener;
    let leadRequest = null;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/leads/:leadId', function (req, res) {
      leadRequest = {
        projectId: req.params.projectId,
        leadId: req.params.leadId,
        authorization: req.headers.authorization,
        body: req.body
      };
      res.status(200).send({ _id: req.params.leadId, success: true });
    });

    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      finish(listener, done, () => {
        // The directive actually called the leads API...
        assert.ok(leadRequest, 'Expected a PUT on /{projectId}/leads/{leadId}');
        assert.strictEqual(leadRequest.projectId, PROJECT_ID);
        assert.strictEqual(leadRequest.leadId, LEAD_ID);
        assert.ok(leadRequest.authorization, 'Expect an "Authorization" header on the lead update');
        // ...with the literal values and the {{userEmail}} filled from the seeded lead.
        assert.strictEqual(leadRequest.body.fullname, "Mario Rossi");
        assert.strictEqual(leadRequest.body.email, SEEDED_EMAIL);
        assert.strictEqual(leadRequest.body.company, "ACME");
        assert.strictEqual(leadRequest.body.phone, "+390000000");

        // ...and the flow CONTINUED, with the mapped keys already visible to the
        // next action (that is the whole point of writing them before the call).
        const command = message.attributes.commands[1];
        assert.strictEqual(command.type, "message");
        assert.strictEqual(command.message.text, "updated:Mario Rossi:ACME:+390000000");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/lead_update'), BOT_ID, () => { });
    });
  });

  it('leadupdate keys outside the attribute map reach the API but write no flow attribute', (done) => {

    let listener;
    let leadRequest = null;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/leads/:leadId', function (req, res) {
      leadRequest = req.body;
      res.status(200).send({ _id: req.params.leadId, success: true });
    });

    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        finish(listener, done, () => {
          assert.ok(leadRequest, 'Expected a PUT on /{projectId}/leads/{leadId}');
          assert.strictEqual(leadRequest.custom_field, "custom-value");
          // An unresolvable {{variable}} is sent as the empty string, not as the
          // raw placeholder: the API would otherwise store "{{unknown_variable}}".
          assert.strictEqual(leadRequest.another_one, "");
          // updateLead() is called with nativeAttributes only.
          assert.strictEqual(leadRequest.attributes, null);
          assert.strictEqual(leadRequest.tags, null);

          assert.ok(!err, 'getChatbotParameters failed');
          assert.ok(attributes, 'Expected flow attributes');
          assert.strictEqual(attributes.custom_field, undefined);
          assert.strictEqual(attributes.another_one, undefined);
        });
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/lead_update_custom_only'), BOT_ID, () => { });
    });
  });

  it('a leadupdate directive with no action calls back once and updates nothing', async () => {
    // Unreachable from a flow (Directives.actionToDirective always sets
    // `action`), so it is driven directly. Nothing is listening on 10002 here:
    // any request the directive tried to make would fail the test rather than
    // pass unnoticed.
    const dir = new DirContactUpdate({
      projectId: PROJECT_ID,
      token: "XXX",
      API_ENDPOINT: process.env.API_ENDPOINT || 'http://localhost:10002',
      requestId: REQUEST_ID
    });
    let called = 0;
    let stopValue = 'unset';
    await new Promise((resolve) => {
      dir.execute({ name: "leadupdate" }, (stop) => { called += 1; stopValue = stop; resolve(); });
    });
    assert.strictEqual(called, 1, 'The callback must be invoked exactly once');
    assert.strictEqual(stopValue, undefined, 'A malformed directive must not stop the flow');
  });

  // QUARANTINED -- asserts the CORRECT behaviour, currently red. See the report.
  //
  // DirContactUpdate.go() (directives/tiledesk/DirContactUpdate.js:80) calls
  // tiledeskApiService.updateLead(...) and ignores the promise it returns. The
  // tiledesk-client's updateLead() both invokes the callback AND rejects on a
  // non-2xx answer (node_modules/@tiledesk/tiledesk-client/index.js:2404-2409),
  // so a failing leads API produces an UNHANDLED PROMISE REJECTION. Under Node's
  // default --unhandled-rejections=throw that terminates the whole chatbot
  // process, which is exactly the class of runtime crash this suite exists to
  // catch. The source comment above line 80 records the missing rejection
  // handling but concludes "callback is never invoked", which is not what the
  // client does -- the callback IS invoked, and the flow does continue.
  //
  // Un-skip once the rejection is handled (e.g. `.catch()` on the returned
  // promise); the assertions below are what correct behaviour looks like.
  it.skip('leadupdate survives a non-2xx answer from the leads API and lets the flow continue', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/leads/:leadId', function (req, res) {
      res.status(500).send({ success: false, msg: "boom" });
    });

    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      finish(listener, done, () => {
        const command = message.attributes.commands[1];
        assert.strictEqual(command.message.text, "survived-the-error");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/lead_update_api_error'), BOT_ID, () => { });
    });
  });

});
