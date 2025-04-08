var assert = require('assert');
let axios = require('axios');
const tybot = require("../index.js");
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
const bots_data = require('./conversation-message-hidden-bot.js').bots_data;

const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil.js');
const tilebotService = require('../services/TilebotService.js');

describe('Conversation for Hidden message test', async () => {

  let app_listener;
  let util = new TiledeskChatbotUtil();

  before(() => {
    return new Promise(async (resolve, reject) => {
      winston.info("Starting tilebot server...");
      tybot.startApp(
        {
          // MONGODB_URI: process.env.mongoUrl,
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


  it('Send hidden message --> request.draft = true ', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes);
      assert.equal(message.attributes.subtype, 'info');
      assert.equal(message.text, 'this is an hidden message');
    
      util.getChatbotParameters(REQUEST_ID, (err, params) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(params);
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
          "text": "/send_hidden_message",
          "id_project": PROJECT_ID,
          "request": {
            "request_id": REQUEST_ID,
            "draft": true
          }
        },
        "token": CHATBOT_TOKEN
      }
      tilebotService.sendMessageToBot(request, BOT_ID, () => {
         winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('Send hidden message --> request.draft = false ', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      if(message.text = 'hidden message not sent: ok'){
        
        assert(message.attributes.commands !== null);
        assert(message.attributes.commands.length === 2);
        const command1 = message.attributes.commands[1];
      
        assert(command1.type === "message");
        assert(command1.message.text === "hidden message not sent: ok");

        util.getChatbotParameters(REQUEST_ID, (err, params) => {
          if (err) {
            assert.ok(false);
          }
          else {
            assert(params);
            listener.close(() => {
              done();
            });
          }
        });
        
      }
    
      
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
          "text": "/no_draft",
          "id_project": PROJECT_ID,
          "request": {
            "request_id": REQUEST_ID,
            "draft": false
          }
        },
        "token": CHATBOT_TOKEN
      }
      tilebotService.sendMessageToBot(request, BOT_ID, () => {
         winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('Send hidden message --> request.draft NOT EXIST ', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {

      res.send({ success: true });      
      const message = req.body;
      if(message.text = 'hidden message not sent: ok'){
        
        assert(message.attributes.commands !== null);
        assert(message.attributes.commands.length === 2);
        const command1 = message.attributes.commands[1];
      
        assert(command1.type === "message");
        assert(command1.message.text === "hidden message not sent: ok");

        util.getChatbotParameters(REQUEST_ID, (err, params) => {
          if (err) {
            assert.ok(false);
          }
          else {
            assert(params);
            listener.close(() => {
              done();
            });
          }
        });

      }
    
      
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
          "text": "/no_draft",
          "id_project": PROJECT_ID,
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