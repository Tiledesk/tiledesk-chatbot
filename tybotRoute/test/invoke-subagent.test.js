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
const bots_data = require('./invoke-subagent_bot_parent').bots_data;
const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID";
const CHATBOT_TOKEN = "XXX";
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');
const tilebotService = require('../services/TilebotService');

let SERVER_PORT = 10001

describe('Conversation for AiPrompt test', async () => {

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
          }, () => {
            winston.info("Tilebot route successfully started.");
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

  describe('Subagent tests', async () => {

    it('Invoking the internal Subagent', (done) => {
      
      let listener;
      let endpointServer = express();
      endpointServer.use(bodyParser.json());
      let settleTimer = null;

      endpointServer.post('/:projectId/requests/:requestId/messages', (req, res) => {
        res.send({ success: true });
        const message = req.body;
        assert(message.attributes.commands !== null);
        assert(message.attributes.commands.length === 2);
        const command2 = message.attributes.commands[1];
        assert(command2.type === "message");

        if (command2.message.text !== "Hi, how can I help you?") {
          util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
            if (err) {
              assert.ok(false);
            }
            else {
              console.log("attributes: ", attributes);
              console.log("subagent_result: ", attributes.subagent_result);
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
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": '/start',
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

    }).timeout(10000);

  })
  
});

/**
 * A stub to get the request parameters, hosted by tilebot on:
 * /${TILEBOT_ROUTE}/ext/parameters/requests/${requestId}?all
 *
 * @param {string} requestId. Tiledesk chatbot/requestId parameters
 */
function getChatbotParameters(requestId, callback) {
  const url = `${process.env.TILEBOT_ENDPOINT}/ext/parameters/requests/${requestId}?all`;
  const HTTPREQUEST = {
    url: url,
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'get'
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
    }
  );
}

function myrequest(options, callback) {
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
