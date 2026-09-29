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
const bots_data = require('./conversation-lock_ownership_bot.js').bots_data;
const tilebotService = require('../services/TilebotService');

const PROJECT_ID = "projectID";
const BOT_ID = "botID";
const CHATBOT_TOKEN = "XXX";
const SERVER_PORT = 10001;
const API_PORT = 10002;

function newRequestId() {
  return "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
}

function message(requestId, sender, text) {
  return {
    "payload": {
      "_id": uuidv4(),
      "senderFullname": sender === '_tdinternal' ? '_tdinternal' : "guest#367e",
      "type": "text",
      "sender": sender,
      "recipient": requestId,
      "text": text,
      "id_project": PROJECT_ID,
      "metadata": "",
      "request": { "request_id": requestId, "id_project": PROJECT_ID }
    },
    "token": CHATBOT_TOKEN
  };
}

function send(requestId, sender, text) {
  tilebotService.sendMessageToBot(message(requestId, sender, text), BOT_ID, () => {});
}

function replyText(m) {
  const commands = m.attributes && m.attributes.commands;
  const c = commands && commands.find((x) => x.type === "message");
  return c ? c.message.text : m.text;
}

/**
 * Mock Tiledesk API. `steps` is a list of { expect, then } run in order: each
 * received reply must equal steps[i].expect, then steps[i].then() is invoked.
 * After the last step, `quietMs` of silence is required before done().
 */
function run(done, requestId, steps, quietMs) {
  const server = express();
  server.use(bodyParser.json());
  let index = 0;
  let listener;
  let finished = false;
  const finish = (err) => {
    if (finished) return;
    finished = true;
    listener.close(() => done(err));
  };
  server.post('/:projectId/requests/:requestId/messages', (req, res) => {
    res.send({ success: true });
    if (finished) return;
    const text = replyText(req.body);
    const step = steps[index];
    if (!step) {
      return finish(new Error("Unexpected extra message: " + text));
    }
    try {
      assert.strictEqual(text, step.expect);
    } catch (err) {
      return finish(err);
    }
    index++;
    if (step.then) {
      setTimeout(step.then, 300);
    }
    if (index === steps.length) {
      setTimeout(() => finish(), quietMs);
    }
  });
  listener = server.listen(API_PORT, '0.0.0.0');
  return listener;
}

describe('Lock ownership', () => {
  let app_listener;

  before(() => new Promise((resolve) => {
    tybot.startApp({
      bots: bots_data,
      TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT,
      API_ENDPOINT: process.env.API_ENDPOINT,
      REDIS_HOST: process.env.REDIS_HOST,
      REDIS_PORT: process.env.REDIS_PORT,
      REDIS_PASSWORD: process.env.REDIS_PASSWORD
    }, () => {
      app_listener = app.listen(SERVER_PORT, resolve);
    });
  }));

  after((done) => {
    app_listener.close(() => done());
  });

  it('an internal jump to another question does not consume the waiting one', (done) => {
    const requestId = newRequestId();
    run(done, requestId, [
      { expect: "question A?", then: () => send(requestId, '_tdinternal', '/b') },
      { expect: "question B?", then: () => send(requestId, 'A-SENDER', 'yes') },
      { expect: "B: yes" }
    ], 1500);
    send(requestId, 'A-SENDER', '/a');
  });

  it('the same for a Reply V2 reached by an internal jump', (done) => {
    const requestId = newRequestId();
    run(done, requestId, [
      { expect: "question A?", then: () => send(requestId, '_tdinternal', '/rv') },
      { expect: "choose", then: () => {
        const m = message(requestId, 'A-SENDER', 'Go');
        m.payload.attributes = { action: '#rv_done-id' };
        tilebotService.sendMessageToBot(m, BOT_ID, () => {});
      } },
      { expect: "rv done" }
    ], 1500);
    send(requestId, 'A-SENDER', '/a');
  });
});
