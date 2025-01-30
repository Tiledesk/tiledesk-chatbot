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
const bots_data = require('./conversation-form_bot.js').bots_data;

const PROJECT_ID = "projectID"; //const PROJECT_ID = process.env.TEST_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID";
const CHATBOT_TOKEN = process.env.CHATBOT_TOKEN;

let app_listener;

describe('Conversation1 - Form filling', async () => {

  before(() => {
    return new Promise(async (resolve, reject) => {
      console.log("Starting tilebot server...");
      tybot.startApp(
        {
          // MONGODB_URI: process.env.MONGODB_URI,
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
      // console.log('CONVERSATION FORM app_listener closed.');
      done();
    });
  });

  it('/locked', (done) => {
    // console.log("/locked...");
    let request0_uuid = uuidv4();
    let request1_uuid = uuidv4();
    let request2_uuid = uuidv4();
    let request3_uuid = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      if (message.text.startsWith("Hi welcome to this dialog.")) {
        // console.log("got #0 sending #1", message.text);
        let request = {
          "payload": {
            "_id": request1_uuid,
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": "/dialog_question2",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
              // "id_project": PROJECT_ID
            }
          },
          "token": CHATBOT_TOKEN
        }
        sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
          // console.log("Message sent.", request);
        });
      }
      else if (message.text.startsWith("As I told you,")) {
        // console.log("got #1 sending #2", message.text);
        let request = {
          "payload": {
            "_id": request2_uuid,
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": "/dialog_question3",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
              // "id_project": PROJECT_ID
            }
          },
          "token": CHATBOT_TOKEN
        }
        sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
          // console.log("Message sent4.", request);
        });
      }
      else if (message.text.startsWith("And now tell me,")) {
        // console.log("got #2 sending #3", message.text);
        let request = {
          "payload": {
            "_id": request3_uuid,
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": "/dialog_question4",
            "id_project": PROJECT_ID,
            "request": {
              "request_id": REQUEST_ID,
              // "id_project": PROJECT_ID
            }
          },
          "token": CHATBOT_TOKEN
        }
        sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
          // console.log("Message sent5.", request);
        });
      }
      else if (message.text.startsWith("Well, survey completed!")) {
        // console.log("got #4. End.", message.text);
        listener.close(() => {
          done();
        });
      }

    });

    listener = endpointServer.listen(10002, '0.0.0.0', function () {
      // console.log('endpointServer started', listener.address());
      // console.log("REQUEST_ID:", REQUEST_ID);
      let request = {
        "payload": {
          "_id": request0_uuid,
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": "/dialog_start",
          "id_project": PROJECT_ID,
          "request": {
            "request_id": REQUEST_ID,
            // "id_project": PROJECT_ID
          }
        },
        "token": CHATBOT_TOKEN
      }
      // console.log("sending message:", request);
      sendMessageToBot(request, BOT_ID, CHATBOT_TOKEN, () => {
        // console.log("Message sent.");
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
function sendMessageToBot(message, botId, token, callback) {
  // const jwt_token = this.fixToken(token);
  const url = `${process.env.TILEBOT_ENDPOINT}/ext/${botId}`;
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
