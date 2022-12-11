var assert = require('assert');
let axios = require('axios');
const tybot = require("../");
const tybotRoute = tybot.router;
var express = require('express');
var app = express();
app.use("/", tybotRoute);
require('dotenv').config();
const bodyParser = require('body-parser');

var endpointServer = express();
endpointServer.use(bodyParser.json());

before( () => {
    return new Promise( async (resolve, reject) => {
      console.log("Starting tilebot server...");
      tybot.startApp(
        {
          MONGODB_URI: process.env.mongoUrl,
          API_ENDPOINT: process.env.API_ENDPOINT,
          REDIS_HOST: process.env.REDIS_HOST,
          REDIS_PORT: process.env.REDIS_PORT,
          REDIS_PASSWORD: process.env.REDIS_PASSWORD,
          log: process.env.API_LOG
        }, () => {
          console.log("Tilebot route successfully started.");
          var port = process.env.PORT || 10001;
          app.listen(port, function () {
            console.log('Tilebot connector listening on port ', port);
            var listener = endpointServer.listen(10002, '0.0.0.0', function () {
              console.log('endpointServer started', listener.address());
              resolve();
            });
          });
      });
    })
});

after(function(done) {
    done();
});

describe('Conversation1', async() => {
    
    it('Start', (done) => {
      // new Promise( (resolve, reject) => {
        console.log("Starting story...");
        endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
          console.log("req.body:", JSON.stringify(req.body));
          res.send({success: true});
          const message = req.body;
          assert(message.text === "Hello");
          assert(message.attributes.commands !== null);
          assert(message.attributes.commands.length === 3);
          const command1 = message.attributes.commands[0];
          const command2 = message.attributes.commands[1];
          const command3 = message.attributes.commands[2];
          
          assert(command1.type === "message");
          assert(command1.message.text === "");
          assert(command1.message.type === "image");
          assert(command1.message.metadata.src !== null);
          
          assert(command2.type === "wait");
          assert(command2.time === 500);
          
          done();
        });

        const botId = process.env.TEST_BOT_ID;
        const REQUEST_ID = "support-group-" + process.env.TEST_PROJECT_ID + "-" + Date.now();
        console.log("botId:", botId);
        console.log("REQUEST_ID:", REQUEST_ID);
        let request = {
          "payload": {
            "_id": "ID",
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": "/start",
            "id_project": process.env.TEST_PROJECT_ID,
            "metadata": "",
            "request": {
              "request_id": REQUEST_ID
            }
          },
          "token": process.env.CHATBOT_TOKEN
        }
        sendMessageToBot(request, botId, process.env.CHATBOT_TOKEN, () => {
          console.log("Message sent.");
        });
      });
    // });
    
});

function createRequest(projectId, callback) {

  const tdclient = new TiledeskClient({
    APIKEY: "___",
    APIURL: "",
    projectId: projectId,
    token: ANONYM_USER_TOKEN,
    log: false
});
if (tdclient) {
    assert(tdclient != null);
    const text_value = 'test message';
    const request_id = TiledeskClient.newRequestId(PROJECT_ID);
    tdclient.sendSupportMessage(request_id, {text: text_value}, function(err, result) {
        assert(err === null);
        assert(result != null);
        assert(result.text === text_value);
        done();
    });
}
else {
    assert.ok(false);
}
}

function createAnonyUser(projecId, callback) {
  TiledeskClient.anonymousAuthentication(
    projecId,
    "_",
    {
        APIURL: API_ENDPOINT,
        log: false
    },
    function(err, result) {
        if (!err && result) {
            callback(result.token)
        }
        else {
          callback(null);
        }
    }
  );
}

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
  const url = `${process.env.CHATBOT_ENDPOINT}/ext/${botId}`;
  console.log("sendMessageToBot URL", url);
  const HTTPREQUEST = {
    url: url,
    headers: {
      'Content-Type' : 'application/json'
    },
    json: message,
    method: 'POST'
  };
  myrequest(
    HTTPREQUEST,
    function(err, resbody) {
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

function myrequest(options, callback, log) {
  if (this.log) {
    console.log("API URL:", options.url);
    console.log("** Options:", options);
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
    if (this.log) {
      console.log("Response for url:", options.url);
      console.log("Response headers:\n", res.headers);
      //console.log("******** Response for url:", res);
    }
    if (res && res.status == 200 && res.data) {
      if (callback) {
        callback(null, res.data);
      }
    }
    else {
      if (callback) {
        callback(TiledeskClient.getErr({message: "Response status not 200"}, options, res), null, null);
      }
    }
  })
  .catch( (error) => {
    console.error("An error occurred:", error);
    if (callback) {
      callback(error, null, null);
    }
  });
}
