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
const bots_data = require('./conversation-webhook_action_bot.js').bots_data;
const { TiledeskChatbotUtil } = require('../models/TiledeskChatbotUtil');

let SERVER_PORT = 10002

describe('Invoke Webhook Action', async () => {

  let app_listener;
  let util = new TiledeskChatbotUtil();
  
  before(() => {
    return new Promise(async (resolve, reject) => {
      console.log("Starting tilebot server...", bots_data);
      try {
        tybot.startApp(
          {
            bots: bots_data,
            API_ENDPOINT: process.env.API_ENDPOINT,
            REDIS_HOST: process.env.REDIS_HOST,
            REDIS_PORT: process.env.REDIS_PORT,
            REDIS_PASSWORD: process.env.REDIS_PASSWORD,
            log: process.env.TILEBOT_LOG
          }, () => {
            console.log("Tilebot route successfully started.");
            var port = SERVER_PORT;
            app_listener = app.listen(port, () => {
              console.log('Tilebot connector listening on port ', port);
              resolve();
            });
        });
      }
      catch(error) {
        console.error("error:", error)
      }
      
    })
  });

  after(function (done) {
    app_listener.close(() => {
      console.log("Server Closed.");
      done();
    });
  });

  it('invokes synchro webhook', (done) => {
    const webhook_id = "WEBHOOK-TEST-ID";
    callWebhook(webhook_id, "GET", null, (err, webhook_response) => {
      console.log("webhook_response:\n", webhook_response);
      assert(webhook_response.type === "B" && webhook_response.size === "M" && webhook_response.height === 200)
      done();
    });
  });

});

/**
 * A stub to invoke a webhook, hosted by tilebot on:
 * /${TILEBOT_ROUTE}/webhook/${webhook_id}
 *
 * @param {Object} webhook_id. The webhook_id
 * @param {string} method. webhook method
 * @param {string} payload. webhook payload
 */
function callWebhook(webhook_id, method, payload, callback) {
  const url = `http://localhost:${SERVER_PORT}/webhook/${webhook_id}`;
  console.log("callWebhook URL", url);
  const HTTPREQUEST = {
    url: url,
    // headers: {
    //   'Content-Type': 'application/json'
    // },
    // json: payload,
    method: method
  };
  myrequest(
    HTTPREQUEST,
    function (err, resbody) {
      console.log("resbody:", resbody)
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
    }, true
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
