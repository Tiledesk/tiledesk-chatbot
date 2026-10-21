var assert = require('assert');
const tybot = require("..");
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
const bots_data = require('./conversation-remove_human_bot.js').bots_data;
const tilebotService = require('../services/TilebotService');

const PROJECT_ID = "projectID";
const BOT_ID = "botID";
const CHATBOT_TOKEN = "XXX";
const SERVER_PORT = 10001;
const API_PORT = 10002;

function supportRequestId() {
  return "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
}

function automationRequestId() {
  return "automation-request-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
}

function userMessage(requestId, text, extra) {
  return {
    "payload": Object.assign({
      "_id": uuidv4(),
      "senderFullname": "guest#367e",
      "type": "text",
      "sender": "A-SENDER",
      "recipient": requestId,
      "text": text,
      "id_project": PROJECT_ID,
      "metadata": "",
      "request": { "request_id": requestId }
    }, extra || {}),
    "token": CHATBOT_TOKEN
  };
}

function replyText(message) {
  const commands = message.attributes && message.attributes.commands;
  const messageCommand = commands && commands.find((c) => c.type === "message");
  return messageCommand ? messageCommand.message.text : message.text;
}

/** Starts the mock Tiledesk API; handlers receive (req, res, finish) where finish(err?) closes it and ends the test. */
function mockApi(done, handlers) {
  const endpointServer = express();
  endpointServer.use(bodyParser.json());
  let listener;
  const finish = (err) => listener.close(() => done(err));
  endpointServer.post('/:projectId/requests/:requestId/participants/remove', (req, res) => {
    try {
      handlers.remove(req, res, finish);
    } catch (err) {
      res.status(500).send({});
      finish(err);
    }
  });
  endpointServer.post('/:projectId/requests/:requestId/messages', (req, res) => {
    res.send({ success: true });
    try {
      handlers.message(replyText(req.body), finish);
    } catch (err) {
      finish(err);
    }
  });
  return new Promise((resolve) => {
    listener = endpointServer.listen(API_PORT, '0.0.0.0', () => resolve(listener));
  });
}

describe('Conversation for Remove human test', async () => {

  let app_listener;

  before(() => {
    return new Promise((resolve) => {
      tybot.startApp({
        bots: bots_data,
        TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT,
        API_ENDPOINT: process.env.API_ENDPOINT,
        API_URL: process.env.API_URL,
        REDIS_HOST: process.env.REDIS_HOST,
        REDIS_PORT: process.env.REDIS_PORT,
        REDIS_PASSWORD: process.env.REDIS_PASSWORD
      }, () => {
        app_listener = app.listen(SERVER_PORT, () => resolve());
      });
    });
  });

  after(function (done) {
    app_listener.close(() => done());
  });

  it('removes the humans and continues in the removed block', (done) => {
    const REQUEST_ID = supportRequestId();
    let removeCalled = false;
    mockApi(done, {
      remove: (req, res) => {
        removeCalled = true;
        assert.strictEqual(req.params.projectId, PROJECT_ID);
        assert.strictEqual(req.params.requestId, REQUEST_ID);
        assert.strictEqual(req.headers.authorization.startsWith('JWT '), true);
        assert.strictEqual(req.body.scope, 'all_humans');
        res.send({ request_id: REQUEST_ID, removed: [{ id_user: 'u1', fullname: 'A' }, { id_user: 'u2', fullname: 'B' }] });
      },
      message: (text, finish) => {
        assert.strictEqual(text, 'removed 2');
        assert.strictEqual(removeCalled, true);
        finish();
      }
    }).then(() => {
      tilebotService.sendMessageToBot(userMessage(REQUEST_ID, '/remove'), BOT_ID, () => {});
    });
  });

  it('goes to the error block with the server reason', (done) => {
    const REQUEST_ID = supportRequestId();
    mockApi(done, {
      remove: (req, res) => {
        res.status(422).send({ success: false, error: 'Remove human requires a conversation started by a webhook' });
      },
      message: (text, finish) => {
        assert.strictEqual(text, 'remove error|(Remove human) An error occurred: Remove human requires a conversation started by a webhook');
        finish();
      }
    }).then(() => {
      tilebotService.sendMessageToBot(userMessage(REQUEST_ID, '/remove'), BOT_ID, () => {});
    });
  });

  it('does not call the server for automation runs', (done) => {
    const REQUEST_ID = automationRequestId();
    mockApi(done, {
      remove: () => {
        throw new Error('remove endpoint must not be called for automation runs');
      },
      message: (text, finish) => {
        assert.strictEqual(text, 'remove error|(Remove human) requires a conversation');
        finish();
      }
    }).then(() => {
      tilebotService.sendMessageToBot(userMessage(REQUEST_ID, '/remove'), BOT_ID, () => {});
    });
  });
});
