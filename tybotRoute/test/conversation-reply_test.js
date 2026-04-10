var assert = require('assert');
let axios = require('axios');
const tybot = require("../index.js");
const tybotRoute = tybot.router;
var express = require('express');
var app = express();
const winston = require('../utils/winston.js');
app.use("/", tybotRoute);
app.use((err, req, res, next) => {
  winston.error("General error", err);
});
require('dotenv').config();
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const bots_data = require('./conversation-reply_bot.js').bots_data;
const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil.js');
const tilebotService = require('../services/TilebotService.js');

let SERVER_PORT = 10001

describe('Conversation for Reply test', async () => {

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
            REDIS_PASSWORD: process.env.REDIS_PASSWORD
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

  it('/reply success (type text)', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;

      const command0 = message.attributes.commands[0];
      assert(command0.type === "wait");
      assert(command0.time === 500);

      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === 'A chat message will be sent to the visitor');
      assert(command1.message.type === "text");

     
      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {

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
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/text',
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

  it('/reply success (type image)', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;

      const command0 = message.attributes.commands[0];
      assert(command0.type === "wait");
      assert(command0.time === 500);

      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === '');
      assert(command1.message.type === "image");
      assert(command1.message.metadata.src !== null);
      assert(command1.message.metadata.name !== null);
      assert(command1.message.metadata.downloadURL !== null);
      assert(command1.message.metadata.height !== null);
      assert(command1.message.metadata.width !== null);
      assert(command1.message.metadata.type !== null);
      assert(command1.message.metadata.size !== null);

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {

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
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/image',
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

  it('/reply success (type frame)', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;

      const command0 = message.attributes.commands[0];
      assert(command0.type === "wait");
      assert(command0.time === 500);

      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === '');
      assert(command1.message.type === "frame");
      assert(command1.message.metadata.src !== null);
      assert(command1.message.metadata.height !== null);
      assert(command1.message.metadata.width !== null);

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {

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
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/frame',
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

  it('/reply success (type gallery)', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;

      const command0 = message.attributes.commands[0];
      assert(command0.type === "wait");
      assert(command0.time === 500);

      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === 'This is a gallery text message');
      assert(command1.message.type === "gallery");
      assert(command1.message.attributes.attachment.type === "gallery");
      assert(command1.message.attributes.attachment.gallery.length === 2);
      assert(command1.message.attributes.attachment.gallery[0].preview.src !== null);
      assert(command1.message.attributes.attachment.gallery[0].preview.name !== null);
      assert(command1.message.attributes.attachment.gallery[0].preview.width !== null);
      assert(command1.message.attributes.attachment.gallery[0].preview.height !== null);
      assert(command1.message.attributes.attachment.gallery[0].preview.type !== null);
      assert(command1.message.attributes.attachment.gallery[0].preview.size !== null);
      assert(command1.message.attributes.attachment.gallery[1].preview.src !== null);
      assert(command1.message.attributes.attachment.gallery[1].preview.name !== null);
      assert(command1.message.attributes.attachment.gallery[1].preview.width !== null);
      assert(command1.message.attributes.attachment.gallery[1].preview.height !== null);
      assert(command1.message.attributes.attachment.gallery[1].preview.type !== null);
      assert(command1.message.attributes.attachment.gallery[1].preview.size !== null);
      assert(command1.message.attributes.attachment.gallery[0].buttons.length === 1);
      assert(command1.message.attributes.attachment.gallery[0].buttons[0].type === "text");
      assert(command1.message.attributes.attachment.gallery[0].buttons[0].value === "Button");
      assert(command1.message.attributes.attachment.gallery[1].buttons.length === 1);
      assert(command1.message.attributes.attachment.gallery[1].buttons[0].type === "text");
      assert(command1.message.attributes.attachment.gallery[1].buttons[0].value === "Button");
      assert(command1.message.attributes.attachment.gallery[0].title === "Type title 1");
      assert(command1.message.attributes.attachment.gallery[0].description === "Type description 1");
      assert(command1.message.attributes.attachment.gallery[1].title === "Type title 2");
      assert(command1.message.attributes.attachment.gallery[1].description === "Type description 2");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
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
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/gallery',
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

  it('/reply success (type redirect)', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;

      const command0 = message.attributes.commands[0];
      assert(command0.type === "wait");
      assert(command0.time === 500);

      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === '');
      assert(command1.message.type === "redirect");
      assert(command1.message.metadata.src !== null);
      assert(command1.message.metadata.downloadURL !== null);
      assert(command1.message.metadata.target === "blank");
      assert(command1.message.metadata.type === "redirect");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
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
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/redirect',
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

  it('/reply success (type tts)', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      
      const command0 = message.attributes.commands[0];
      assert(command0.type === "wait");
      assert(command0.time === 500);
      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === 'This message will be played as audio');
      assert(command1.message.type === "tts");
      assert(command1.message.metadata.type === "audio/mp3");
      assert(command1.message.metadata.src !== null);
      assert(command1.message.metadata.uid !== null);
      assert(command1.message.metadata.filename !== null);
      
      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          listener.close(() => {
            done();
          });
        }
      });
    });

    endpointServer.post('/:projectId/llm/speech', function (req, res) {
      res.send({ 
        "message": "Speech audio saved successfully",
        "filename": "uploads%2Fusers%2F65c5e20d0f1c9b0013973e8a%2Ffiles%2F0fc73b0b-a160-4917-aae9-0fa3a2f38895%2Fspeech.mp3",
        "contentType": "audio/mp3"
       });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/tts',
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