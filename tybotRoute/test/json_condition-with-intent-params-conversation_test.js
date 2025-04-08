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
const bots_data = require('./json_condition-with-intent-params_bot.js').bots_data;

const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');
const tilebotService = require('../services/TilebotService');

describe('Conversation for JSONCondition with intent params test', async () => {

  let app_listener;
  let util = new TiledeskChatbotUtil();

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
          REDIS_PASSWORD: process.env.REDIS_PASSWORD
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

  it('/condition with params{"star_type":"supernova"}', (done) => {
    // let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command2 = message.attributes.commands[1];
    
      assert(command2.type === "message");
      assert(command2.message.text === "My name is supernova and I'm 2B km large");
      util.getChatbotParameters(REQUEST_ID, (err, params) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(params);
        //   assert(params["last_message_id"] === message_id);
          assert(params["project_id"] === PROJECT_ID);
          assert(params["star_type"] === "supernova");
          assert(params["my_name"] === "supernova");
          assert(params["size"] === "2B");
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
        //   "_id": message_id,
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/condition with params{"star_type":"supernova"}',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": CHATBOT_TOKEN
      }
      tilebotService.sendMessageToBot(request, BOT_ID, () => {
         winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('/condition with params{"star_type":"nebula"}', (done) => {
    // let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.intentName !== null);
      assert(message.attributes.intentName === "result");
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command2 = message.attributes.commands[1];
      
      assert(command2.type === "message");
      assert(command2.message.text === "My name is nebula and I'm 500k km large");
      util.getChatbotParameters(REQUEST_ID, (err, params) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(params);
        //   assert(params["last_message_id"] === message_id);
          assert(params["project_id"] === PROJECT_ID);
          assert(params["star_type"] === "nebula");
          assert(params["my_name"] === "nebula");
          assert(params["size"] === "500k");
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
        //   "_id": message_id,
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/condition with params{"star_type":"nebula"}',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": CHATBOT_TOKEN
      }
      tilebotService.sendMessageToBot(request, BOT_ID, () => {
         winston.verbose("Message sent:\n", request);
      });
    });
  });

});