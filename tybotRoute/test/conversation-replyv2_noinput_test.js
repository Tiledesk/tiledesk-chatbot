var assert = require('assert');
let axios = require('axios');
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
const bots_data = require('./conversation-replyv2_noinput_bot.js').bots_data;
const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');
const tilebotService = require('../services/TilebotService');

let SERVER_PORT = 10001

describe('Conversation for Reply v2 test (noInput)', async () => {

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
            REDIS_PASSWORD: process.env.REDIS_PASSWORD,
            log: process.env.TILEBOT_LOG
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

  it('reply with noInput connected AND no user interaction', (done) => {
    winston.info("Wait a little (~2s)...");
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;

      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const first_reply = message.attributes.commands[1];
      assert(first_reply.type === "message");
      const reply = first_reply.message.text;
      if (reply === "Please select an option") {

        // let request = {
        //   "payload": {
        //     "_id": "message_id2",
        //     "senderFullname": "guest#367e",
        //     "type": "text",
        //     "sender": "A-SENDER",
        //     "recipient": REQUEST_ID,
        //     "text": "one",
        //     "id_project": PROJECT_ID,
        //     "request": {
        //       "request_id": REQUEST_ID,
        //     }
        //   },
        //   "token": CHATBOT_TOKEN
        // }
        // tilebotService.sendMessageToBot(request, BOT_ID, () => {
        // });
      }
      else if (reply === "No user interaction") {
        listener.close(() => {
          done();
        });
      }
      else {
        winston.error("Unexpected message.");
        assert.ok(false);
      }
    });


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/buttons',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": "XXX"
      }
      tilebotService.sendMessageToBot(request, BOT_ID, () => {
         winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('reply with noInput connected AND user interaction', (done) => {
    winston.info("Wait a little (~3s)...");
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;

      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const first_reply = message.attributes.commands[1];
      assert(first_reply.type === "message");
      const reply = first_reply.message.text;
      if (reply === "Please select an option") {
        let request = {
          "payload": {
            "_id": "message_id2",
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": "one",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
            }
          },
          "token": CHATBOT_TOKEN
        }
        tilebotService.sendMessageToBot(request, BOT_ID, () => {
        });
      }
      else if (reply === "option one") {
        setTimeout(() => {
          listener.close(() => {
            done();
          });
        }, 3000);
      }
      else if (reply === "No user interaction") {
        winston.warn("THIS MESSAGE SHOULD NOT BE RECEIVED");
        assert.ok(false);
      }
      else {
        winston.error("Unexpected message.");
        assert.ok(false);
      }
    });


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/buttons',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": "XXX"
      }
      tilebotService.sendMessageToBot(request, BOT_ID, () => {
         winston.verbose("Message sent:\n", request);
      });
    });
  });

});
