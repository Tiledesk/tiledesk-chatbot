var assert = require('assert');
let axios = require('axios');
const tybot = require("../index.js");
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
const bots_data = require('./conversation-customerio_bot.js').bots_data;
const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;

let SERVER_PORT = 10001

describe('Conversation for customerio test', async () => {

  let app_listener;

  before(() => {
    return new Promise(async (resolve, reject) => {
      console.log("Starting tilebot server...");
      try {
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
            console.log("Tilebot route successfully started.", );
            var port = SERVER_PORT;
            app_listener = app.listen(port, () => {
              console.log('Tilebot connector listening on port ', port);
              resolve();
            });
          });
      }
      catch (error) {
        console.error("error:", error)
      }

    })
  });

  after(function (done) {
    app_listener.close(() => {
      console.log('ACTIONS app_listener closed.');
      done();
    });
  });
// TEST CUSTOMERIO
//TEST SUCCESS
  it('/customerio success', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      console.log('/customerio success message: ', JSON.stringify(message, null,2));
      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === 'customerio status is: 204');

      const command2 = message.attributes.commands[2];
      assert(command2.type === "message");
      assert(command2.message.text === 'customerio error is: null');

      getChatbotParameters(REQUEST_ID, (err, attributes) => {
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

    endpointServer.post('/1.3/customerio/', function (req, res) {
    //endpointServer.post('/api/v1/forms/1/submit', function (req, res) {
      let http_code = 204;
      let reply = {}
      console.log("endpointServer.post/1.3/customerio/ ")
      res.sendStatus(204);
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      console.log('endpointServer started: ', listener.address());
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
      sendMessageToBot(request, BOT_ID, () => {
        //console.log("Message sent:\n", request);
      });
    });
  });
// TEST FAIL CODE 409
// it('/hubspot failure - return code 409', (done) => {

//   let listener;
//   let endpointServer = express();
//   endpointServer.use(bodyParser.json());
//   endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
//     res.send({ success: true });
//     const message = req.body;
//     //console.log("/hubspot failure message: ", JSON.stringify(message, null, 2));
//     getChatbotParameters(REQUEST_ID, (err, attributes) => {
//       if (err) {
//         assert.ok(false);
//       }
//       else {
//         assert(attributes);
//         assert(attributes["hubspot_status"] === 409);
//         assert(attributes["hubspot_error"] === "Contact already exists. Existing ID: 801");
//         listener.close(() => {
//           done();
//         });
//       }
//     });

//    });

//   endpointServer.post('/1.3/hubspot/', function (req, res) {

//     let http_code = 409;
//     let reply = {
//       "status": "error",
//       "message": "Contact already exists. Existing ID: 801",
//       "correlationId": "f426b0c0-1063-4aac-9859-f40108dcb09b",
//       "category": "CONFLICT"
//   }
//     res.status(http_code).send(reply);
//   });

//   listener = endpointServer.listen(10002, '0.0.0.0', () => {
//     //console.log('endpointServer started', listener.address());
//     let request = {
//       "payload": {
//         "senderFullname": "guest#367e",
//         "type": "text",
//         "sender": "A-SENDER",
//         "recipient": REQUEST_ID,
//         "text": '/hubspot#FAILURE409',
//         "id_project": PROJECT_ID,
//         "metadata": "",
//         "request": {
//           "request_id": REQUEST_ID
//         }
//       },
//       "token": "XXX"
//     }
//     sendMessageToBot(request, BOT_ID, () => {
//       // console.log("Message sent:\n", request);
//     });
//   });
// });

