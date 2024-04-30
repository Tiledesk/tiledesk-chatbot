var assert = require('assert');
let axios = require('axios');
const tybot = require("../");
const tybotRoute = tybot.router;
var express = require('express');
var app = express();
app.use("/", tybotRoute);
app.use((err, req, res, next) => {
  console.error("General error", err);
});
require('dotenv').config();
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const bots_data = require('./conversation-web_request_assign_json_bot.js').bots_data;
// console.log("bots_data", bots_data)
const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;
const { TiledeskChatbotUtil } = require('../models/TiledeskChatbotUtil');

describe('Conversation for WebRequest assign test', async () => {

  let app_listener;
  let util = new TiledeskChatbotUtil();
  
  before(() => {
    return new Promise(async (resolve, reject) => {
      console.log("Starting tilebot server...");
      tybot.startApp(
        {
          // MONGODB_URI: process.env.mongoUrl,
          bots: bots_data,
          API_ENDPOINT: process.env.API_ENDPOINT,
          REDIS_HOST: process.env.REDIS_HOST,
          REDIS_PORT: process.env.REDIS_PORT,
          REDIS_PASSWORD: process.env.REDIS_PASSWORD,
          log: process.env.TILEBOT_LOG
        }, () => {
          console.log("Tilebot route successfully started.");
          var port = process.env.PORT || 10001;
          app_listener = app.listen(port, () => {
            console.log('Tilebot connector listening on port ', port);
            resolve();
          });
        });
    })
  });

  after(function (done) {
    app_listener.close(() => {
      // console.log('ACTIONS app_listener closed.');
      done();
    });
  });

  it('get traking order status from remote JSON - track number found', (done) => {
    // console.log('/start{"user_language", "it"}');
    // let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.get('/test/webrequest/get/json', async (req, res) => {
      // console.log("/webrequest_with_assignments GET req.headers:", req.headers);
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
      // console.log("get traking order status from remote JSON ...req.body:", JSON.stringify(req.body));
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
          // console.log("final attributes:", JSON.stringify(attributes));
          assert(attributes);
          assert(attributes["qapla_track_num"] === "1234");
          listener.close(() => {
            done();
          });
        }
      });

    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      // console.log('endpointServer started', listener.address());
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
      sendMessageToBot(request, BOT_ID, () => {
        // console.log("Message sent:\n", request);
      });
    });
  });

  it('get traking order status from remote JSON - track number NOT found', (done) => {
    // console.log('/start{"user_language", "it"}');
    // let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.get('/test/webrequest/get/json', async (req, res) => {
      // console.log("/webrequest_with_assignments GET req.headers:", req.headers);
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
      // console.log("get traking order status from remote JSON - track number NOT found ...req.body:", JSON.stringify(req.body));
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
          // console.log("final attributes:", JSON.stringify(attributes));
          assert(attributes);
          assert(attributes["qapla_track_num"] === "1234");
          listener.close(() => {
            done();
          });
        }
      });

    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      // console.log('endpointServer started', listener.address());
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
      sendMessageToBot(request, BOT_ID, () => {
        // console.log("Message sent:\n", request);
      });
    });
  });

});

/**
 * A stub to send message to the "ext/botId" endpoint, hosted by tilebot on:
 * /${TILEBOT_ROUTE}/ext/${botId}
 *
 * @param {Object} message. The message to send
 * @param {string} botId. Tiledesk botId
 * @param {string} token. User token
 */
function sendMessageToBot(message, botId, callback) {
  // const jwt_token = this.fixToken(token);
  const url = `${process.env.TYBOT_ENDPOINT}/ext/${botId}`;
  // console.log("sendMessageToBot URL", url);
  const HTTPREQUEST = {
    url: url,
    headers: {
      'Content-Type': 'application/json'
    },
    json: message,
    method: 'POST'
  };
  myrequest(
    HTTPREQUEST,
    function (err, resbody) {
      if (err) {
        if (callback) {
          callback(err);
        }
      }
      else {
        if (callback) {
          callback(null, resbody);
        }
      }
    }, false
  );
}

/**
 * A stub to get the request parameters, hosted by tilebot on:
 * /${TILEBOT_ROUTE}/ext/parameters/requests/${requestId}?all
 *
 * @param {string} requestId. Tiledesk chatbot/requestId parameters
 */
// function getChatbotParameters(requestId, callback) {
//   // const jwt_token = this.fixToken(token);
//   const url = `${process.env.TYBOT_ENDPOINT}/ext/parameters/requests/${requestId}?all`;
//   const HTTPREQUEST = {
//     url: url,
//     headers: {
//       'Content-Type': 'application/json'
//     },
//     method: 'get'
//   };
//   myrequest(
//     HTTPREQUEST,
//     function (err, resbody) {
//       if (err) {
//         if (callback) {
//           callback(err);
//         }
//       }
//       else {
//         if (callback) {
//           callback(null, resbody);
//         }
//       }
//     }, false
//   );
// }

function myrequest(options, callback, log) {
  if (log) {
    console.log("API URL:", options.url);
    console.log("** Options:", JSON.stringify(options));
  }
  axios(
    {
      url: options.url,
      method: options.method,
      data: options.json,
      params: options.params,
      headers: options.headers
    })
    .then((res) => {
      if (log) {
        console.log("Response for url:", options.url);
        console.log("Response headers:\n", JSON.stringify(res.headers));
        //console.log("******** Response for url:", res);
      }
      if (res && res.status == 200 && res.data) {
        if (callback) {
          callback(null, res.data);
        }
      }
      else {
        if (callback) {
          callback(TiledeskClient.getErr({ message: "Response status not 200" }, options, res), null, null);
        }
      }
    })
    .catch((error) => {
      console.error("An error occurred:", error);
      if (callback) {
        callback(error, null, null);
      }
    });
}
