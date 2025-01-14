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
const bots_data = require('./conversation-message_metadata-bot.js').bots_data;

const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;
const { TiledeskChatbotUtil } = require('../models/TiledeskChatbotUtil');

describe('Conversation for message.metadata test', async () => {

  let app_listener;
  let util = new TiledeskChatbotUtil();

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
      // console.log('ACTIONS app_listener closed.');
      done();
    });
  });

  // it('/basic_reply_showing_metadata: returns a reply with message.metadata', (done) => {
  //   // console.log("/webrequestv2");
  //   // let message_id = uuidv4();
  //   let listener;
  //   let endpointServer = express();
  //   endpointServer.use(bodyParser.json());
  //   endpointServer.get('/test/webrequest/get/json', async (req, res) => {
  //     // console.log("/webrequestv2 GET req.headers:", req.headers);
  //     assert(req.headers["user-agent"] === "TiledeskBotRuntime");
  //     assert(req.headers["content-type"] === "*/*");
  //     assert(req.headers["cache-control"] === "no-cache");
  //     res.send({
  //       "city": "NY",
  //       "age": 50
  //     });
  //   });
  //   endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
  //     console.log("/basic_reply_showing_metadata...req.body:", JSON.stringify(req.body));
      
  //     res.send({ success: true });
      
  //     const message = req.body;
  //     assert(message.attributes.commands !== null);
  //     assert(message.attributes.commands.length === 2);
  //     const command1 = message.attributes.commands[1];
    
  //     assert(command1.type === "message");
  //     assert(command1.message.text === "message type: image message text: /basic_reply_showing_metadata message.metadata.src: http://image_src");
  //     assert(command1.type === "message");
  //     getChatbotParameters(REQUEST_ID, (err, params) => {
  //       if (err) {
  //         assert.ok(false);
  //       }
  //       else {
  //         assert(params);
  //         assert(params["lastUserMessage"] !== null);
  //         assert(params["lastUserMessage"]["metadata"]["src"] === "http://image_src");
  //         listener.close(() => {
  //           done();
  //         });
  //       }
  //     });
  //   });

  //   listener = endpointServer.listen(10002, '0.0.0.0', () => {
  //     // console.log('endpointServer started', listener.address());
  //     let request = {
  //       "payload": {
  //       //   "_id": message_id,
  //         "senderFullname": "guest#367e",
  //         "type": "image",
  //         "sender": "A-SENDER",
  //         "recipient": REQUEST_ID,
  //         "text": "/basic_reply_showing_metadata",
  //         "id_project": PROJECT_ID,
  //         "metadata": {
  //           src: "http://image_src"
  //         },
  //         "request": {
  //           "request_id": REQUEST_ID
  //         }
  //       },
  //       "token": CHATBOT_TOKEN
  //     }
  //     sendMessageToBot(request, BOT_ID, () => {
  //       // console.log("Message sent:\n", request);
  //     });
  //   });
  // });

  it('/condition with json metadata: evaluates message.metadata', (done) => {
    // console.log("/webrequestv2");
    // let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      // console.log("/condition with json metadata...req.body:", JSON.stringify(req.body));
      
      res.send({ success: true });
      
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command1 = message.attributes.commands[1];
    
      assert(command1.type === "message");
      assert(command1.message.text === "it's true");
      assert(command1.type === "message");
      util.getChatbotParameters(REQUEST_ID, (err, params) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(params);
          assert(params["lastUserMessage"] !== null);
          assert(params["lastUserMessage"]["metadata"]["src"] === "http://image_src");
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
          "type": "image",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": "/condition with json metadata",
          "id_project": PROJECT_ID,
          "metadata": {
            src: "http://image_src"
          },
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
