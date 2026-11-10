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
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const {
  bots_data,
  PARENT_BOT_ID,
  CHILD_BOT_ID
} = require('./conversation-replacebot-return_bots.js');

const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const CHATBOT_TOKEN = "XXX";
const tilebotService = require('../services/TilebotService.js');

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

describe('Conversation for ReplaceBot return stack', async () => {

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
            app_listener = app.listen(SERVER_PORT, () => {
              winston.info('Tilebot connector listening on port ' + SERVER_PORT);
              resolve();
            });
          });
      }
      catch (error) {
        winston.error("error:", error);
        reject(error);
      }
    });
  });

  after(function (done) {
    app_listener.close(() => {
      done();
    });
  });

  it('returns to the parent block after replaceBot', (done) => {
    let listener;
    let endpointServer = express();
    let messageReceived = [];
    let activeBotId = PARENT_BOT_ID;

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

      assert.strictEqual(userMessages[0], "Child working");
      assert.strictEqual(userMessages[1], "Returned to the parent");
      listener.close(() => {
        done();
      });
    });

    listener = endpointServer.listen(MOCK_API_PORT, '0.0.0.0', () => {
      const request = {
        payload: {
          senderFullname: "guest#367e",
          type: "text",
          sender: "A-SENDER",
          recipient: REQUEST_ID,
          text: '/invoke_replace',
          id_project: PROJECT_ID,
          request: {
            request_id: REQUEST_ID
          }
        },
        token: CHATBOT_TOKEN
      };
      tilebotService.sendMessageToBot(request, PARENT_BOT_ID, () => {});
    });
  });

  it('pushes the stack on every nested replace', (done) => {
    const requestId = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
    let listener;
    let endpointServer = express();
    let messageReceived = [];
    let activeBotId = PARENT_BOT_ID;

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
      if (userMessages.length < 3) {
        return;
      }

      assert.deepStrictEqual(userMessages, [
        "Grandchild working",
        "Child resumed",
        "Parent resumed"
      ]);
      listener.close(() => {
        done();
      });
    });

    listener = endpointServer.listen(MOCK_API_PORT, '0.0.0.0', () => {
      const request = {
        payload: {
          _id: uuidv4(),
          senderFullname: "guest#367e",
          type: "text",
          sender: "A-SENDER",
          recipient: requestId,
          text: '/invoke_nested',
          id_project: PROJECT_ID,
          request: {
            request_id: requestId,
            id_project: PROJECT_ID
          }
        },
        token: CHATBOT_TOKEN
      };
      tilebotService.sendMessageToBot(request, PARENT_BOT_ID, () => {});
    });
  });

  it('drops the saved stack when replace fails', (done) => {
    const requestId = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
    let listener;
    let endpointServer = express();
    let replaceCalls = [];

    endpointServer.use(bodyParser.json());
    endpointServer.put('/:projectId/requests/:requestId/replace', function (req, res) {
      replaceCalls.push(req.body);
      res.status(500).send({ error: true });
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
    });

    listener = endpointServer.listen(MOCK_API_PORT, '0.0.0.0', () => {
      const request = {
        payload: {
          _id: uuidv4(),
          senderFullname: "guest#367e",
          type: "text",
          sender: "A-SENDER",
          recipient: requestId,
          text: '/replace_fail',
          id_project: PROJECT_ID,
          request: {
            request_id: requestId,
            id_project: PROJECT_ID
          }
        },
        token: CHATBOT_TOKEN
      };
      tilebotService.sendMessageToBot(request, PARENT_BOT_ID, () => {
        setTimeout(() => {
          const returnRequest = {
            payload: {
              _id: uuidv4(),
              senderFullname: "guest#367e",
              type: "text",
              sender: "A-SENDER",
              recipient: requestId,
              text: '/do_return',
              id_project: PROJECT_ID,
              request: {
                request_id: requestId,
                id_project: PROJECT_ID
              }
            },
            token: CHATBOT_TOKEN
          };
          tilebotService.sendMessageToBot(returnRequest, PARENT_BOT_ID, () => {
            setTimeout(() => {
              assert.strictEqual(replaceCalls.length, 1);
              listener.close(() => done());
            }, 400);
          });
        }, 400);
      });
    });
  });

  it('returns the participant bot of the token, not the published copy running the flow', (done) => {
    const requestId = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
    const DEV_PARENT_BOT_ID = "devReplaceParentBotID";
    const devParentToken = jwt.sign({ _id: DEV_PARENT_BOT_ID }, "test-secret", { subject: "bot" });
    let listener;
    let endpointServer = express();
    let messageReceived = [];
    let replacedIds = [];
    let activeBotId = PARENT_BOT_ID;

    endpointServer.use(bodyParser.json());
    endpointServer.put('/:projectId/requests/:requestId/replace', function (req, res) {
      if (req.body.id) {
        activeBotId = req.body.id;
        replacedIds.push(req.body.id);
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
      if (!userMessages.includes("Returned to the parent")) {
        return;
      }

      assert.deepStrictEqual(replacedIds, [CHILD_BOT_ID, DEV_PARENT_BOT_ID]);
      listener.close(() => done());
    });

    listener = endpointServer.listen(MOCK_API_PORT, '0.0.0.0', () => {
      const request = {
        payload: {
          _id: uuidv4(),
          senderFullname: "guest#367e",
          type: "text",
          sender: "A-SENDER",
          recipient: requestId,
          text: '/invoke_replace',
          id_project: PROJECT_ID,
          request: { request_id: requestId, id_project: PROJECT_ID }
        },
        token: devParentToken
      };
      tilebotService.sendMessageToBot(request, PARENT_BOT_ID, () => {});
    });
  });

});
