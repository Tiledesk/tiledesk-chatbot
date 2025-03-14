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
const bots_data = require('./conversation-replyv2_button_match_bot.js').bots_data;
const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;
const { TiledeskChatbotUtil } = require('../models/TiledeskChatbotUtil');

let SERVER_PORT = 10001

describe('Conversation for Reply v2 test', async () => {

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

  it('reply with text "one" to action button "one"', (done) => {
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
        sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
        });
      }
      else if (reply === "option one") {
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
      sendMessageToBot(request, BOT_ID, () => {
         winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('reply with a wrong (no button matching) text invoking the no-match block', (done) => {
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
            "text": "no button text => no match",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
            }
          },
          "token": CHATBOT_TOKEN
        }
        sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
        });
      }
      else if (reply === "no matching button text found") {
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
      sendMessageToBot(request, BOT_ID, () => {
         winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('reply with a wrong (no button matching) text and no "no-match block" configured. It moves to the defaultFallback', (done) => {
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
            "text": "no button text => no match",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
            }
          },
          "token": CHATBOT_TOKEN
        }
        sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
        });
      }
      else if (reply === "no button text => no match reply") {
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
          "text": '/buttons-without-nomatch',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": "XXX"
      }
      sendMessageToBot(request, BOT_ID, () => {
         winston.verbose("Message sent:\n", request);
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
   
  const url = `http://localhost:${SERVER_PORT}/ext/${botId}`;
  winston.verbose("sendMessageToBot URL" + url);
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
//    
//   const url = `${process.env.TILEBOT_ENDPOINT}/ext/parameters/requests/${requestId}?all`;
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
  axios(
    {
      url: options.url,
      method: options.method,
      data: options.json,
      params: options.params,
      headers: options.headers
    })
    .then((res) => {
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
      if (callback) {
        callback(error, null, null);
      }
    });
}
