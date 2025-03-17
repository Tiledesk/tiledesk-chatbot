var assert = require('assert');
let axios = require('axios');
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
const tilebotService = require('../services/TilebotService');
const bots_data = require('./conversation-form_bot.js').bots_data;

const PROJECT_ID = "projectID"; //const PROJECT_ID = process.env.TEST_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID";
const CHATBOT_TOKEN = process.env.CHATBOT_TOKEN;

let app_listener;

describe('Conversation1 - Form filling', async () => {

  before(() => {
    return new Promise(async (resolve, reject) => {
      winston.info("Starting tilebot server...");
      tybot.startApp(
        {
          // MONGODB_URI: process.env.MONGODB_URI,
          bots: bots_data,
          TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT,
          API_ENDPOINT: process.env.API_ENDPOINT,
          REDIS_HOST: process.env.REDIS_HOST,
          REDIS_PORT: process.env.REDIS_PORT,
          REDIS_PASSWORD: process.env.REDIS_PASSWORD,
          log: process.env.TILEBOT_LOG
        }, () => {
          winston.info("Tilebot route successfully started.");
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

  it('/locked', (done) => {
    let request0_uuid = uuidv4();
    let request1_uuid = uuidv4();
    let request2_uuid = uuidv4();
    let request3_uuid = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      if (message.text.startsWith("Hi welcome to this dialog.")) {
        let request = {
          "payload": {
            "_id": request1_uuid,
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": "/dialog_question2",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
              // "id_project": PROJECT_ID
            }
          },
          "token": CHATBOT_TOKEN
        }
        tilebotService.sendMessageToBot(request, BOT_ID, () => {
          winston.verbose("Message sent.", request);
        });
      }
      else if (message.text.startsWith("As I told you,")) {
        let request = {
          "payload": {
            "_id": request2_uuid,
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": "/dialog_question3",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
              // "id_project": PROJECT_ID
            }
          },
          "token": CHATBOT_TOKEN
        }
        tilebotService.sendMessageToBot(request, BOT_ID, () => {
          winston.verbose("Message sent.", request);
        });
      }
      else if (message.text.startsWith("And now tell me,")) {
        let request = {
          "payload": {
            "_id": request3_uuid,
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": "/dialog_question4",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
              // "id_project": PROJECT_ID
            }
          },
          "token": CHATBOT_TOKEN
        }
        tilebotService.sendMessageToBot(request, BOT_ID, () => {
          winston.verbose("Message sent ", request);
        });
      }
      else if (message.text.startsWith("Well, survey completed!")) {
        listener.close(() => {
          done();
        });
      }

    });

    listener = endpointServer.listen(10002, '0.0.0.0', function () {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "_id": request0_uuid,
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": "/dialog_start",
          "id_project": PROJECT_ID,
          "request": {
            "request_id": REQUEST_ID,
            // "id_project": PROJECT_ID
          }
        },
        "token": CHATBOT_TOKEN
      }
      tilebotService.sendMessageToBot(request, BOT_ID, () => {
        winston.verbose("Message sent.");
      });
    });
  });
});