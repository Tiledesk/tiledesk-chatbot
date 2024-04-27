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
const bots_data = require('./conversation-web_requestv2-bot.js').bots_data;

const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;

describe('Conversation for WebRequestV2 test', async () => {

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

  it('/webrequestv2: returns a json body, GET, assign result, assign status', (done) => {
    // console.log("/webrequestv2");
    // let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.get('/test/webrequest/get/json', async (req, res) => {
      // console.log("/webrequestv2 GET req.headers:", req.headers);
      assert(req.headers["user-agent"] === "TiledeskBotRuntime");
      assert(req.headers["content-type"] === "*/*");
      assert(req.headers["cache-control"] === "no-cache");
      res.send({
        "city": "NY",
        "age": 50
      });
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      // console.log("/webrequestv2...req.body:", JSON.stringify(req.body));
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command1 = message.attributes.commands[1];
    
      assert(command1.type === "message");
      assert(command1.message.text === "result assigned to: [object Object] status assigned to: 200");
      assert(command1.type === "message");
      getChatbotParameters(REQUEST_ID, (err, params) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(params);
        //   assert(params["last_message_id"] === message_id);
          assert(params["var1"] !== null);
          assert(params["status1"] === 200);
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
          "text": "/webrequestv2",
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

  it('webrequestv2 success status condition', (done) => {
    // console.log("/webrequestv2");
    // let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.get('/test/webrequest/get/json', async (req, res) => {
      // console.log("/webrequestv2 GET req.headers:", req.headers);
      assert(req.headers["user-agent"] === "TiledeskBotRuntime");
      assert(req.headers["content-type"] === "*/*");
      assert(req.headers["cache-control"] === "no-cache");
      res.send({
        "city": "NY",
        "age": 50
      });
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      // console.log("/webrequestv2_success_status_condition...req.body:", JSON.stringify(req.body));
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command1 = message.attributes.commands[1];
    
      assert(command1.type === "message");
      assert(command1.message.text === "HTTP GET Success");
      assert(command1.type === "message");
      getChatbotParameters(REQUEST_ID, (err, params) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(params);
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
          "text": "/webrequestv2 - success status condition",
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

  it('webrequestv2 - failure (404) status condition', (done) => {
    // console.log("/webrequestv2");
    // let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.get('/test/webrequest/get/json', async (req, res) => {
      // console.log("/webrequestv2 GET req.headers:", req.headers);
      assert(req.headers["user-agent"] === "TiledeskBotRuntime");
      assert(req.headers["content-type"] === "*/*");
      assert(req.headers["cache-control"] === "no-cache");
      res.send({
        "city": "NY",
        "age": 50
      });
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      // console.log("/webrequestv2 - failure status condition...req.body:", JSON.stringify(req.body));
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command1 = message.attributes.commands[1];
    
      assert(command1.type === "message");
      assert(command1.message.text === "HTTP GET Failure");
      assert(command1.type === "message");
      getChatbotParameters(REQUEST_ID, (err, params) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(params);
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
          "text": "/webrequestv2 - failure status condition",
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

  it('webrequestv2 - failure (300) status condition', (done) => {
    // console.log("/webrequestv2");
    // let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.get('/test/webrequest/get/json', async (req, res) => {
      // console.log("/webrequestv2 GET req.headers:", req.headers);
      assert(req.headers["user-agent"] === "TiledeskBotRuntime");
      assert(req.headers["content-type"] === "*/*");
      assert(req.headers["cache-control"] === "no-cache");
      res.sendStatus(300);
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      // console.log("/webrequestv2 - failure 300 status condition...req.body:", JSON.stringify(req.body));
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command1 = message.attributes.commands[1];
    
      assert(command1.type === "message");
      assert(command1.message.text === "HTTP GET Failure with status 300 error Request failed with status code 300");
      assert(command1.type === "message");
      getChatbotParameters(REQUEST_ID, (err, params) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(params);
          assert(params["error"] === "Request failed with status code 300");
          assert(params["status"] === 300);
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
          "text": "/webrequestv2 - failure 300 status condition",
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

  it('/webrequestv2 - post: POST a json body, get result, assign status', (done) => {
    // console.log("/webrequestv2");
    // let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/test/webrequest/post/json', async (req, res) => {
      // console.log("/webrequestv2 POST req.headers:", req.headers);
      // console.log("/webrequestv2 POST req.body:", req.body);
      assert(req.headers["user-agent"] === "TiledeskBotRuntime");
      assert(req.headers["content-type"] === "application/json");
      assert(req.headers["cache-control"] === "no-cache");
      res.send({
        "replyname": req.body.name,
        "replyemail": req.body.email
      });
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      // console.log("/webrequestv2 - post...req.body:", JSON.stringify(req.body));
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command1 = message.attributes.commands[1];
    
      assert(command1.type === "message");
      assert(command1.message.text === "HTTP POST Success with status 200. From reply, name: myname, email: myemail");
      assert(command1.type === "message");
      getChatbotParameters(REQUEST_ID, (err, params) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(params);
          assert(params["status"] === 200);
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
          "text": "/webrequestv2 - post",
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

  it('/webrequestv2 - post: POST a form-data, get result, assign status', (done) => {
    console.log("/webrequestv2 - post: POST a form-data, get result, assign status");
    // let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    var multer = require('multer');
    // read file contents for testing purposes
    var path = require("path");
    var fs = require('fs');
    const upload = multer({ dest: 'uploads/' })
    endpointServer.post('/test/webrequest/post/form-data', upload.single('file'), async (req, res) => {
      console.log("/webrequestv2 POST form-data req.file:", req.file);
      let file_contents = null;
      try {
        file_contents = fs.readFileSync(req.file.path, 'utf8');
        console.log("file_data:", file_contents);
      } catch (err) {
        console.error(err);
      }

      console.log("/webrequestv2 POST form-data req.body:", req.body);
      console.log("/webrequestv2 POST form-data req.headers:", req.headers);
      console.log("/webrequestv2 POST form-data req.body.purpose:", req.body.purpose);
      const responseBody = {
        "purpose": req.body.purpose,
        "file_contents": file_contents
      };
      console.log("Sending back: ", responseBody);
      res.send(responseBody);
    });
    endpointServer.get('/test/webrequest/post/form-data/simple_file.txt', upload.single('file'), async (req, res) => {
      res.send("This is a simple text file");
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      console.log("/webrequestv2 - post...req.body:", JSON.stringify(req.body));
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command1 = message.attributes.commands[1];
    
      assert(command1.type === "message");
      assert(command1.message.text === "HTTP form-data Success. purpose: assistants file_contents: This is a simple text file");
      assert(command1.type === "message");
      getChatbotParameters(REQUEST_ID, (err, params) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(params);
          assert(params["status"] === 200);
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
          "text": "/webrequestv2 - post form-data",
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
