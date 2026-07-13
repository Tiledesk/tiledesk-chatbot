var assert = require('assert');
require('dotenv').config();

const SERVER_PORT = 10001;
const MOCK_API_PORT = 10002;

process.env.API_ENDPOINT = process.env.API_ENDPOINT || `http://127.0.0.1:${MOCK_API_PORT}`;
process.env.TILEBOT_ENDPOINT = `http://127.0.0.1:${SERVER_PORT}`;

const tybot = require("../index.js");
const tybotRoute = tybot.router;
var express = require('express');
var app = express();
const winston = require('../utils/winston');
app.use("/", tybotRoute);
app.use((err, req, res, next) => {
  winston.error("General error", err);
});

const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const {
  bots_data,
  PARENT_BOT_ID,
  SUBAGENT_BOT_ID,
  NESTED_SUBAGENT_BOT_ID
} = require('./conversation-replace-botv4_bots.js');

const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const CHATBOT_TOKEN = "XXX";
const tilebotService = require('../services/TilebotService.js');

function replyTextFromMessage(message) {
  if (!message?.attributes?.commands) {
    return null;
  }
  for (const command of message.attributes.commands) {
    if (command.type === "message" && command.message?.text) {
      return command.message.text;
    }
  }
  return null;
}

function createMockApi(options) {
  const endpointServer = express();
  endpointServer.use(bodyParser.json());

  let currentBotId = options.initialBotId;
  const replaceCalls = [];
  const replyTexts = [];

  endpointServer.put('/:projectId/requests/:requestId/replace', function (req, res) {
    assert.strictEqual(req.params.projectId, PROJECT_ID);
    assert.strictEqual(req.params.requestId, REQUEST_ID);
    assert.ok(req.headers.authorization);
    assert.ok(req.body.id);
    replaceCalls.push(req.body.id);
    currentBotId = req.body.id;
    res.status(200).send({
      success: true,
      replaced_bot_root_id: req.body.id
    });
  });

  endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
    res.send({ success: true });
    const message = req.body;

    if (message.attributes?.subtype === "info" && message.text?.startsWith("/")) {
      tilebotService.sendMessageToBot({
        "payload": {
          "_id": uuidv4(),
          "senderFullname": "_tdinternal",
          "type": "text",
          "sender": "_tdinternal",
          "recipient": REQUEST_ID,
          "text": message.text,
          "id_project": PROJECT_ID,
          "request": {
            "request_id": REQUEST_ID,
            "id_project": PROJECT_ID,
            "bot_id": currentBotId
          }
        },
        "token": CHATBOT_TOKEN
      }, currentBotId, (err) => {
        if (err) {
          winston.error("Error forwarding hidden message to tilebot:", err);
        }
      });
      return;
    }

    const replyText = replyTextFromMessage(message);
    if (replyText) {
      replyTexts.push(replyText);
      if (options.onReply) {
        options.onReply(replyText, {
          replaceCalls,
          replyTexts,
          currentBotId
        });
      }
    }
  });

  return {
    endpointServer,
    getReplaceCalls: () => replaceCalls,
    getReplyTexts: () => replyTexts
  };
}

function sendToBot(text, botId, callback) {
  const request = {
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
        "bot_id": botId
      }
    },
    "token": CHATBOT_TOKEN
  };
  tilebotService.sendMessageToBot(request, botId, callback);
}

describe('Conversation for ReplaceBotV4 / Return test', function () {

  let app_listener;

  before(function () {
    return new Promise(async (resolve, reject) => {
      winston.info("Starting tilebot server...");
      try {
        tybot.startApp({
          bots: bots_data,
          TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT,
          API_ENDPOINT: process.env.API_ENDPOINT,
          REDIS_HOST: process.env.REDIS_HOST,
          REDIS_PORT: process.env.REDIS_PORT,
          REDIS_PASSWORD: process.env.REDIS_PASSWORD
        }, () => {
          winston.info("Tilebot route successfully started.");
          app_listener = app.listen(SERVER_PORT, () => {
            winston.info('Tilebot connector listening on port ' + SERVER_PORT);
            resolve();
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  });

  after(function (done) {
    app_listener.close(() => {
      done();
    });
  });

  it('replacebotv4: subagent return resumes parent flow', function (done) {
    const mock = createMockApi({
      initialBotId: PARENT_BOT_ID,
      onReply(text, ctx) {
        if (text === "Subagent returned to the parent") {
          assert.deepStrictEqual(ctx.replaceCalls, [SUBAGENT_BOT_ID, PARENT_BOT_ID]);
          assert.ok(ctx.replyTexts.includes("Subagent working"));
          listener.close(() => done());
        }
      }
    });

    let listener;
    listener = mock.endpointServer.listen(MOCK_API_PORT, '0.0.0.0', () => {
      sendToBot('/invoke_subagent', PARENT_BOT_ID, (err) => {
        if (err) {
          assert.fail(err);
        }
      });
    });
  });

  it('replacebotv4: nested subagents return in order', function (done) {
    const mock = createMockApi({
      initialBotId: PARENT_BOT_ID,
      onReply(text, ctx) {
        if (text === "Subagent returned to the parent") {
          assert.deepStrictEqual(ctx.replaceCalls, [
            SUBAGENT_BOT_ID,
            NESTED_SUBAGENT_BOT_ID,
            SUBAGENT_BOT_ID,
            PARENT_BOT_ID
          ]);
          assert.ok(ctx.replyTexts.includes("Nested subagent done"));
          assert.ok(ctx.replyTexts.includes("Back from nested"));
          listener.close(() => done());
        }
      }
    });

    let listener;
    listener = mock.endpointServer.listen(MOCK_API_PORT, '0.0.0.0', () => {
      sendToBot('/invoke_nested_chain', PARENT_BOT_ID, (err) => {
        if (err) {
          assert.fail(err);
        }
      });
    });
  });

});
