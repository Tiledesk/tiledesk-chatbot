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
const bots_data = require('./conversation-add-tags_bot.js').bots_data;
const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;
const { TiledeskChatbotUtil } = require('../models/TiledeskChatbotUtil.js');
const { statSync } = require('fs');

let SERVER_PORT = 10001

describe('Api /ext/:boid', async () => {

  let app_listener;
  let util = new TiledeskChatbotUtil();

  before(() => {
    return new Promise(async (resolve, reject) => {
      console.log("Starting tilebot server...");
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
            console.log("Tilebot route successfully started.");
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
      // console.log('ACTIONS app_listener closed.');
      done();
    });
  });

  it('Botid parameter is undefined', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.put('/:projectId/requests/:requestId/tag', function (req, res) {
      assert(req.params.projectId)
      assert(req.params.requestId)
      assert.ok(req.headers.authorization, 'Expect to have "Authorization" header')
      assert(req.body)
      let tags = req.body
      tags.forEach(tag => {
        if(!tag._id)
        tag._id = uuidv4().replace(/-/g, '')
      });
      let reply = {
        request_id: req.params.requestId,
        id_project: req.params.projectId,
        tags: tags,
        status: 200,
        channel: {
          name: 'chat21'
        }
      }
      res.status(200).send(reply)

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
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
      sendMessageToBot(request, undefined, (err, res) => {
        if(err){
          assert(err.status)
          assert.equal(err.status, 400)
          assert(err.response.data)
          assert.equal(err.response.data.success, false)
          assert(err.response.data.error)
          console.log("ERROR /ext/:botid--> handled")
          listener.close(() => {
            console.log('Server closed');
            done();
        });
        }
      });
    });
  });

  it('Botid parameter is null', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.put('/:projectId/requests/:requestId/tag', function (req, res) {
      assert(req.params.projectId)
      assert(req.params.requestId)
      assert.ok(req.headers.authorization, 'Expect to have "Authorization" header')
      assert(req.body)
      let tags = req.body
      tags.forEach(tag => {
        if(!tag._id)
        tag._id = uuidv4().replace(/-/g, '')
      });
      let reply = {
        request_id: req.params.requestId,
        id_project: req.params.projectId,
        tags: tags,
        status: 200,
        channel: {
          name: 'chat21'
        }
      }
      res.status(200).send(reply)

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
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
      sendMessageToBot(request, null, (err, res) => {
        if(err){
          assert(err.status)
          assert.equal(err.status, 400)
          assert(err.response.data)
          assert.equal(err.response.data.success, false)
          assert(err.response.data.error)
          console.log("ERROR /ext/:botid--> handled")
          listener.close(() => {
            console.log('Server closed');
            done();
        });
        }
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

function getExtBotId(botId, callback) {
  // const jwt_token = this.fixToken(token);
  const url = `${process.env.TILEBOT_ENDPOINT}/ext/${botId}`;
  const HTTPREQUEST = {
    url: url,
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'post'
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
      // console.error("An error occurred:", error);
      if (callback) {
        callback(error, null, null);
      }
    });
}
