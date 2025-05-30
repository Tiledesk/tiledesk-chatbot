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
const bots_data = require('./conversation-web_request_assign_json_bot.js').bots_data;
const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');
const tilebotService = require('../services/TilebotService');

describe('Conversation for WebRequest assign test', async () => {

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

  it('get traking order status from remote JSON - track number found', (done) => {
    // let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.get('/test/webrequest/get/json', async (req, res) => {
      assert(req.headers["user-agent"] === "TiledeskBotRuntime");
      assert(req.headers["content-type"] === "application/json");
      assert(req.headers["cache-control"] === "no-cache");
      const data = {
        "getShipment": {
            "result": "OK",
            "error": null,
            "version": "1.2.62",
            "elapsed": 0.034684181213378906,
            "lang": "it",
            "count": 1,
            "shipments": [
                {
                    "id": 83294706,
                    "hash": "9c8a82dd169211ee8cae42010a12f027",
                    "url": "/9c8a82dd169211ee8cae42010a12f027",
                    "reference": "TESTAlma1",
                    "trackingNumber": "NL588228465BR",
                    "isDeleted": false,
                    "isArchived": false,
                    "origin": {
                        "code": null,
                        "name": null,
                        "icon": null
                    },
                    "courier": {
                        "code": "BRAZIL-CORREIOS",
                        "name": "Brazil Correios",
                        "icon": "https://cdn.qapla.it/courier/BRAZIL-CORREIOS.svg",
                        "note": null,
                        "estimatedDeliveryDate": null,
                        "url": "http://correios.com.br/",
                        "trackingUrl": "https://www2.correios.com.br/sistemas/rastreamento/default.cfm?objetos=NL588228465BR"
                    },
                    "status": {
                        "date": null,
                        "dateISO": null,
                        "status": null,
                        "place": null,
                        "qaplaStatus": {
                            "id": 0,
                            "status": "ATTESA ELABORAZIONE",
                            "detailID": 0,
                            "detail": null,
                            "color": "#ECF0F1",
                            "icon": "https://cdn.qapla.it/status/0.svg"
                        },
                        "dateUpd": null,
                        "lastCheck": null
                    },
                    "shipDate": "2023-06-29",
                    "orderDate": null,
                    "dateIns": "2023-06-29 17:35:44",
                    "language": "it",
                    "isTrackingNumber": true,
                    "trueTrackingNumber": null,
                    "altTrackingNumber": null,
                    "newTrackingNumber": null,
                    "oldTrackingNumber": null,
                    "hasNewTrackingNumber": false,
                    "returnTrackingNumber": null,
                    "isReturnShipment": false,
                    "isCOD": false,
                    "amountText": null,
                    "amount": null,
                    "isDelivered": false,
                    "isChild": false,
                    "hasChildren": false,
                    "custom1": null,
                    "custom2": null,
                    "custom3": null,
                    "deliveryMode": null,
                    "hasFlag": false
                }
            ]
        }
      };
      res.send(data);
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command2 = message.attributes.commands[1];
      
      assert(command2.type === "message");
      assert(command2.message.text === "Lo stato del tuo ordine è ATTESA ELABORAZIONE");
      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["qapla_track_num"] === "1234");
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
          "text": '/start{"qapla_track_num": "1234"}',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          },
          "attributes": {
            "payload": {
              "lastname": "Sponziello",
              "jsondata2": {
                "a": "1",
                "b": 2
              }
            }
          }
        },
        "token": CHATBOT_TOKEN
      }
      tilebotService.sendMessageToBot(request, BOT_ID, () => {
         winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('get traking order status from remote JSON - track number NOT found', (done) => {
    // let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.get('/test/webrequest/get/json', async (req, res) => {
      assert(req.headers["user-agent"] === "TiledeskBotRuntime");
      assert(req.headers["content-type"] === "application/json");
      assert(req.headers["cache-control"] === "no-cache");
      const data = {
        "getShipment": {
          "result": "KO",
          "error": "shipment not found"
        }
      };
      res.send(data);
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command2 = message.attributes.commands[1];
      
      assert(command2.type === "message");
      assert(command2.message.text === "Il tuo stato non è valido: shipment not found");
      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["qapla_track_num"] === "1234");
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
          "text": '/start{"qapla_track_num": "1234"}',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          },
          "attributes": {
            "payload": {
              "lastname": "Sponziello",
              "jsondata2": {
                "a": "1",
                "b": 2
              }
            }
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
