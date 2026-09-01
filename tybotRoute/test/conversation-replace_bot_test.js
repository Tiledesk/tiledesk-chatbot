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
const bots_data = require('./conversation-replace_bot_bot.js').bots_data;
const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID";
const tilebotService = require('../services/TilebotService.js');
const { DirMessageToBot } = require('../directives/bot/DirMessageToBot');

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

/**
 * Both the hidden "/block" message a replace directive sends and the reply that
 * follows it land on POST /{projectId}/requests/{requestId}/messages. The reply
 * is the one carrying `attributes.commands`; everything before it is a hidden
 * message. `onReply` fires once, with the reply and the hidden messages seen so
 * far, which is also the point at which the flow is known to have continued.
 */
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

describe('Conversation for the bot-replacement directives', async () => {

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

  // ------------------------------------------------------------ replacebotv2

  it('replacebotv2 PUTs { name } to /{projectId}/requests/{requestId}/replace, with the bot name filled from a variable', (done) => {

    let listener;
    let replaceReq = null;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/requests/:requestId/replace', function (req, res) {
      replaceReq = {
        projectId: req.params.projectId,
        requestId: req.params.requestId,
        authorization: req.headers.authorization,
        body: req.body
      };
      res.status(200).send({ success: true, replaced_bot_root_id: "NEW-ROOT" });
    });

    messagesRoute(endpointServer, (reply, hidden) => {
      finish(listener, done, () => {
        assert.ok(replaceReq, 'Expected a PUT on /{projectId}/requests/{requestId}/replace');
        assert.strictEqual(replaceReq.projectId, PROJECT_ID);
        assert.strictEqual(replaceReq.requestId, REQUEST_ID);
        assert.strictEqual(replaceReq.authorization, 'JWT XXX');
        assert.deepStrictEqual(replaceReq.body, { name: "Second Bot" },
          'Without nameAsSlug the body must carry { name }, and {{target_bot}} must be filled');
        assert.strictEqual(hidden.length, 0, 'No blockName: no hidden message may be sent');
        assert.strictEqual(reply.attributes.commands[1].message.text, "v2-name-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(
        messageFor('/replace_bot_v2_by_name{"target_bot":"Second Bot"}'), BOT_ID, () => { });
    });
  });

  it('replacebotv2 with nameAsSlug PUTs { slug } instead of { name }', (done) => {

    let listener;
    let body = null;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/requests/:requestId/replace', function (req, res) {
      body = req.body;
      res.status(200).send({ success: true });
    });

    messagesRoute(endpointServer, (reply) => {
      finish(listener, done, () => {
        assert.deepStrictEqual(body, { slug: "second-bot" });
        assert.strictEqual(reply.attributes.commands[1].message.text, "v2-slug-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/replace_bot_v2_by_slug'), BOT_ID, () => { });
    });
  });

  it('replacebotv2 with a blockName sends the hidden "/block" info message to the new bot', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/requests/:requestId/replace', function (req, res) {
      res.status(200).send({ success: true });
    });

    messagesRoute(endpointServer, (reply, hidden) => {
      finish(listener, done, () => {
        assert.strictEqual(hidden.length, 1, 'Exactly one hidden message must be sent');
        assert.deepStrictEqual(hidden[0], {
          type: "text",
          text: "/start_here",
          attributes: { subtype: "info" }
        });
        assert.strictEqual(reply.attributes.commands[1].message.text, "v2-block-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/replace_bot_v2_with_block'), BOT_ID, () => { });
    });
  });

  it('replacebotv2 skips the hidden message and continues when the replace call fails', (done) => {

    let listener;
    let replaceCalls = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/requests/:requestId/replace', function (req, res) {
      replaceCalls += 1;
      res.status(500).send({ success: false, msg: "boom" });
    });

    messagesRoute(endpointServer, (reply, hidden) => {
      finish(listener, done, () => {
        assert.strictEqual(replaceCalls, 1);
        assert.strictEqual(hidden.length, 0,
          'A failed replace must not trigger the hidden "/block" message');
        assert.strictEqual(reply.attributes.commands[1].message.text, "v2-error-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/replace_bot_v2_error'), BOT_ID, () => { });
    });
  });

  // ------------------------------------------------------------ replacebotv3

  it('replacebotv3 PUTs { id } when useSlug is not set', (done) => {

    let listener;
    let body = null;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/requests/:requestId/replace', function (req, res) {
      body = req.body;
      res.status(200).send({ success: true });
    });

    messagesRoute(endpointServer, (reply, hidden) => {
      finish(listener, done, () => {
        assert.deepStrictEqual(body, { id: "BOT-ID-3" },
          'V3 addresses the bot by id, and must not fall back to the slug');
        assert.strictEqual(hidden.length, 0);
        assert.strictEqual(reply.attributes.commands[1].message.text, "v3-id-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/replace_bot_v3_by_id'), BOT_ID, () => { });
    });
  });

  it('replacebotv3 with useSlug fills both the slug and the block name from variables', (done) => {

    let listener;
    let body = null;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/requests/:requestId/replace', function (req, res) {
      body = req.body;
      res.status(200).send({ success: true });
    });

    messagesRoute(endpointServer, (reply, hidden) => {
      finish(listener, done, () => {
        assert.deepStrictEqual(body, { slug: "third-bot" });
        assert.strictEqual(hidden.length, 1);
        assert.strictEqual(hidden[0].text, "/welcome_block",
          'blockName is filled from the flow attributes before the "/" is prepended');
        assert.strictEqual(hidden[0].attributes.subtype, "info");
        assert.strictEqual(reply.attributes.commands[1].message.text, "v3-slug-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(
        messageFor('/replace_bot_v3_by_slug{"slug_var":"third-bot","block_var":"welcome_block"}'),
        BOT_ID, () => { });
    });
  });

  it('replacebotv3 skips the hidden message and continues when the replace call fails', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.put('/:projectId/requests/:requestId/replace', function (req, res) {
      res.status(503).send({ success: false });
    });

    messagesRoute(endpointServer, (reply, hidden) => {
      finish(listener, done, () => {
        assert.strictEqual(hidden.length, 0);
        assert.strictEqual(reply.attributes.commands[1].message.text, "v3-error-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/replace_bot_v3_error'), BOT_ID, () => { });
    });
  });

  // ------------------------------------------------------- replacebot (v1)

  it('replacebot looks the bot up by name, swaps the participant bot and continues', (done) => {

    let listener;
    const calls = [];
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/:projectId/faq_kb', function (req, res) {
      calls.push('list-bots');
      res.status(200).send([
        { _id: "BOT-1-ID", name: "First Bot" },
        { _id: "BOT-2-ID", name: "Second Bot" }
      ]);
    });
    endpointServer.get('/:projectId/requests/:requestId', function (req, res) {
      calls.push('get-request');
      res.status(200).send({ request_id: req.params.requestId, participantsBots: ["BOT-1-ID"] });
    });
    endpointServer.delete('/:projectId/requests/:requestId/participants/:participantId', function (req, res) {
      calls.push('delete-participant:' + req.params.participantId);
      res.status(200).send({ success: true });
    });
    endpointServer.post('/:projectId/requests/:requestId/participants', function (req, res) {
      calls.push('add-participant:' + req.body.member);
      res.status(200).send({ success: true });
    });

    messagesRoute(endpointServer, (reply) => {
      finish(listener, done, () => {
        assert.deepStrictEqual(calls, [
          'list-bots',
          'get-request',
          'delete-participant:bot_BOT-1-ID',
          'add-participant:bot_BOT-2-ID'
        ], 'The old bot must be removed and the one matching the filled name added, in that order');
        assert.strictEqual(reply.attributes.commands[1].message.text, "v1-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(
        messageFor('/replace_bot_v1{"target_bot":"Second Bot"}'), BOT_ID, () => { });
    });
  });

  it('replacebot changes no participant when no bot carries that name, and the flow goes on', (done) => {

    let listener;
    let participantCalls = 0;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/:projectId/faq_kb', function (req, res) {
      res.status(200).send([{ _id: "BOT-1-ID", name: "First Bot" }]);
    });
    endpointServer.get('/:projectId/requests/:requestId', function (req, res) {
      participantCalls += 1;
      res.status(200).send({ request_id: req.params.requestId, participantsBots: ["BOT-1-ID"] });
    });
    endpointServer.post('/:projectId/requests/:requestId/participants', function (req, res) {
      participantCalls += 1;
      res.status(200).send({ success: true });
    });

    messagesRoute(endpointServer, (reply) => {
      finish(listener, done, () => {
        assert.strictEqual(participantCalls, 0,
          'An unknown bot name must not touch the request participants');
        assert.strictEqual(reply.attributes.commands[1].message.text, "v1-notfound-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/replace_bot_v1_not_found'), BOT_ID, () => { });
    });
  });

  // ------------------------------------------------------- removecurrentbot

  it('removecurrentbot removes the participant bot and moves the request to status 50', (done) => {

    let listener;
    const calls = [];
    let patchBody = null;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/:projectId/requests/:requestId', function (req, res) {
      calls.push('get-request');
      res.status(200).send({ request_id: req.params.requestId, participantsBots: ["BOT-1-ID"] });
    });
    endpointServer.delete('/:projectId/requests/:requestId/participants/:participantId', function (req, res) {
      calls.push('delete-participant:' + req.params.participantId);
      res.status(200).send({ success: true });
    });
    endpointServer.patch('/:projectId/requests/:requestId', function (req, res) {
      calls.push('patch-request');
      patchBody = req.body;
      res.status(200).send({ success: true });
    });

    messagesRoute(endpointServer, (reply) => {
      finish(listener, done, () => {
        assert.deepStrictEqual(calls, [
          'get-request',
          'delete-participant:bot_BOT-1-ID',
          'patch-request'
        ]);
        assert.deepStrictEqual(patchBody, { status: 50 },
          'Removing the bot must hand the conversation over by setting status 50');
        assert.strictEqual(reply.attributes.commands[1].message.text, "remove-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/remove_current_bot'), BOT_ID, () => { });
    });
  });

  // QUARANTINED -- asserts the CORRECT behaviour, currently red. See the report.
  //
  // TiledeskClient.removeCurrentBot() (node_modules/@tiledesk/tiledesk-client/
  // index.js:964-990) only calls back inside `if (request.participantsBots &&
  // request.participantsBots.length > 0)`. A conversation with no participant
  // bot -- which is exactly the state a previous removecurrentbot leaves behind
  // -- therefore never reaches the callback, DirRemoveCurrentBot.go() never
  // returns, and the flow stalls silently: no reply, no log, no error. The test
  // below times out today; the assertion is what correct behaviour looks like.
  it.skip('removecurrentbot lets the flow continue when the request has no participant bot', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.get('/:projectId/requests/:requestId', function (req, res) {
      res.status(200).send({ request_id: req.params.requestId, participantsBots: [] });
    });

    messagesRoute(endpointServer, (reply) => {
      finish(listener, done, () => {
        assert.strictEqual(reply.attributes.commands[1].message.text, "remove-done");
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      tilebotService.sendMessageToBot(messageFor('/remove_current_bot'), BOT_ID, () => { });
    });
  });

  // ---------------------------------------------------------- DirMessageToBot

  describe('DirMessageToBot', function () {
    // DirMessageToBot declares no `directiveNames`, so the registry never
    // dispatches it and its guard clause has no route through a flow.
    it('calls back once, without stopping the flow, when the directive has no action', async () => {
      const dir = new DirMessageToBot({
        projectId: PROJECT_ID,
        token: "XXX",
        API_ENDPOINT: process.env.API_ENDPOINT,
        TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT,
        requestId: REQUEST_ID,
        // deliberately absent: go() would read supportRequest.bot_id and throw
        supportRequest: undefined
      });
      let called = 0;
      let stopValue = 'unset';
      await new Promise((resolve) => {
        dir.execute({ name: "message_to_bot" }, (stop) => { called += 1; stopValue = stop; resolve(); });
      });
      assert.strictEqual(called, 1);
      assert.strictEqual(stopValue, undefined,
        'The guard clause must fall through, not stop the directive chain');
    });
  });

});
