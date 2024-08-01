var assert = require('assert');
let axios = require('axios');
const tybot = require("..");
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
const bots_data = require('./conversation-askgptv2_bot.js').bots_data;
const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;
const { TiledeskChatbotUtil } = require('../models/TiledeskChatbotUtil');

let SERVER_PORT = 10001

describe('Conversation for AskGPTV2 test', async () => {

  let app_listener;
  let util = new TiledeskChatbotUtil();

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

  it('/gpt_success (key from integrations) - invokes the askgpt mockup and test the returning attributes', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command2 = message.attributes.commands[1];
      assert(command2.type === "message");
      assert(command2.message.text === "gpt replied: this is mock gpt reply");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          // console.log("final attributes:", JSON.stringify(attributes));
          assert(attributes);
          assert(attributes["gpt_reply"] === "this is mock gpt reply");
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.post('/api/qa', function (req, res) {
      let reply = {}
      let http_code = 200;
      if (!req.body.question) {
        reply.error = "question field is mandatory"
        http_code = 400;
      }
      else if (!req.body.model) {
        reply.error = "model field is mandatory"
        http_code = 400;
      }
      else {
        reply = {
          answer: "this is mock gpt reply",
          success: true,
          source_url: "http://test"
        }
      }

      res.status(http_code).send(reply);
    });

    endpointServer.get('/:project_id/integration/name/:name', function (req, res) {
      let http_code = 200;
      let reply = {
        _id: "656728224b45965b69111111",
        id_project: "62c3f10152dc740035000000",
        name: "openai",
        value: {
          apikey: "example_api_key",
          organization: "TIledesk"
        }
      }

      res.status(http_code).send(reply);
    })

    endpointServer.get('/:project_id/integration/name/:name', function (req, res) {

      let http_code = 200;
      let reply = {
        _id: "656728224b45965b69111111",
        id_project: "62c3f10152dc740035000000",
        name: "openai",
        value: {
          apikey: "example_api_key",
          organization: "TIledesk"
        }
      }

      res.status(http_code).send(reply);
    })

    // no longer used in this test --> key retrieved from integrations
    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = { gptkey: "sk-123456" };
      let http_code = 200;

      res.status(http_code).send(reply);
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      // console.log('endpointServer started', listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/gpt_success{"last_user_message":"come ti chiami"}',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": "XXX"
      }
      sendMessageToBot(request, BOT_ID, () => {
        // console.log("Message sent:\n", request);
      });
    });
  });

  it('/gpt_success_custom_context (key from integrations) - invokes the askgpt mockup with temperature, max_token, top_k, context and test the returning attributes', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command2 = message.attributes.commands[1];
      assert(command2.type === "message");
      assert(command2.message.text === "gpt replied: this is mock gpt reply");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          // console.log("final attributes:", JSON.stringify(attributes));
          assert(attributes);
          assert(attributes["gpt_reply"] === "this is mock gpt reply");
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.post('/api/qa', function (req, res) {

      assert(req.body.temperature === 0.7)
      assert(req.body.max_tokens === 1000)
      assert(req.body.top_k === 2)
      assert(req.body.question === "this is the question: come ti chiami")
      assert(req.body.system_context === "this is the context: sei un assistente fantastico\nYou are an helpful assistant for question-answering tasks.\nUse ONLY the following pieces of retrieved context to answer the question.\nIf you don't know the answer, just say that you don't know.\nIf none of the retrieved context answer the question, add this word to the end <NOANS>\n\n{context}")

      let reply = {}
      let http_code = 200;
      if (!req.body.question) {
        reply.error = "question field is mandatory"
        http_code = 400;
      }
      else if (!req.body.model) {
        reply.error = "model field is mandatory"
        http_code = 400;
      }
      else {
        reply = {
          answer: "this is mock gpt reply",
          success: true,
          source_url: "http://test"
        }
      }

      res.status(http_code).send(reply);
    });

    endpointServer.get('/:project_id/integration/name/:name', function (req, res) {
      let http_code = 200;
      let reply = {
        _id: "656728224b45965b69111111",
        id_project: "62c3f10152dc740035000000",
        name: "openai",
        value: {
          apikey: "example_api_key",
          organization: "TIledesk"
        }
      }

      res.status(http_code).send(reply);
    })

    endpointServer.get('/:project_id/integration/name/:name', function (req, res) {

      let http_code = 200;
      let reply = {
        _id: "656728224b45965b69111111",
        id_project: "62c3f10152dc740035000000",
        name: "openai",
        value: {
          apikey: "example_api_key",
          organization: "TIledesk"
        }
      }

      res.status(http_code).send(reply);
    })

    // no longer used in this test --> key retrieved from integrations
    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = { gptkey: "sk-123456" };
      let http_code = 200;

      res.status(http_code).send(reply);
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      // console.log('endpointServer started', listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/gpt_success_custom_context{"last_user_message":"come ti chiami", "custom_context":"sei un assistente fantastico"}',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": "XXX"
      }
      sendMessageToBot(request, BOT_ID, () => {
        // console.log("Message sent:\n", request);
      });
    });
  });

  it('/gpt_success_advanced_context (key from integrations) - invokes the askgpt mockup with temperature, max_token, top_k, context and test the returning attributes', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command2 = message.attributes.commands[1];
      assert(command2.type === "message");
      assert(command2.message.text === "gpt replied: this is mock gpt reply");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          // console.log("final attributes:", JSON.stringify(attributes));
          assert(attributes);
          assert(attributes["gpt_reply"] === "this is mock gpt reply");
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.post('/api/qa', function (req, res) {

      assert(req.body.temperature === 0.7)
      assert(req.body.max_tokens === 1000)
      assert(req.body.top_k === 2)
      assert(req.body.question === "this is the question: come ti chiami")
      assert(req.body.system_context === "this is the context: sei un assistente fantastico")

      let reply = {}
      let http_code = 200;
      if (!req.body.question) {
        reply.error = "question field is mandatory"
        http_code = 400;
      }
      else if (!req.body.model) {
        reply.error = "model field is mandatory"
        http_code = 400;
      }
      else {
        reply = {
          answer: "this is mock gpt reply",
          success: true,
          source_url: "http://test"
        }
      }

      res.status(http_code).send(reply);
    });

    endpointServer.get('/:project_id/integration/name/:name', function (req, res) {
      let http_code = 200;
      let reply = {
        _id: "656728224b45965b69111111",
        id_project: "62c3f10152dc740035000000",
        name: "openai",
        value: {
          apikey: "example_api_key",
          organization: "TIledesk"
        }
      }

      res.status(http_code).send(reply);
    })

    endpointServer.get('/:project_id/integration/name/:name', function (req, res) {

      let http_code = 200;
      let reply = {
        _id: "656728224b45965b69111111",
        id_project: "62c3f10152dc740035000000",
        name: "openai",
        value: {
          apikey: "example_api_key",
          organization: "TIledesk"
        }
      }

      res.status(http_code).send(reply);
    })

    // no longer used in this test --> key retrieved from integrations
    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = { gptkey: "sk-123456" };
      let http_code = 200;

      res.status(http_code).send(reply);
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      // console.log('endpointServer started', listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/gpt_success_advanced_context{"last_user_message":"come ti chiami", "custom_context":"sei un assistente fantastico"}',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": "XXX"
      }
      sendMessageToBot(request, BOT_ID, () => {
        // console.log("Message sent:\n", request);
      });
    });
  });
  
  it('/gpt_success (key from kbsettings) - invokes the askgpt mockup and test the returning attributes', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command2 = message.attributes.commands[1];
      assert(command2.type === "message");
      assert(command2.message.text === "gpt replied: this is mock gpt reply");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          //console.log("final attributes:", JSON.stringify(attributes));
          assert(attributes);
          assert(attributes["gpt_reply"] === "this is mock gpt reply");
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.post('/api/qa', function (req, res) {
      let reply = {}
      let http_code = 200;
      if (!req.body.question) {
        reply.error = "question field is mandatory"
        http_code = 400;
      }
      else if (!req.body.model) {
        reply.error = "model field is mandatory"
        http_code = 400;
      }
      else {
        reply = {
          answer: "this is mock gpt reply",
          success: true,
          source_url: "http://test"
        }
      }

      res.status(http_code).send(reply);
    });


    endpointServer.get('/:project_id/integration/name/:name', function (req, res) {

      let http_code = 200;
      let reply = "Integration not found";

      res.status(http_code).send(reply);
    })

    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = { gptkey: "sk-123456" };
      let http_code = 200;

      res.status(http_code).send(reply);
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      console.log('endpointServer started', listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/gpt_success{"last_user_message":"come ti chiami"}',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": "XXX"
      }
      sendMessageToBot(request, BOT_ID, () => {
        console.log("Message sent:\n", request);
      });
    });
  });

  it('/gpt_fail_no_answer - the ask service does not return a relevant answer', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command2 = message.attributes.commands[1];
      assert(command2.type === "message");
      assert(command2.message.text === "gpt replied: No answers");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          // console.log("final attributes:", JSON.stringify(attributes));
          assert(attributes);
          assert(attributes["gpt_reply"] === "No answers");
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.post('/api/qa', function (req, res) {
      let reply = {}
      let http_code = 200;
      if (!req.body.question) {
        reply.error = "question field is mandatory"
        http_code = 400;
      }
      else if (!req.body.model) {
        reply.error = "model field is mandatory"
        http_code = 400;
      }
      else {
        reply = {
          answer: "No answers",
          success: false
        }
      }

      res.status(http_code).send(reply);
    });

    endpointServer.get('/:project_id/integration/name/:name', function (req, res) {

      let http_code = 200;
      let reply = {
        _id: "656728224b45965b69111111",
        id_project: "62c3f10152dc740035000000",
        name: "openai",
        value: {
          apikey: "example_api_key",
          organization: "TIledesk"
        }
      }

      res.status(http_code).send(reply);
    })

    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = { gptkey: "sk-123456" };
      let http_code = 200;

      res.status(http_code).send(reply);
    });


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      // console.log('endpointServer started', listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/gpt_fail',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": "XXX"
      }
      sendMessageToBot(request, BOT_ID, () => {
        // console.log("Message sent:\n", request);
      });
    });
  });

  it('/gpt_fail_undefined_key - move to false intent if gptkey does not exists (key undefined)', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command2 = message.attributes.commands[1];
      assert(command2.type === "message");
      assert(command2.message.text === "gpt replied: No answers");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          // console.log("final attributes:", JSON.stringify(attributes));
          assert(attributes);
          assert(attributes["gpt_reply"] === "No answers");
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.get('/:project_id/integration/name/:name', function (req, res) {

      let http_code = 200;
      let reply = "Integration not found";

      res.status(http_code).send(reply);
    })

    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = { gptkey: undefined };
      let http_code = 200;

      res.status(http_code).send(reply);
    });


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      // console.log('endpointServer started', listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/gpt_fail',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": "XXX"
      }
      sendMessageToBot(request, BOT_ID, () => {
        // console.log("Message sent:\n", request);
      });
    });
  });

  it('/gpt_fail_missing_key - move to false intent if gptkey does not exists (missing key)', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command2 = message.attributes.commands[1];
      assert(command2.type === "message");
      assert(command2.message.text === "gpt replied: No answers");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          // console.log("final attributes:", JSON.stringify(attributes));
          assert(attributes);
          assert(attributes["gpt_reply"] === "No answers");
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.get('/:project_id/integration/name/:name', function (req, res) {

      let http_code = 200;
      let reply = "Integration not found";

      res.status(http_code).send(reply);
    })


    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = {};
      reply.error = "no knowledge base settings found"
      http_code = 404;

      res.status(http_code).send(reply);
    });


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      // console.log('endpointServer started', listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/gpt_fail',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": "XXX"
      }
      sendMessageToBot(request, BOT_ID, () => {
        // console.log("Message sent:\n", request);
      });
    });
  });

  it('/gpt_fail_noquestion - action question is undefined', (done) => {
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command2 = message.attributes.commands[1];
      assert(command2.type === "message");
      assert(command2.message.text === "gpt replied: No answers");
   
      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          // console.log("final attributes:", JSON.stringify(attributes));
          assert(attributes);
          assert(attributes["gpt_reply"] === "No answers");
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
        name: "openai",
        value: {
          apikey: "example_api_key",
          organization: "TIledesk"
        }
      }

      res.status(http_code).send(reply);
    })

    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = {};
      reply.error = "no knowledge base settings found"
      http_code = 404;

      res.status(http_code).send(reply);
    });


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      // console.log('endpointServer started', listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/gpt_fail_noquestion',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": "XXX"
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
