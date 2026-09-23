const express = require('express');
const app = express();

const assert = require('assert');
require('dotenv').config();

const SERVER_PORT = 10001;
const MOCK_API_PORT = 10002;

process.env.API_ENDPOINT = process.env.API_ENDPOINT || `http://127.0.0.1:${MOCK_API_PORT}`;
process.env.TILEBOT_ENDPOINT = process.env.TILEBOT_ENDPOINT || `http://127.0.0.1:${SERVER_PORT}`;

const tybot = require("../index.js");
const tybotRoute = tybot.router;
const winston = require('../utils/winston.js');

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
} = require('./conversation-call-subagent_bots.js');

const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const CHATBOT_TOKEN = "XXX";
const tilebotService = require('../services/TilebotService.js');

const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil.js');

function buildTilebotRequest(text, requestId) {
  const recipient = requestId || REQUEST_ID;
  return {
    payload: {
      _id: uuidv4(),
      senderFullname: "_tdinternal",
      type: "text",
      sender: "_tdinternal",
      recipient: recipient,
      text: text,
      id_project: PROJECT_ID,
      request: {
        request_id: recipient,
        id_project: PROJECT_ID
      }
    },
    token: CHATBOT_TOKEN
  };
}

function isInternalTrigger(message) {
  return message.attributes?.subtype === 'info'
    && typeof message.text === 'string'
    && message.text.startsWith('/');
}

function getUserVisibleText(message) {
  const commands = message.attributes?.commands;
  if (!commands) {
    return null;
  }
  const msgCmd = commands.find(c => c.type === 'message');
  return msgCmd?.message?.text || null;
}

describe('Conversation for CallSubAgent test', async () => {

  let app_listener;
  let util = new TiledeskChatbotUtil();

  before(() => {
    return new Promise(async (resolve, reject) => {
      winston.info("Starting tilebot server...");
      try {
        tybot.startApp(
          {
            // MONGODB_URI: process.env.MONGODB_URI,
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
              winston.info('Tilebot connector listening on port ' + port);
              resolve();
            });
          });
      }
      catch (error) {
        winston.error("error:", error)
      }

    })
  });

  after(function (done) {
    app_listener.close(() => {
      done();
    });
  });

  it('/call_subagent_success', (done) => {
    let listener;
    let endpointServer = express();
    let messageReceived = [];
    let activeBotId = PARENT_BOT_ID;

    endpointServer.use(bodyParser.json());

    // Simulates Tiledesk: after callSubAgent, track which bot owns the request.
    endpointServer.put('/:projectId/requests/:requestId/replace', function (req, res) {
      if (req.body.id) {
        activeBotId = req.body.id;
      }
      res.send({ success: true, replaced_bot_root_id: req.body.id });
    });

    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      messageReceived.push(message);

      // Hidden commands (e.g. /start after replace) go to the mock API in production
      // and come back to tilebot via webhook. Re-inject them on /ext/:botid.
      if (isInternalTrigger(message)) {
        tilebotService.sendMessageToBot(
          buildTilebotRequest(message.text),
          activeBotId,
          () => winston.verbose("Internal message forwarded to tilebot:", message.text, activeBotId)
        );
        return;
      }

      const userMessages = messageReceived
        .map(getUserVisibleText)
        .filter(Boolean);

      if (userMessages.length < 2) {
        return;
      }

      assert.strictEqual(userMessages[0], "Subagent working");
      assert.strictEqual(userMessages[1], "Subagent returned to the parent");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          listener.close(() => {
            done();
          });
        }
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/invoke_subagent',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": "XXX"
      }
      tilebotService.sendMessageToBot(request, PARENT_BOT_ID, () => {
        winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('does not run defaultFallback on the trigger text or a subagent bubble after return', (done) => {
    const requestId = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
    const invokeIntentId = "10000000-0000-0000-0000-000000000001";
    let listener;
    let endpointServer = express();
    let messageReceived = [];
    let activeBotId = PARENT_BOT_ID;
    let replayed = false;

    endpointServer.use(bodyParser.json());
    endpointServer.put('/:projectId/requests/:requestId/replace', function (req, res) {
      if (req.body.id) {
        activeBotId = req.body.id;
      }
      res.send({ success: true, replaced_bot_root_id: req.body.id });
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      messageReceived.push(message);

      if (isInternalTrigger(message)) {
        tilebotService.sendMessageToBot(
          buildTilebotRequest(message.text, requestId),
          activeBotId,
          () => {}
        );
        return;
      }

      const userMessages = messageReceived.map(getUserVisibleText).filter(Boolean);
      if (!userMessages.includes("Subagent returned to the parent") || replayed) {
        return;
      }
      replayed = true;

      const triggerReplay = {
        payload: {
          _id: uuidv4(),
          senderFullname: "guest#367e",
          type: "text",
          sender: "A-SENDER",
          recipient: requestId,
          text: "run task",
          id_project: PROJECT_ID,
          request: { request_id: requestId, id_project: PROJECT_ID }
        },
        token: CHATBOT_TOKEN
      };
      const botBubble = {
        payload: {
          _id: uuidv4(),
          senderFullname: "Task 1",
          type: "text",
          sender: "bot_" + SUBAGENT_BOT_ID,
          recipient: requestId,
          text: "Sono Task 1 (version 1)",
          id_project: PROJECT_ID,
          request: { request_id: requestId, id_project: PROJECT_ID }
        },
        token: CHATBOT_TOKEN
      };

      tilebotService.sendMessageToBot(triggerReplay, PARENT_BOT_ID, () => {
        tilebotService.sendMessageToBot(botBubble, PARENT_BOT_ID, () => {
          setTimeout(() => {
            const texts = messageReceived.map(getUserVisibleText).filter(Boolean);
            assert.ok(!texts.includes("FALLBACK"), "defaultFallback must not run after subagent return");
            listener.close(() => done());
          }, 500);
        });
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      const request = {
        payload: {
          _id: uuidv4(),
          senderFullname: "guest#367e",
          type: "text",
          sender: "A-SENDER",
          recipient: requestId,
          text: "run task",
          id_project: PROJECT_ID,
          attributes: { action: "#" + invokeIntentId },
          request: { request_id: requestId, id_project: PROJECT_ID }
        },
        token: CHATBOT_TOKEN
      };
      tilebotService.sendMessageToBot(request, PARENT_BOT_ID, () => {});
    });
  });

});