var assert = require('assert');
let axios = require('axios');
const tybot = require("../");
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
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');
const tilebotService = require('../services/TilebotService');
const bots_data = require('./conversation-web_requestv2_bot.js').bots_data;

const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;

describe('Conversation for WebRequestV2 test', async () => {

  let app_listener;
  let util = new TiledeskChatbotUtil();

  before(() => {
    return new Promise(async (resolve, reject) => {
      winston.info("Starting tilebot server...");
      tybot.startApp(
        {
          // MONGODB_URI: process.env.MONGODB_URI,
          bots: bots_data,
          TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT,
          API_ENDPOINT: process.env.API_ENDPOINT,
          REDIS_HOST: process.env.REDIS_HOST,
          REDIS_PORT: process.env.REDIS_PORT,
          REDIS_PASSWORD: process.env.REDIS_PASSWORD
        }, () => {
          winston.info("Tilebot route successfully started.");
          var port = process.env.PORT || 10001;
          app_listener = app.listen(port, () => {
            winston.info('Tilebot connector listening on port ' + port);
            resolve();
          });
        });
    })
  });

  after(function (done) {
    app_listener.close(() => {
      done();
    });
  });

  it('webrequestv2: returns a json body, GET, assign result, assign status', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.get('/test/webrequest/get/json', async (req, res) => {
      assert(req.headers["user-agent"] === "TiledeskBotRuntime");
      assert(req.headers["content-type"] === "*/*");
      assert(req.headers["cache-control"] === "no-cache");
      res.send({
        "city": "NY",
        "age": 50
      });
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === "result assigned to: [object Object] status assigned to: 200");
      assert(command1.type === "message");
      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["reply"] !== null);
          assert(typeof attributes["reply"] === "object")
          assert(attributes["reply"]["city"] === "NY");
          assert(attributes["reply"]["age"] === 50);
          assert(attributes["status"] === 200);
          listener.close(() => {
            done();
          });
        }
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": "/webrequestv2-nocondition",
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": CHATBOT_TOKEN
      }
      tilebotService.sendMessageToBot(request, BOT_ID, () => {
         winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('webrequestv2 success status condition', (done) => {
    // let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.get('/test/webrequest/get/json', async (req, res) => {
      assert(req.headers["user-agent"] === "TiledeskBotRuntime");
      assert(req.headers["content-type"] === "*/*");
      assert(req.headers["cache-control"] === "no-cache");
      res.send({
        "city": "NY",
        "age": 50
      });
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === "webrequest replied: [object Object] with status 200");
      assert(command1.type === "message");
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
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": "/webrequestv2-success_condition",
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": CHATBOT_TOKEN
      }
      tilebotService.sendMessageToBot(request, BOT_ID, () => {
         winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('webrequestv2 - failure (404) status condition', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.get('/test/webrequest/get/json', async (req, res) => {
      assert(req.headers["user-agent"] === "TiledeskBotRuntime");
      assert(req.headers["content-type"] === "*/*");
      assert(req.headers["cache-control"] === "no-cache");
      res.send({
        "city": "NY",
        "age": 50
      });
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === "webrequest failed with status 404 and error Request failed with status code 404");
      assert(command1.type === "message");
      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["status"] === 404);
          assert(attributes["error"] === "Request failed with status code 404");
          listener.close(() => {
            done();
          });
        }
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": "/webrequestv2-failure_404",
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": CHATBOT_TOKEN
      }
      tilebotService.sendMessageToBot(request, BOT_ID, () => {
         winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('webrequestv2 - failure (300) status condition', (done) => {
    // let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.get('/test/webrequest/get/json', async (req, res) => {
      assert(req.headers["user-agent"] === "TiledeskBotRuntime");
      assert(req.headers["content-type"] === "*/*");
      assert(req.headers["cache-control"] === "no-cache");
      res.sendStatus(300);
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === "webrequest failed with status 300 and error Request failed with status code 300");
      assert(command1.type === "message");
      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["status"] === 300);
          assert(attributes["error"] === "Request failed with status code 300");
          listener.close(() => {
            done();
          });
        }
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": "/webrequestv2-failure_300",
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": CHATBOT_TOKEN
      }
      tilebotService.sendMessageToBot(request, BOT_ID, () => {
         winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('/webrequestv2 - post: POST a json body, get result, assign status', (done) => {
    // let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/test/webrequest/post/json', async (req, res) => {
      assert(req.headers["user-agent"] === "TiledeskBotRuntime");
      assert(req.headers["content-type"] === "application/json");
      assert(req.headers["cache-control"] === "no-cache");
      res.send({
        "replyname": req.body.name,
        "replyemail": req.body.email
      });
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === "HTTP POST Success with status 200. From reply, name: myname, email: myemail");
      assert(command1.type === "message");
      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["status"] === 200);
          assert(attributes["result"]["replyname"] === "myname");
          assert(attributes["result"]["replyemail"] === "myemail");
          listener.close(() => {
            done();
          });
        }
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": "/webrequestv2_post",
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": CHATBOT_TOKEN
      }
      tilebotService.sendMessageToBot(request, BOT_ID, () => {
         winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('/webrequestv2 - post: POST a form-data, get result, assign status', (done) => {
    // let message_id = uuidv4();
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    var multer = require('multer');
    var path = require("path");
    var fs = require('fs');
    const upload = multer({ dest: 'uploads/' })
    endpointServer.post('/test/webrequest/post/form-data', upload.single('file'), async (req, res) => {
      let file_contents = null;
      try {
        file_contents = fs.readFileSync(req.file.path, 'utf8');
      } catch (err) {
        winston.error(err);
      }
      const responseBody = {
        "purpose": req.body.purpose,
        "file_contents": file_contents
      };
      const uploads_folder = "./uploads";
      fs.readdir(uploads_folder, (err, files) => {
        if (err) throw err;
        for (const file of files) {
          fs.unlink(path.join(uploads_folder, file), (err) => {
            if (err) throw err;
          });
        }
      });
      res.send(responseBody);
    });

    endpointServer.get('/test/webrequest/post/form-data/simple_file.txt', upload.single('file'), async (req, res) => {
      res.send("This is a simple text file");
    });

    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === "HTTP form-data Success. purpose: assistants file_contents: This is a simple text file");
      assert(command1.type === "message");
      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["status"] === 200);
          listener.close(() => {
            done();
          });
        }
      });
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": "/webrequestv2_post_form-data",
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": CHATBOT_TOKEN
      }
      tilebotService.sendMessageToBot(request, BOT_ID, () => {
         winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('/webrequestv2 - post: POST a MALFORMED json body ', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/test/webrequest/post/json', async (req, res) => {
      assert(req.headers["user-agent"] === "TiledeskBotRuntime");
      assert(req.headers["content-type"] === "application/json");
      assert(req.headers["cache-control"] === "no-cache");
      res.send({
        "replyname": req.body.name,
        "replyemail": req.body.email
      });
    });
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command1 = message.attributes.commands[1];
      assert(command1.type === "message");
      assert(command1.message.text === "webrequest error: Error parsing json body");
      assert(command1.type === "message");
      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["flowError"] === "Error parsing json body");
          listener.close(() => {
            done();
          });
        }
      });
    });
  
    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": "/webrequestv2_post-incorrect-body",
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": CHATBOT_TOKEN
      }
      tilebotService.sendMessageToBot(request, BOT_ID, () => {
        winston.verbose("Message sent:\n", request);
      });
    });
  });


});