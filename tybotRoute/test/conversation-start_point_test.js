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
const bots_data = require('./conversation-start_point_bot.js').bots_data;
const tilebotService = require('../services/TilebotService');

const PROJECT_ID = "projectID";
const BOT_ID = "botID";
const CHATBOT_TOKEN = "XXX";
const SERVER_PORT = 10001;
const API_PORT = 10002;

function requestId() {
  return "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
}

function userMessage(reqId, text, extra, requestAttributes) {
  const request = { "request_id": reqId };
  if (requestAttributes) {
    request.attributes = requestAttributes;
  }
  return {
    "payload": Object.assign({
      "_id": uuidv4(),
      "senderFullname": "guest#367e",
      "type": "text",
      "sender": "A-SENDER",
      "recipient": reqId,
      "text": text,
      "id_project": PROJECT_ID,
      "metadata": "",
      "request": request
    }, extra || {}),
    "token": CHATBOT_TOKEN
  };
}

function replyText(message) {
  const commands = message.attributes && message.attributes.commands;
  const messageCommand = commands && commands.find((c) => c.type === "message");
  return messageCommand ? messageCommand.message.text : message.text;
}

let currentApi = null;

/** Mock Tiledesk API: calls onMessage(text, finish) for each bot reply. */
function mockApi(done, onMessage) {
  const endpointServer = express();
  endpointServer.use(bodyParser.json());
  let listener;
  const finish = (err) => { listener.close(() => done(err)); listener.closeAllConnections(); };
  endpointServer.post('/:projectId/requests/:requestId/messages', (req, res) => {
    res.send({ success: true });
    try {
      onMessage(replyText(req.body), finish);
    } catch (err) {
      finish(err);
    }
  });
  return new Promise((resolve) => {
    listener = endpointServer.listen(API_PORT, '0.0.0.0', () => { currentApi = listener; resolve(listener); });
  });
}

describe('Conversation for Start point test', function () {
  this.timeout(8000);

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

  afterEach(function (done) {
    if (currentApi && currentApi.listening) {
      currentApi.closeAllConnections();
      currentApi.close(() => done());
    } else {
      done();
    }
  });

  after(function (done) {
    app_listener.close(() => done());
  });

  it('/start with an action runs the webhook box with start_type and payload', (done) => {
    const REQUEST_ID = requestId();
    mockApi(done, (text, finish) => {
      assert.strictEqual(text, 'webhook box|webhook|X');
      finish();
    }).then(() => {
      tilebotService.sendMessageToBot(
        userMessage(REQUEST_ID, '/start', { attributes: { action: '#wbox-id' } }, { start_type: 'webhook', payload: { alertname: 'X' } }),
        BOT_ID, () => {});
    });
  });

  it('/start whose action names a missing box falls back to start', (done) => {
    const REQUEST_ID = requestId();
    mockApi(done, (text, finish) => {
      assert.ok(text.startsWith('web start|'), text);
      finish();
    }).then(() => {
      tilebotService.sendMessageToBot(
        userMessage(REQUEST_ID, '/start', { attributes: { action: '#missing-id' } }),
        BOT_ID, () => {});
    });
  });

  it('/start without action and without start_type renders an empty start_type', (done) => {
    const REQUEST_ID = requestId();
    mockApi(done, (text, finish) => {
      assert.strictEqual(text, 'web start|');
      finish();
    }).then(() => {
      tilebotService.sendMessageToBot(userMessage(REQUEST_ID, '/start'), BOT_ID, () => {});
    });
  });

  it('a non-start message with a missing action does not fall back to start', (done) => {
    const REQUEST_ID = requestId();
    let listener;
    const replies = [];
    mockApi(() => {}, (text) => { replies.push(text); }).then((l) => {
      listener = l;
      tilebotService.sendMessageToBot(
        userMessage(REQUEST_ID, 'hello', { attributes: { action: '#missing-id' } }),
        BOT_ID, () => {});
      setTimeout(() => {
        listener.closeAllConnections();
        listener.close(() => {
          try {
            assert.ok(!replies.some((t) => t && t.startsWith('web start')), JSON.stringify(replies));
            done();
          } catch (err) {
            done(err);
          }
        });
      }, 1500);
    });
  });

});
