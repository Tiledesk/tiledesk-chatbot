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
const bots_data = require('./conversation-message_metadata-bot.js').bots_data;

const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');
const tilebotService = require('../services/TilebotService');

describe('Conversation for message.metadata test', async () => {

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

  // it('/basic_reply_showing_metadata: returns a reply with message.metadata', (done) => {
  //   // let message_id = uuidv4();
  //   let listener;
  //   let endpointServer = express();
  //   endpointServer.use(bodyParser.json());
  //   endpointServer.get('/test/webrequest/get/json', async (req, res) => {
  //     assert(req.headers["user-agent"] === "TiledeskBotRuntime");
  //     assert(req.headers["content-type"] === "*/*");
  //     assert(req.headers["cache-control"] === "no-cache");
  //     res.send({
  //       "city": "NY",
  //       "age": 50
  //     });
  //   });
  //   endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      
  //     res.send({ success: true });
      
  //     const message = req.body;
  //     assert(message.attributes.commands !== null);
  //     assert(message.attributes.commands.length === 2);
  //     const command1 = message.attributes.commands[1];
    
  //     assert(command1.type === "message");
  //     assert(command1.message.text === "message type: image message text: /basic_reply_showing_metadata message.metadata.src: http://image_src");
  //     assert(command1.type === "message");
  //     getChatbotParameters(REQUEST_ID, (err, params) => {
  //       if (err) {
  //         assert.ok(false);
  //       }
  //       else {
  //         assert(params);
  //         assert(params["lastUserMessage"] !== null);
  //         assert(params["lastUserMessage"]["metadata"]["src"] === "http://image_src");
  //         listener.close(() => {
  //           done();
  //         });
  //       }
  //     });
  //   });

  //   listener = endpointServer.listen(10002, '0.0.0.0', () => {
  //     winston.verbose('endpointServer started' + listener.address());
  //     let request = {
  //       "payload": {
  //       //   "_id": message_id,
  //         "senderFullname": "guest#367e",
  //         "type": "image",
  //         "sender": "A-SENDER",
  //         "recipient": REQUEST_ID,
  //         "text": "/basic_reply_showing_metadata",
  //         "id_project": PROJECT_ID,
  //         "metadata": {
  //           src: "http://image_src"
  //         },
  //         "request": {
  //           "request_id": REQUEST_ID
  //         }
  //       },
  //       "token": CHATBOT_TOKEN
  //     }
  //     tilebotService.sendMessageToBot(request, BOT_ID, () => {
  //        winston.verbose("Message sent:\n", request);
  //     });
  //   });
  // });

  it('/condition with json metadata: evaluates message.metadata', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === "it's true");
      assert(command1.type === "message");
      util.getChatbotParameters(REQUEST_ID, (err, params) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(params);
          assert(params["lastUserMessage"] !== null);
          assert(params["lastUserMessage"]["metadata"]["src"] === "http://image_src");
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
          "type": "image",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": "/condition with json metadata",
          "id_project": PROJECT_ID,
          "metadata": {
            src: "http://image_src"
          },
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