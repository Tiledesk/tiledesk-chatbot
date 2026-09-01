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
const bots_data = require('./conversation-add_tags_errors_bot.js').bots_data;
const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID";
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil.js');
const tilebotService = require('../services/TilebotService.js');
const { DirAddTags } = require('../directives/tiledesk/DirAddTags');

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

/** Runs `fn` once it has been called `n` times. Used when two mock routes are
 *  both guaranteed to fire but in no guaranteed order. */
function gate(n, fn) {
  let seen = 0;
  return () => {
    seen += 1;
    if (seen === n) fn();
  };
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

describe('Conversation for AddTags failure paths', async () => {

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

  it('an empty tags attribute writes flowError, sends no tag request and lets the flow continue', (done) => {

    let listener;
    let tagRequests = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/requests/:requestId/tag', function (req, res) {
      tagRequests += 1;
      res.status(200).send({ success: true });
    });

    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        finish(listener, done, () => {
          assert.ok(!err, 'getChatbotParameters failed');
          assert.strictEqual(
            attributes.flowError,
            "Add tags Error: tags attribute is mandatory",
            'The mandatory-attribute failure must be reported through flowError'
          );
          assert.strictEqual(tagRequests, 0, 'No tag request must be sent with an empty tags attribute');
          assert.strictEqual(message.attributes.commands[1].message.text, "empty-tags-done");
        });
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/add_tags_empty'), BOT_ID, () => { });
    });
  });

  it('trims and drops empty entries, and continues when the tag endpoint answers non-2xx', (done) => {

    let listener;
    let tagBody = null;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/requests/:requestId/tag', function (req, res) {
      tagBody = req.body;
      res.status(500).send({ success: false, msg: "boom" });
    });

    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      finish(listener, done, () => {
        // " tagA , tagB ," -> two trimmed tags, the trailing empty one dropped.
        assert.deepStrictEqual(tagBody, [
          { tag: "tagA", color: "#f0806f" },
          { tag: "tagB", color: "#f0806f" }
        ]);
        // The API failed; the conversation must not stall on it.
        assert.strictEqual(message.attributes.commands[1].message.text, "request-tag-error-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/add_tags_request_error'), BOT_ID, () => { });
    });
  });

  it('pushToList posts the tag to the project tag list and continues when that POST fails', (done) => {

    let listener;
    let listBody = null;
    let tagBody = null;
    let message = null;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    // The project tag-list POST is fired without being awaited, so its arrival
    // is not ordered against the reply: wait for both.
    const both = gate(2, () => {
      finish(listener, done, () => {
        assert.deepStrictEqual(listBody, { tag: "tagC", color: "#f0806f" },
          'The new tag must be pushed to the project tag list with the directive default colour');
        assert.deepStrictEqual(tagBody, [{ tag: "tagC", color: "#f0806f" }],
          'The conversation must still be tagged when the tag-list POST fails');
        assert.strictEqual(message.attributes.commands[1].message.text, "push-error-done");
      });
    });

    endpointServer.post('/:projectId/tags', function (req, res) {
      listBody = req.body;
      res.status(500).send({ success: false, msg: "boom" });
      both();
    });

    endpointServer.put('/:projectId/requests/:requestId/tag', function (req, res) {
      tagBody = req.body;
      res.status(200).send({ success: true, tags: req.body });
    });

    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      message = req.body;
      both();
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/add_tags_push_error'), BOT_ID, () => { });
    });
  });

  it('target "lead" with a request that does not exist (404) tags nothing and lets the flow continue', (done) => {

    let listener;
    let leadTagRequests = 0;
    let requestLookups = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/:projectId/requests/:requestId', function (req, res) {
      requestLookups += 1;
      res.status(404).send({ success: false, msg: "not found" });
    });

    endpointServer.put('/:projectId/leads/:leadId/tag', function (req, res) {
      leadTagRequests += 1;
      res.status(200).send({ success: true });
    });

    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      finish(listener, done, () => {
        assert.strictEqual(requestLookups, 1, 'The lead branch must look the request up first');
        assert.strictEqual(leadTagRequests, 0, 'No lead can be tagged when the request is missing');
        assert.strictEqual(message.attributes.commands[1].message.text, "lead-missing-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/add_tags_lead_missing_request'), BOT_ID, () => { });
    });
  });

  it('target "lead" with a request lookup that fails (non-404) tags nothing and lets the flow continue', (done) => {

    let listener;
    let leadTagRequests = 0;
    let requestLookups = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    // getRequestById resolves null on a 404 but REJECTS on any other error.
    endpointServer.get('/:projectId/requests/:requestId', function (req, res) {
      requestLookups += 1;
      res.status(500).send({ success: false, msg: "boom" });
    });

    endpointServer.put('/:projectId/leads/:leadId/tag', function (req, res) {
      leadTagRequests += 1;
      res.status(200).send({ success: true });
    });

    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      finish(listener, done, () => {
        assert.strictEqual(requestLookups, 1, 'The lead branch must look the request up first');
        assert.strictEqual(leadTagRequests, 0, 'No lead can be tagged when the lookup failed');
        assert.strictEqual(message.attributes.commands[1].message.text, "lead-missing-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/add_tags_lead_missing_request'), BOT_ID, () => { });
    });
  });

  it('target "lead" sends the plain tag names to the lead and continues when that PUT fails', (done) => {

    let listener;
    let leadTagBody = null;
    let leadTagPath = null;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/:projectId/requests/:requestId', function (req, res) {
      res.status(200).send({
        request_id: req.params.requestId,
        id_project: req.params.projectId,
        lead: { _id: "LEAD-FROM-REQUEST" }
      });
    });

    endpointServer.put('/:projectId/leads/:leadId/tag', function (req, res) {
      leadTagPath = req.params.leadId;
      leadTagBody = req.body;
      res.status(500).send({ success: false, msg: "boom" });
    });

    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      finish(listener, done, () => {
        assert.strictEqual(leadTagPath, "LEAD-FROM-REQUEST",
          'The lead id must be taken from the request the conversation belongs to');
        // The lead endpoint takes the bare names -- NOT the {tag, color} objects
        // the request endpoint takes.
        assert.deepStrictEqual(leadTagBody, ["tagF", "tagG"]);
        assert.strictEqual(message.attributes.commands[1].message.text, "lead-tag-error-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/add_tags_lead_error'), BOT_ID, () => { });
    });
  });

  it('an unrecognised target tags nothing at all and lets the flow continue', (done) => {

    let listener;
    let calls = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/requests/:requestId/tag', function (req, res) {
      calls += 1;
      res.status(200).send({ success: true });
    });
    endpointServer.put('/:projectId/leads/:leadId/tag', function (req, res) {
      calls += 1;
      res.status(200).send({ success: true });
    });

    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      finish(listener, done, () => {
        assert.strictEqual(calls, 0, 'Neither the request nor the lead branch may run for an unknown target');
        assert.strictEqual(message.attributes.commands[1].message.text, "unknown-target-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/add_tags_unknown_target'), BOT_ID, () => { });
    });
  });

  describe('DirAddTags guard clauses', function () {

    // These two branches cannot be reached through a flow:
    // Directives.actionToDirective() always sets `action`, and the runtime
    // always supplies a cache. They are driven directly, and what is asserted is
    // that each one calls back exactly once and issues no HTTP request at all
    // (nothing is listening on 10002 here, so a request would surface as a
    // failure or a hang rather than passing silently).

    function contextWithout(overrides) {
      return Object.assign({
        projectId: PROJECT_ID,
        token: "XXX",
        API_ENDPOINT: process.env.API_ENDPOINT || 'http://localhost:10002',
        requestId: REQUEST_ID,
        chatbot: null
      }, overrides);
    }

    it('a directive with no action calls back once', async () => {
      const dir = new DirAddTags(contextWithout({ tdcache: {} }));
      let called = 0;
      let stopValue = 'unset';
      await new Promise((resolve) => {
        dir.execute({ name: "add_tags" }, (stop) => { called += 1; stopValue = stop; resolve(); });
      });
      assert.strictEqual(called, 1);
      assert.strictEqual(stopValue, undefined, 'The flow must not be stopped by a malformed directive');
    });

    // convertToJson() has NO caller anywhere in the tree (dead code, reported
    // separately). It is still a public method of a dispatched directive, so
    // what it actually does is pinned here rather than left unspecified.
    it('convertToJson parses JSON and hands back non-JSON input unchanged', async () => {
      const dir = new DirAddTags(contextWithout({ tdcache: {} }));
      assert.deepStrictEqual(await dir.convertToJson('{"a":1}'), { a: 1 });
      assert.deepStrictEqual(await dir.convertToJson('[1,2]'), [1, 2]);
      // Not valid JSON: resolved as-is instead of throwing.
      assert.strictEqual(await dir.convertToJson('tag1,tag2'), 'tag1,tag2');
      assert.strictEqual(await dir.convertToJson(undefined), undefined);
    });

    it('a missing cache calls back once instead of throwing', async () => {
      const dir = new DirAddTags(contextWithout({ tdcache: undefined }));
      let called = 0;
      let stopValue = 'unset';
      await new Promise((resolve) => {
        dir.execute(
          { name: "add_tags", action: { target: "request", tags: "tagX" } },
          (stop) => { called += 1; stopValue = stop; resolve(); }
        );
      });
      assert.strictEqual(called, 1);
      assert.strictEqual(stopValue, undefined);
    });

  });

});
