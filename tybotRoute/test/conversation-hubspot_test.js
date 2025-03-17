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
const bots_data = require('./conversation-hubspot_bot.js').bots_data;
const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;
const { TiledeskChatbotUtil } = require('../models/TiledeskChatbotUtil');

let SERVER_PORT = 10001

describe('Conversation for hubspot test', async () => {

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
  
  it('/hubspot success', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === 'hubspot status is: 201');
      const command2 = message.attributes.commands[2];
      assert(command2.type === "message");
      assert(command2.message.text === 'hubspot result is: [object Object]');
      const command3 = message.attributes.commands[3];
      assert(command3.type === "message");
      assert(command3.message.text === 'hubspot error is: null');

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["hubspot_status"] === 201);
          assert(attributes["hubspot_error"] === null);
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
        name: "hubspot",
        value: {
          apikey: "example_api_key"
        }
      }

      res.status(http_code).send(reply);
    })

  
    endpointServer.post('/crm/v3/objects/contacts/batch/create', function (req, res) {

      let http_code = 201;
      let reply = {
        status: "COMPLETE",
        results: [
          {
            id: "351",
            properties: {
              createdate: "2023-12-28T11:01:26.769Z",
              email: "john@doe.come",
              firstname: "John",
              lastmodifieddate: "2023-12-28T11:01:26.769Z",
              lastname: "Doe",
              lifecyclestage: "lead"
            },
            createdAt: "2023-12-28T11:01:26.769Z",
            updatedAt: "2023-12-28T11:01:26.769Z",
            archived: false
          }
        ],
        startedAt: "2023-12-28T11:01:26.746Z",
        completedAt: "2023-12-28T11:01:26.983Z"
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
          "text": '/hubspot#SUCCESS',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          },
        },
        "token": "XXX"
      }
      sendMessageToBot(request, BOT_ID, () => {
        winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('/hubspot failure - return code 409', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === 'hubspot status is: 409');
      const command2 = message.attributes.commands[2];
      assert(command2.type === "message");
      assert(command2.message.text === 'hubspot result is: null');
      const command3 = message.attributes.commands[3];
      assert(command3.type === "message");
      assert(command3.message.text === 'Hubspot error is: Contact already exists. Existing ID: 801');

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["hubspot_status"] === 409);
          assert(attributes["hubspot_error"] === "Contact already exists. Existing ID: 801");
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
        name: "hubspot",
        value: {
          apikey: "example_api_key"
        }
      }

      res.status(http_code).send(reply);
    })

    endpointServer.post('/crm/v3/objects/contacts/batch/create', function (req, res) {

      let http_code = 409;
      let reply = {
        status: "error",
        message: "Contact already exists. Existing ID: 801",
        correlationId: "f426b0c0-1063-4aac-9859-f40108dcb09b",
        category: "CONFLICT"
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
          "text": '/hubspot#FAILURE409',
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

  it('/hubspot failure - return code 401', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === 'hubspot status is: 401');
      const command2 = message.attributes.commands[2];
      assert(command2.type === "message");
      assert(command2.message.text === 'hubspot result is: null');
      const command3 = message.attributes.commands[3];
      assert(command3.type === "message");
      assert(command3.message.text === 'Hubspot error is: Authentication credentials not found. This API supports OAuth 2.0 authentication and you can find more details at https://developers.hubspot.com/docs/methods/auth/oauth-overview');

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["hubspot_status"] === 401);
          assert(attributes["hubspot_error"] === "Authentication credentials not found. This API supports OAuth 2.0 authentication and you can find more details at https://developers.hubspot.com/docs/methods/auth/oauth-overview");
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
        name: "hubspot",
        value: {
          apikey: "example_api_key"
        }
      }

      res.status(http_code).send(reply);
    })


    endpointServer.post('/crm/v3/objects/contacts/batch/create', function (req, res) {
      let http_code = 401;
      let reply = {
        status: "error",
        message: "Authentication credentials not found. This API supports OAuth 2.0 authentication and you can find more details at https://developers.hubspot.com/docs/methods/auth/oauth-overview",
        correlationId: "53dab600-5de9-4aa3-b631-b0f11f43e062",
        category: "INVALID_AUTHENTICATION"
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
          "text": '/hubspot#FAILUREACCESSTOKEN',
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

  it('/hubspot failure - return code 400', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === 'hubspot status is: 400');
      const command2 = message.attributes.commands[2];
      assert(command2.type === "message");
      assert(command2.message.text === 'hubspot result is: null');
      const command3 = message.attributes.commands[3];
      assert(command3.type === "message");
      assert(command3.message.text === 'Hubspot error is: Property values were not valid: [{\"isValid\":false,\"message\":\"Email address dsfsafas@ is invalid\",\"error\":\"INVALID_EMAIL\",\"name\":\"email\"}]');

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["hubspot_status"] === 400);
          assert(attributes["hubspot_error"] === "Property values were not valid: [{\"isValid\":false,\"message\":\"Email address dsfsafas@ is invalid\",\"error\":\"INVALID_EMAIL\",\"name\":\"email\"}]");
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
        name: "hubspot",
        value: {
          apikey: "example_api_key"
        }
      }

      res.status(http_code).send(reply);
    })

    endpointServer.post('/crm/v3/objects/contacts/batch/create', function (req, res) {
      let http_code = 400;
      let reply = {
        "status": "error",
        "message": "Property values were not valid: [{\"isValid\":false,\"message\":\"Email address dsfsafas@ is invalid\",\"error\":\"INVALID_EMAIL\",\"name\":\"email\"}]",
        "correlationId": "e3d7ddf8-5d21-4059-86d0-35ae9093755c",
        "category": "VALIDATION_ERROR"
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
          "text": '/hubspot#FAILUREEMAIL',
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
