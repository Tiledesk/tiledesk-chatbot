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
const bots_data = require('./web_request-bot.js').bots_data;

const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;

describe('Conversation for JSONCondition test', async () => {

  let app_listener;

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
          log: process.env.API_LOG
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

  it('/webrequest', (done) => {
    console.log("/webrequest");
    // let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.get('/test/webrequest/get/plain', async (req, res) => {
      // console.log("/webrequest GET req.headers:", req.headers);
      assert(req.headers["user-agent"] === "TiledeskBotRuntime");
      assert(req.headers["content-type"] === "application/json");
      assert(req.headers["cache-control"] === "no-cache");
      res.send("Application var");
    });
    endpointServer.post('/test/webrequest/post/plain', async (req, res) => {
      // console.log("/webrequest POST req.headers:", req.headers);
      assert(req.headers["user-agent"] === "TiledeskBotRuntime");
      assert(req.headers["content-type"] === "application/json");
      assert(req.headers["cache-control"] === "no-cache");
      assert(req.headers["accept"] === "*/*");
      if (req && req.body && req.body.name) {
        res.send("Your name is " + req.body.name);
      }
      else {
        res.send("Error");
      }
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      // console.log("...req.body:", JSON.stringify(req.body));
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 4);
      const command1 = message.attributes.commands[1];
      const command3 = message.attributes.commands[3];
    
      assert(command1.type === "message");
      assert(command1.message.text === "var1: Application var");
      assert(command3.type === "message");
      // console.log("command3.message.text", command3.message.text)
      assert(command3.message.text === "service_reply: Your name is Andrea");
      getChatbotParameters(REQUEST_ID, (err, params) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(params);
        //   assert(params["last_message_id"] === message_id);
          assert(params["var1"] === "Application var");
          assert(params["service_reply"] === "Your name is Andrea");
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
          "text": "/webrequest",
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": CHATBOT_TOKEN
      }
      sendMessageToBot(request, BOT_ID, () => {
        // console.log("Message sent:\n", request);
      });
    });
  });

  it('/webrequest_with_assignments', (done) => {
    console.log("/webrequest_with_assignments");
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
        "name": "Alan",
        "hometown": "Somewhere, TX",
        "time": 123,
        "owner": {
            "name": "Andrea",
            "CF": "SPN"
        },
        "html": "<div>HTML Content!</div>",
        "kids": [
            {
                "name": "Jimmy",
                "age": "12"
            }, 
            {
                "name": "Sally",
                "age": "4"
            }
        ],
        "names": [
            "Andrea",
            "Marco",
            "Mery",
            "Nico",
            "Antonio",
            "Stefania",
            "Luca"
        ],
        "fields": [
          {
            "name": "CONSENT",
            "value": "false",
            "predefined": true,
            "private": false,
            "readonly": false,
            "type": "consent"
          },
          {
            "name": "FIRSTNAME",
            "value": "Antony"
          },
          {
            "name": "LASTNAME",
            "value": "Larson"
          },
          {
            "name": "DNI",
            "value": "42061884"
          }
        ]
      };
      res.send(data);
    });
    endpointServer.get('/test/webrequest/get/plain', async (req, res) => {
      // console.log("/webrequest_with_assignments /test/webrequest/get/plain req.headers:", req.headers);
      assert(req.headers["user-agent"] === "TiledeskBotRuntime");
      assert(req.headers["content-type"] === "application/json");
      assert(req.headers["cache-control"] === "no-cache");
      assert(req.headers["accept"] === "*/*");
      res.send("Hi from Tiledesk WebRequest");
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      // console.log("...req.body:", JSON.stringify(req.body));
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command1 = message.attributes.commands[1];
    
      assert(command1.type === "message");
      assert(command1.message.text === "message check: Alan 123 Andrea <div>HTML Content!</div> Jimmy Sally  [object Object] Andrea Luca Sally Hi from Tiledesk WebRequest");
      
      getChatbotParameters(REQUEST_ID, (err, params) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(params);
          assert(params["name"] === "Alan");
          assert(params["time"] === "123");
          assert(params["owner_name"] === "Andrea");
          assert(params["html"] === "<div>HTML Content!</div>");
          assert(params["kid_0_name"] === "Jimmy");
          assert(params["kids_1_name"] === "Sally");
          assert(params["kids_3_name"] === "");
          assert(params["last_kid"] === "[object Object]");
          assert(params["first_name"] === "Andrea");
          assert(params["last_name"] === "Luca");
          assert(params["last_element_with_handlebars_syntax"] === "Sally");
          assert(params["element_array_by_name"] === "42061884");
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
          "text": "/webrequest_with_assignments",
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
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
function getChatbotParameters(requestId, callback) {
  // const jwt_token = this.fixToken(token);
  const url = `${process.env.TYBOT_ENDPOINT}/ext/parameters/requests/${requestId}?all`;
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
