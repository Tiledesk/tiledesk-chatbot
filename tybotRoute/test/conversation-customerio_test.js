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
const bots_data = require('./conversation-customerio_bot.js').bots_data;
const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');
const tilebotService = require('../services/TilebotService.js');

let SERVER_PORT = 10001

describe('Conversation for customerio test', async () => {

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
            winston.info("Tilebot route successfully started.",);
            var port = SERVER_PORT;
            app_listener = app.listen(port, () => {
              winston.info('Tilebot connector listening on port ', port);
              resolve();
            });
          });
      }
      catch (error) {
        winston.error("error: ", error)
      }

    })
  });

  after(function (done) {
    app_listener.close(() => {
      done();
    });
  });

  it('/customerio success', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === 'customerio status is: 204');

      const command2 = message.attributes.commands[2];
      assert(command2.type === "message");
      assert(command2.message.text === 'customerio error is: null');

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["customerio_status"] === 204);
          assert(attributes["customerio_error"] === null);
          listener.close(() => {
            done();
          });
        }
      });
    });

    endpointServer.get('/:project_id/integration/name/:name', function (req, res) {

      assert(req.params.name) === 'customerio';
      let http_code = 200;
      let reply = {
        _id: "656728224b45965b69111111",
        id_project: "62c3f10152dc740035000000",
        name: "customerio",
        value: {
          apikey: "example_api_key"
        }
      }
      res.status(http_code).send(reply);
    });


    endpointServer.post('/api/v1/forms/:formid/submit', function (req, res) {
      res.sendStatus(204);
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started: ' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/customerio#SUCCESS',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          },
        },
        "token": "XXX"
      }
      tilebotService.sendMessageToBot(request, BOT_ID, () => {
        winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('/customerio failure - return code 401', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["customerio_status"] === 401);
          assert(attributes["customerio_error"] === "Unauthorized request");
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.get('/:project_id/integration/name/:name', function (req, res) {
      let http_code = 200;
      let reply = {
        _id: "656728224b45965b69111111",
        id_project: "62c3f10152dc740035000000",
        name: "customerio",
        value: {
          apikey: "example_api_key"
        }
      }
      res.status(http_code).send(reply);
    });

    endpointServer.post('/api/v1/forms/:formid/submit', function (req, res) {
      let http_code = 401;
      let reply = {
        "meta": {
          "error": "Unauthorized request"
        }
      }
      res.status(http_code).send(reply);
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/customerio#FAILUREACCESSTOKEN',
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

  it('/customerio failure - return code 400', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["customerio_status"] === 400);
          assert(attributes["customerio_error"] === "invalid email identifier");
          listener.close(() => {
            done();
          });
        }
      });

    });
    endpointServer.get('/:project_id/integration/name/:name', function (req, res) {
      let http_code = 200;
      let reply = {
        _id: "656728224b45965b69111111",
        id_project: "62c3f10152dc740035000000",
        name: "customerio",
        value: {
          apikey: "example_api_key"
        }
      }
      res.status(http_code).send(reply);
    });

    endpointServer.post('/api/v1/forms/:formid/submit', function (req, res) {
      let http_code = 400;
      let reply = {
        "meta": {
          "error": "invalid email identifier"
        }
      }
      res.status(http_code).send(reply);
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started', listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/customerio#FAILUREEMAIL',
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
