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
const bots_data = require('./conversation-data_table_bot.js').bots_data;
const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');
const tilebotService = require('../services/TilebotService');
const path = require('path');

let SERVER_PORT = 10001

describe('Conversation for AskGPTV2 test', async () => {

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

  it('/get_rows - invokes the askgpt mockup and test the returning attributes', (done) => {

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

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["data_table_result"] !== null);
          assert(typeof attributes["data_table_result"] === "object");
          assert(attributes["data_table_result"].length === 1);
          assert(attributes["data_table_result"][0].id === "1");
          assert(attributes["data_table_result"][0].name === "John Doe");
          assert(attributes["data_table_result"][0].city === "New York");
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.get('/:projectId/tables/:tableId/rows/list', function (req, res) {

      let conditionsObj = JSON.parse(req.query.conditions);

      assert(req.params.tableId === "tableId");
      assert(conditionsObj.length === 1);
      assert(conditionsObj[0].column === "fullname");
      assert(conditionsObj[0].value === "John Doe");
      assert(conditionsObj[0].operator === "equals");

      let http_code = 200;
      let result = [
        {
          "id": "1",
          "name": "John Doe",
          "city": "New York"
        }
      ]
      res.status(http_code).send(result);
    })


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/data_table_get_success',
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

  it('/insert_row - invokes the askgpt mockup and test the returning attributes', (done) => {

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

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["data_table_result"] !== null);
          assert(typeof attributes["data_table_result"] === "object");
          assert(attributes["data_table_result"].fullname === "John Doe");
          assert(attributes["data_table_result"].city === "New York");

          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.post('/:projectId/tables/:tableId/row/insert', function (req, res) {

      let http_code = 200;
      let result = {
        "_id": "1",
        "id_project": PROJECT_ID,
        "id_table": "tableId",
        "data": {
          "fullname": "John Doe",
          "city": "New York"
        },
        "createdAt": "2026-06-08T10:02:49.602Z",
        "updatedAt": "2026-06-08T10:02:49.602Z"
      }

      res.status(http_code).send(result);
    })


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/data_table_insert_success',
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

  it('/update_row - invokes the askgpt mockup and test the returning attributes', (done) => {

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

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["data_table_result"] !== null);
          assert(typeof attributes["data_table_result"] === "object");
          assert(attributes["data_table_result"].fullname === "John Doe");
          assert(attributes["data_table_result"].city === "Los Angeles");

          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.put('/:projectId/tables/:tableId/row/update', function (req, res) {

      assert(req.params.tableId === "tableId");
      assert(req.body.must_match === "all");
      assert(req.body.conditions.length === 1);
      assert(req.body.conditions[0].column === "fullname");
      assert(req.body.conditions[0].value === "John Doe");
      assert(req.body.conditions[0].operator === "equals");
      assert(req.body.data.city === "Los Angeles");

      let http_code = 200;
      let result = {
        "_id": "1",
        "id_project": PROJECT_ID,
        "id_table": "tableId",
        "data": {
          "fullname": "John Doe",
          "city": "Los Angeles"
        },
        "createdAt": "2026-06-08T10:02:49.602Z",
        "updatedAt": "2026-06-08T10:02:49.602Z"
      }

      res.status(http_code).send(result);
    })


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/data_table_update_success',
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

  it('/upsert_row - invokes the askgpt mockup and test the returning attributes', (done) => {

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

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["data_table_result"] !== null);
          assert(typeof attributes["data_table_result"] === "object");
          assert(attributes["data_table_result"].fullname === "John Doe");
          assert(attributes["data_table_result"].city === "Los Angeles");

          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.put('/:projectId/tables/:tableId/row/upsert', function (req, res) {

      assert(req.params.tableId === "tableId");
      assert(req.body.must_match === "all");
      assert(req.body.conditions.length === 1);
      assert(req.body.conditions[0].column === "fullname");
      assert(req.body.conditions[0].value === "John Doe");
      assert(req.body.conditions[0].operator === "equals");
      assert(req.body.data.city === "Los Angeles");

      let http_code = 200;
      let result = {
        "_id": "1",
        "id_project": PROJECT_ID,
        "id_table": "tableId",
        "data": {
          "fullname": "John Doe",
          "city": "Los Angeles"
        },
        "createdAt": "2026-06-08T10:02:49.602Z",
        "updatedAt": "2026-06-08T10:02:49.602Z"
      }

      res.status(http_code).send(result);
    })


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/data_table_upsert_success',
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

  it('/delete_row - invokes the askgpt mockup and test the returning attributes', (done) => {

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

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["data_table_result"] !== null);
          assert(typeof attributes["data_table_result"] === "object");
          assert(attributes["data_table_result"].fullname === "John Doe");
          assert(attributes["data_table_result"].city === "New York");

          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.put('/:projectId/tables/:tableId/row/delete', function (req, res) {

      assert(req.params.tableId === "tableId");
      assert(req.body.must_match === "all");
      assert(req.body.conditions.length === 2);
      assert(req.body.conditions[0].column === "fullname");
      assert(req.body.conditions[0].value === "John Doe");
      assert(req.body.conditions[0].operator === "equals");
      assert(req.body.conditions[1].column === "city");
      assert(req.body.conditions[1].value === "New York");
      assert(req.body.conditions[1].operator === "equals");


      let http_code = 200;
      let result = {
        "_id": "1",
        "id_project": PROJECT_ID,
        "id_table": "tableId",
        "data": {
          "fullname": "John Doe",
          "city": "New York"
        },
        "createdAt": "2026-06-08T10:02:49.602Z",
        "updatedAt": "2026-06-08T10:02:49.602Z"
      }

      res.status(http_code).send(result);
    })


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/data_table_delete_success',
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