//TEST FAIL CODE 401 FAIL ACCESS TOKEN
  // it('/customerio failure - return code 404', (done) => {

  //   let listener;
  //   let endpointServer = express();
  //   endpointServer.use(bodyParser.json());
  //   endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
  //     res.send({ success: true });
  //     const message = req.body;
  //     console.log("/customerio failure message: ", JSON.stringify(message, null, 2));
  //     getChatbotParameters(REQUEST_ID, (err, attributes) => {
  //       if (err) {
  //         assert.ok(false);
  //       }
  //       else {
  //         assert(attributes);
  //         assert(attributes["customerio_status"] === 401);
  //         assert(attributes["customerio_error"] === "Unauthorized request");
  //         listener.close(() => {
  //           done();
  //         });
  //       }
  //     });

  //    });

  //   endpointServer.post('/1.3/customerio/', function (req, res) {
  //     let http_code = 401;
  //     let reply = {
  //       "status": "error",
  //       "message": "Unauthorized request",
  //       "correlationId": "53dab600-5de9-4aa3-b631-b0f11f43e062",
  //       "category": "INVALID_AUTHENTICATION"
  //     }
  //     res.status(http_code).send(reply);
  //   });

  //   listener = endpointServer.listen(10002, '0.0.0.0', () => {
  //     //console.log('endpointServer started', listener.address());
  //     let request = {
  //       "payload": {
  //         "senderFullname": "guest#367e",
  //         "type": "text",
  //         "sender": "A-SENDER",
  //         "recipient": REQUEST_ID,
  //         "text": '/customerio#FAILUREACCESSTOKEN',
  //         "id_project": PROJECT_ID,
  //         "metadata": "",
  //         "request": {
  //           "request_id": REQUEST_ID
  //         }
  //       },
  //       "token": "XXX"
  //     }
  //     sendMessageToBot(request, BOT_ID, () => {
  //       // console.log("Message sent:\n", request);
  //     });
  //   });
  // });
//TEST FAIL 400 EMAIL IS INVALID
// it('/customerio failure - return code 400', (done) => {

//   let listener;
//   let endpointServer = express();
//   endpointServer.use(bodyParser.json());
//   endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
//     res.send({ success: true });
//     const message = req.body;
//     console.log("/customerio failure message: ", JSON.stringify(message, null, 2));
//     getChatbotParameters(REQUEST_ID, (err, attributes) => {
//       if (err) {
//         assert.ok(false);
//       }
//       else {
//         assert(attributes);
//         assert(attributes["customerio_status"] === 400);
//         assert(attributes["customerio_error"] === "invalid email identifier");
//         listener.close(() => {
//           done();
//         });
//       }
//     });

//    });

//   endpointServer.post('/1.3/customerio/', function (req, res) {
//     let http_code = 400;
//     let reply = {
//       "status": "error",
//       "message": "invalid email identifier",
//       "correlationId": "e3d7ddf8-5d21-4059-86d0-35ae9093755c",
//       "category": "VALIDATION_ERROR"
//   }
//     res.status(http_code).send(reply);
//   });

//   listener = endpointServer.listen(10002, '0.0.0.0', () => {
//     console.log('endpointServer started', listener.address());
//     let request = {
//       "payload": {
//         "senderFullname": "guest#367e",
//         "type": "text",
//         "sender": "A-SENDER",
//         "recipient": REQUEST_ID,
//         "text": '/customerio#FAILUREEMAIL',
//         "id_project": PROJECT_ID,
//         "metadata": "",
//         "request": {
//           "request_id": REQUEST_ID
//         }
//       },
//       "token": "XXX"
//     }
//     sendMessageToBot(request, BOT_ID, () => {
//        //console.log("Message sent:\n", request);
//     });
//   });
// });
  
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
  const url = `http://localhost:${SERVER_PORT}/ext/${botId}`;
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
    console.log("* API URL:", options.url);
    console.log("* Options:", JSON.stringify(options));
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
        console.log("Response for url:111", options.url);
        console.log("Response headers:\n", JSON.stringify(res.headers));
        console.log("******** Response for url:", res);
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
      // console.error("An error occurred:", error);
      if (callback) {
        callback(error, null, null);
      }
    });
}
