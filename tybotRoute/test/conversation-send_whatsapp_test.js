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
const bots_data = require('./conversation-send_whatsapp_bot.js').bots_data;
const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');
const tilebotService = require('../services/TilebotService');

let SERVER_PORT = 10001

describe('Conversation for GptTask test', async () => {

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

  it('/send_whatsapp - Success', (done) => {

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
      assert(command2.message.text === "Whatsapp message sent successfully");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.post('/modules/whatsapp/api/tiledesk/broadcast', function (req, res) {

      assert(req.body.receiver_list.length === 1);
      assert(req.body.broadcast === false);
      
      let receiver = req.body.receiver_list[0];
      assert(receiver.phone_number === '+393485566777');
      assert(receiver.body_params[0].text === 'Giacomo');

      let reply = {
        success: true,
        message: "Job started. Send messages in queue."
      };
      let http_code = 200;

      res.status(http_code).send(reply);
    })

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/send_whatsapp{"firstname":"Giacomo", "phone_number": "+393485566777"}',
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

  it('/send_whatsapp_advanced - Success', (done) => {

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
      assert(command2.message.text === "Whatsapp message sent successfully");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.post('/modules/whatsapp/api/tiledesk/broadcast', function (req, res) {

      assert(req.body.receiver_list.length === 1);
      assert(req.body.broadcast === false);

      let receiver = req.body.receiver_list[0];
      assert(receiver.phone_number === '+393485566777');
      assert(receiver.header_params[0].type === 'IMAGE');
      assert(receiver.header_params[0].image.link === 'https://img.repo.com/car.png');
      assert(receiver.body_params[0].text === 'Giacomo');
      assert(receiver.body_params[1].text === 'bmw');
      assert(receiver.buttons_params[0].text === 'user1234');

      let reply = {
        success: true,
        message: "Job started. Send messages in queue."
      };
      let http_code = 200;

      res.status(http_code).send(reply);
    })

  

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/send_whatsapp_advanced{"image_url": "https://img.repo.com/car.png", "firstname":"Giacomo", "car_model": "bmw", "token": "user1234", "phone_number": "+393485566777"}',
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


})