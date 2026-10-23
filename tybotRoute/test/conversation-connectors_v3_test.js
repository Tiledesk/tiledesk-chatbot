var assert = require('assert');
const tybot = require("../");
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
const { bots_data, ids } = require('./conversation-connectors_v3_bot.js');
const PROJECT_ID = "projectID";
const CHATBOT_TOKEN = "XXX";
const tilebotService = require('../services/TilebotService');

/**
 * Un agente V3 segue la lista dei connettori negli attributi del bot anche con i campi di
 * destinazione vuoti; un V2 con gli stessi dati li ignora e si ferma, come sempre.
 */
describe('Conversation for V3 connectors (destinations from the bot connectors list)', async () => {

  let app_listener;

  before(() => {
    return new Promise(async (resolve, reject) => {
      tybot.startApp(
        {
          bots: bots_data,
          TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT,
          API_ENDPOINT: process.env.API_ENDPOINT,
          API_URL: process.env.API_URL,
          REDIS_HOST: process.env.REDIS_HOST,
          REDIS_PORT: process.env.REDIS_PORT,
          REDIS_PASSWORD: process.env.REDIS_PASSWORD
        }, () => {
          var port = process.env.PORT || 10001;
          app_listener = app.listen(port, () => {
            winston.info('Tilebot connector listening on port ' + port);
            resolve();
          });
        });
    })
  });

  after(function (done) {
    app_listener.close(() => {
      done();
    });
  });

  /** Manda `text` al bot e raccoglie i testi delle risposte per `waitMs` dopo l'ultima arrivata. */
  function converse(botId, text, waitMs, onDone) {
    const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
    const texts = [];
    const buttons = [];
    let listener;
    let timer = null;
    const endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      const commands = message.attributes && message.attributes.commands;
      const command = commands && commands.find(c => c.type === 'message');
      texts.push(command ? command.message.text : message.text);
      buttons.push(command && command.message.attributes && command.message.attributes.attachment ? command.message.attributes.attachment.buttons : null);
      clearTimeout(timer);
      timer = setTimeout(() => listener.close(() => onDone(texts, buttons)), waitMs);
    });
    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      const request = {
        "payload": {
          "senderFullname": "guest#367e", "type": "text", "sender": "A-SENDER",
          "recipient": REQUEST_ID, "text": text, "id_project": PROJECT_ID,
          "request": { "request_id": REQUEST_ID }
        },
        "token": CHATBOT_TOKEN
      };
      tilebotService.sendMessageToBot(request, botId, () => {});
    });
  }

  it('V3: /start follows the block dot from the list although nextBlockAction.intentName is empty', (done) => {
    converse("v3botID", "/start", 1200, (texts) => {
      assert.deepStrictEqual(texts, ["Start", "Block connected!"]);
      done();
    });
  });

  it('V3: /jump follows a connect_block action from the list although intentName is empty', (done) => {
    converse("v3botID", "/jump", 1200, (texts) => {
      assert.deepStrictEqual(texts, ["Third reached!"]);
      done();
    });
  });

  it('V3: /menu sends the reply with button.action filled from the list, params included, although the JSON has no action', (done) => {
    converse("v3botID", "/menu", 1500, (texts, buttons) => {
      assert.deepStrictEqual(texts, ["Pick one"]);
      assert.strictEqual(buttons[0][0].type, 'action');
      assert.strictEqual(buttons[0][0].action, '#' + ids.THIRD_ID + '{"from":"menu"}');
      assert.strictEqual(buttons[0][1].type, 'text');
      assert.strictEqual(buttons[0][1].action, undefined);
      done();
    });
  });

  it('V3 with an empty list: /start follows the block dot still in the JSON, nothing is erased', (done) => {
    converse("v3filledID", "/start", 1200, (texts) => {
      assert.deepStrictEqual(texts, ["Start", "Block connected!"]);
      done();
    });
  });

  it('V3 with an empty list: /jump follows the intentName still in the JSON', (done) => {
    converse("v3filledID", "/jump", 1200, (texts) => {
      assert.deepStrictEqual(texts, ["Third reached!"]);
      done();
    });
  });

  it('V3 with an empty list: /menu sends the button action still in the JSON', (done) => {
    converse("v3filledID", "/menu", 1500, (texts, buttons) => {
      assert.deepStrictEqual(texts, ["Pick one"]);
      assert.strictEqual(buttons[0][0].action, '#' + ids.THIRD_ID);
      assert.strictEqual(buttons[0][1].action, undefined);
      done();
    });
  });

  it('V2 control: /menu sends the buttons as they are in the JSON, without action', (done) => {
    converse("v2botID", "/menu", 1500, (texts, buttons) => {
      assert.deepStrictEqual(texts, ["Pick one"]);
      assert.strictEqual(buttons[0][0].action, undefined);
      done();
    });
  });

  it('V2 control: the same data without dsVersion ignores the list and stops after the start reply', (done) => {
    converse("v2botID", "/start", 1500, (texts) => {
      assert.deepStrictEqual(texts, ["Start"]);
      done();
    });
  });
});
