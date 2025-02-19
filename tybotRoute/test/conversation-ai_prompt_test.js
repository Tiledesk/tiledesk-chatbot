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
const bots_data = require('./conversation-ai_prompt_bot').bots_data;
const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID";
const CHATBOT_TOKEN = "XXX";
const { TiledeskChatbotUtil } = require('../models/TiledeskChatbotUtil');

let SERVER_PORT = 10001

describe('Conversation for AiPrompt test', async () => {

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

  describe('Missing parameters tests', async () => {

    it('AiPrompt fail - missing question paramter', (done) => {
      
      let listener;
      let endpointServer = express();
      endpointServer.use(bodyParser.json());
      
      endpointServer.post('/:projectId/requests/:requestId/messages', (req, res) => {
        res.send({ success: true });
        const message = req.body;
        assert(message.attributes.commands !== null);
        assert(message.attributes.commands.length === 2);
        const command2 = message.attributes.commands[1];
        assert(command2.type === "message");
        assert(command2.message.text === "Error: AiPrompt Error: 'question' attribute is undefined");

        util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
          if (err) {
            assert.ok(false);
          }
          else {
            assert(attributes);
            assert(attributes["flowError"] === "AiPrompt Error: 'question' attribute is undefined");
            listener.close(() => {
              done();
            });
          }
        });

      });

      listener = endpointServer.listen(10002, '0.0.0.0', () => {
        let request = {
          "payload": {
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": '/ai_prompt_missing_question',
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

    })

    it('AiPrompt fail - missing llm paramter', (done) => {
      
      let listener;
      let endpointServer = express();
      endpointServer.use(bodyParser.json());
      
      endpointServer.post('/:projectId/requests/:requestId/messages', (req, res) => {
        res.send({ success: true });
        const message = req.body;
        assert(message.attributes.commands !== null);
        assert(message.attributes.commands.length === 2);
        const command2 = message.attributes.commands[1];
        assert(command2.message.text === "Error: AiPrompt Error: 'llm' attribute is undefined");

        util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
          if (err) {
            assert.ok(false);
          }
          else {
            assert(attributes);
            assert(attributes["flowError"] === "AiPrompt Error: 'llm' attribute is undefined");
            listener.close(() => {
              done();
            });
          }
        });

      });

      listener = endpointServer.listen(10002, '0.0.0.0', () => {
        let request = {
          "payload": {
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": '/ai_prompt_missing_llm',
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

    })

    it('AiPrompt fail - missing model paramter', (done) => {
      
      let listener;
      let endpointServer = express();
      endpointServer.use(bodyParser.json());
      
      endpointServer.post('/:projectId/requests/:requestId/messages', (req, res) => {
        res.send({ success: true });
        const message = req.body;
        assert(message.attributes.commands !== null);
        assert(message.attributes.commands.length === 2);
        const command2 = message.attributes.commands[1];
        assert(command2.type === "message");
        assert(command2.message.text === "Error: AiPrompt Error: 'model' attribute is undefined");

        util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
          if (err) {
            assert.ok(false);
          }
          else {
            assert(attributes);
            assert(attributes["flowError"] === "AiPrompt Error: 'model' attribute is undefined");
            listener.close(() => {
              done();
            });
          }
        });

      });

      listener = endpointServer.listen(10002, '0.0.0.0', () => {
        let request = {
          "payload": {
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": '/ai_prompt_missing_model',
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

    })

  })


  describe('Missing LLM key', async () => {

    it('AiPrompt fail - missing llm key in integration', (done) => {
      
      let listener;
      let endpointServer = express();
      endpointServer.use(bodyParser.json());
      
      endpointServer.post('/:projectId/requests/:requestId/messages', (req, res) => {
        res.send({ success: true });
        const message = req.body;
        assert(message.attributes.commands !== null);
        assert(message.attributes.commands.length === 2);
        const command2 = message.attributes.commands[1];
        assert(command2.type === "message");
        assert(command2.message.text === "Error: AiPrompt Error: missing key for llm myllm");

        util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
          if (err) {
            assert.ok(false);
          }
          else {
            assert(attributes);
            assert(attributes["flowError"] === "AiPrompt Error: missing key for llm myllm");
            listener.close(() => {
              done();
            });
          }
        });

      });

      endpointServer.get('/:project_id/integration/name/:name', function (req, res) {

        assert(req.params.name === 'myllm');

        let http_code = 404;
        let reply = "Integration not found for model " + req.params.nane
  
        res.status(http_code).send(reply);

      })


      listener = endpointServer.listen(10002, '0.0.0.0', () => {
        let request = {
          "payload": {
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": '/ai_prompt_missing_llm_key',
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

    })

  })

  describe('Ask Success', async () => {

    it('AiPrompt success - invokes the aiprompt mockup and test the returning attributes', (done) => {
      
      let listener;
      let endpointServer = express();
      endpointServer.use(bodyParser.json());
      
      endpointServer.post('/:projectId/requests/:requestId/messages', (req, res) => {
        res.send({ success: true });
        const message = req.body;
        assert(message.attributes.commands !== null);
        assert(message.attributes.commands.length === 2);
        const command2 = message.attributes.commands[1];
        assert(command2.type === "message");
        assert(command2.message.text === "Answer: this is the answer");

        util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
          if (err) {
            assert.ok(false);
          }
          else {
            assert(attributes);
            assert(attributes["ai_reply"] === "this is the answer");
            listener.close(() => {
              done();
            });
          }
        });

      });

      endpointServer.get('/:project_id/integration/name/:name', function (req, res) {

        assert(req.params.name === 'myllm');

        let http_code = 200;
        let reply = {
          _id: "656728224b45965b69111111",
          id_project: "62c3f10152dc740035000000",
          name: "myllm",
          value: {
            apikey: "example_api_key",
          }
        }
  
        res.status(http_code).send(reply);

      })

      endpointServer.post('/api/ask', function (req, res) {

        assert(req.body.llm === "myllm");
        assert(req.body.model === "llmmodel");
        assert(req.body.llm_key === "example_api_key");
  
        let reply = {}
        let http_code = 200;
        reply = {
          answer: "this is the answer",
          chat_history_dict: {
            additionalProp1: { question: "string", answer: "string" },
            additionalProp2: { question: "string", answer: "string" },
            additionalProp3: { question: "string", answer: "string" }
          }
        }

        res.status(http_code).send(reply);
      });

      listener = endpointServer.listen(10002, '0.0.0.0', () => {
        let request = {
          "payload": {
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": '/ai_prompt_missing_llm_key',
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

    })

  })

  describe('Ask Fail', async () => {

    it('AiPrompt fail - invokes the aiprompt mockup and test the returning attributes', (done) => {
      
      let listener;
      let endpointServer = express();
      endpointServer.use(bodyParser.json());
      
      endpointServer.post('/:projectId/requests/:requestId/messages', (req, res) => {
        res.send({ success: true });
        const message = req.body;
        assert(message.attributes.commands !== null);
        assert(message.attributes.commands.length === 2);
        const command2 = message.attributes.commands[1];
        assert(command2.type === "message");
        assert(command2.message.text === "Error: AiPrompt Error: this is the error message");

        util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
          if (err) {
            assert.ok(false);
          }
          else {
            assert(attributes);
            assert(attributes["flowError"] === "AiPrompt Error: this is the error message");
            listener.close(() => {
              done();
            });
          }
        });

      });

      endpointServer.get('/:project_id/integration/name/:name', function (req, res) {

        assert(req.params.name === 'myllm');

        let http_code = 200;
        let reply = {
          _id: "656728224b45965b69111111",
          id_project: "62c3f10152dc740035000000",
          name: "myllm",
          value: {
            apikey: "example_api_key",
          }
        }
  
        res.status(http_code).send(reply);

      })

      endpointServer.post('/api/ask', function (req, res) {

        assert(req.body.llm === "myllm");
        assert(req.body.model === "llmmodel");
        assert(req.body.llm_key === "example_api_key");
  
        let reply = {}
        let http_code = 422;
        reply = {
          detail: [
            {
              loc: [
                "string",
                0
              ],
              msg: "this is the error message",
              type: "string"
            }
          ]
        }

        res.status(http_code).send(reply);
      });

      listener = endpointServer.listen(10002, '0.0.0.0', () => {
        let request = {
          "payload": {
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": '/ai_prompt_missing_llm_key',
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

    })

  })
  
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
