var assert = require('assert');
let axios = require('axios');
const tybot = require("..");
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
const bots_data = require('./conversation-ai_prompt_bot').bots_data;
const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID";
const CHATBOT_TOKEN = "XXX";
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');
const tilebotService = require('../services/TilebotService');
const { TdCache } = require('../TdCache');

const NATIVE_MCP_CACHE_KEY = 'native_mcp:servers';

let SERVER_PORT = 10001

describe('Conversation for AiPrompt test', async () => {

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
          }, () => {
            winston.info("Tilebot route successfully started.");
            var port = SERVER_PORT;
            app_listener = app.listen(port, () => {
              winston.info('Tilebot connector listening on port ', port);
              resolve();
            });
          });
      }
      catch (error) {
        winston.error("error: ", error)
      }

    })
  });

  after(function (done) {
    app_listener.close(() => {
      done();
    });
  });

  describe('Missing parameters tests', async () => {

    it('AIPROMPT-FAIL-MISSING-QUESTION-PARAMETER', (done) => {
      
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
        winston.verbose('endpointServer started' + listener.address());
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
        tilebotService.sendMessageToBot(request, BOT_ID, () => {
          winston.verbose("Message sent:\n", request);
        });
      });

    })

    it('AIPROMPT-FAIL-MISSING-LLM-PARAMETER', (done) => {
      
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
        winston.verbose('endpointServer started' + listener.address());
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
        tilebotService.sendMessageToBot(request, BOT_ID, () => {
          winston.verbose("Message sent:\n", request);
        });
      });

    })

    it('AIPROMPT-FAIL-MISSING-MODEL-PARAMETER', (done) => {
      
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
        winston.verbose('endpointServer started' + listener.address());
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
        tilebotService.sendMessageToBot(request, BOT_ID, () => {
          winston.verbose("Message sent:\n", request);
        });
      });

    })

  })


  describe('Missing LLM key', async () => {

    it('AIPROMPT-FAIL-MISSING-LLM-KEY-IN-INTEGRATION', (done) => {
      
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
        winston.verbose('endpointServer started' + listener.address());
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
        tilebotService.sendMessageToBot(request, BOT_ID, () => {
          winston.verbose("Message sent:\n", request);
        });
      });

    })

  })

  describe('Ask Success', async () => {

    it('AIPROMPT-SUCCESS', (done) => {
      
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
        winston.verbose('endpointServer started' + listener.address());
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
        tilebotService.sendMessageToBot(request, BOT_ID, () => {
          winston.verbose("Message sent:\n", request);
        });
      });

    })

    it('AIPROMPT-SUCCESS-VLLM-MULTI-SERVER', (done) => {
      
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

        assert(req.params.name === 'vllm');

        let http_code = 200;
        let reply = {
          _id: "694ab906a51c8c2ad0933d19",
          id_project: "62c3f10152dc740035000000",
          name: "vllm",
          value: {
            servers: [
              {
                name: "Cerebras",
                url: "https://cerebras.example.cpm/",
                apikey: "cerebras_api_key",
                models: ["gpt-oss-30b", "llama3.1b"]
              },
              {
                name: "OpenRouter",
                url: "https://openrouter.example.cpm/",
                apikey: "openrouter_api_key",
                models: ["pippo", "pluto"]
              }
            ]
          }
        }

        res.status(http_code).send(reply);

      })

      endpointServer.post('/api/ask', function (req, res) {

        assert(req.body.llm === "vllm");
        assert(req.body.llm_key === "cerebras_api_key");
        assert(req.body.model.name === "gpt-oss-30b");
        assert(req.body.model.url === "https://cerebras.example.cpm/");
        assert(req.body.model.api_key === "cerebras_api_key");
        assert(req.body.model.provider === "vllm");
  
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
        winston.verbose('endpointServer started' + listener.address());
        let request = {
          "payload": {
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": '/ai_prompt_vllm_success',
            "id_project": PROJECT_ID,
            "metadata": "",
            "request": {
              "request_id": REQUEST_ID
            }
          },
          "token": "XXX"
        }
        tilebotService.sendMessageToBot(request, BOT_ID, () => {
          winston.verbose("Message sent:\n", request);
        });
      });

    })

    it('AIPROMPT-SUCCESS-OLLAMA', (done) => {
      
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

        assert(req.params.name === 'ollama');

        let http_code = 200;
        let reply = {
          _id: "656728224b45965b69111111",
          id_project: "62c3f10152dc740035000000",
          name: "ollama",
          value: {
            url: "http://localhost:10002/ollama/",
            token: "customtoken",
            models: [ 'mymodel1', 'mymodel2' ]
          }
        } 

        res.status(http_code).send(reply);

      })

      endpointServer.post('/api/ask', function (req, res) {

        assert(req.body.llm === "ollama");
        assert(req.body.llm_key === "");
        assert(req.body.model.name === "mymodel");
        assert(req.body.model.url === "http://localhost:10002/ollama/")
  
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

      // endpointServer.post('/api/ask', function (req, res) {

      //   assert(req.body.llm === "myllm");
      //   assert(req.body.model === "llmmodel");
      //   assert(req.body.llm_key === "example_api_key");
  
      //   let reply = {}
      //   let http_code = 200;
      //   reply = {
      //     answer: "this is the answer",
      //     chat_history_dict: {
      //       additionalProp1: { question: "string", answer: "string" },
      //       additionalProp2: { question: "string", answer: "string" },
      //       additionalProp3: { question: "string", answer: "string" }
      //     }
      //   }

      //   res.status(http_code).send(reply);
      // });

      listener = endpointServer.listen(10002, '0.0.0.0', () => {
        winston.verbose('endpointServer started' + listener.address());
        let request = {
          "payload": {
            "senderFullname": "guest#367e",
            "type": "text",
            "sender": "A-SENDER",
            "recipient": REQUEST_ID,
            "text": '/ai_prompt_ollama_success',
            "id_project": PROJECT_ID,
            "metadata": "",
            "request": {
              "request_id": REQUEST_ID
            }
          },
          "token": "XXX"
        }
        tilebotService.sendMessageToBot(request, BOT_ID, () => {
          winston.verbose("Message sent:\n", request);
        });
      });

    })

    it('AIPROMPT-SUCCESS-EXTERNAL-MCP', (done) => {
      
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
        assert(command2.message.text === "Answer: Risposta dall'agent");

        util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
          if (err) {
            assert.ok(false);
          }
          else {
            assert(attributes);
            assert(attributes["ai_reply"] === "Risposta dall'agent");
            listener.close(() => {
              done();
            });
          }
        });

      });

      endpointServer.get('/:project_id/integration/name/:name', function (req, res) {

        assert(req.params.name === 'myllm' || req.params.name === 'mcp');

        let integration_name = req.params.name;

        let http_code = 200;
        let reply = {};
        if (integration_name === 'myllm') {
          reply = {
            _id: "656728224b45965b69111111",
            id_project: "62c3f10152dc740035000000",
            name: "myllm",
            value: {
              apikey: "example_api_key",
            }
          }
        } else if (integration_name === 'mcp') {
          reply = {
            "_id": "694ab906a51c8c2ad0933d19",
            "id_project": "6613ff078890fc0013ad3c3a",
            "name": "mcp",
            "__v": 0,
            "value": {
              "servers": [
                {
                  "name": "Gmail",
                  "url": "https://ext.mcpserver.dev/3751cccb-a8e6-42da-a4d5-340024f66292",
                  "transport": "streamable_http",
                  "tools": [
                    {
                      "name": "GMAIL_CREATE_EMAIL_DRAFT",
                      "description": "Creates a Gmail email draft. All fields are optional per the Gmail API - drafts can be created with minimal content and edited later before sending. Supports To/Cc/Bcc recipients, subject, plain/HTML body (ensure `is_html=True` for HTML), attachments, and threading. When creating a draft reply to an existing thread (thread_id provided), leave subject empty to stay in the same thread; setting a subject will create a NEW thread instead."
                    },
                    {
                      "name": "GMAIL_DELETE_DRAFT",
                      "description": "Permanently deletes a specific Gmail draft using its ID; ensure the draft exists and the user has necessary permissions for the given `user_id`."
                    },
                    {
                      "name": "GMAIL_DELETE_MESSAGE",
                      "description": "Permanently deletes a specific email message by its ID from a Gmail mailbox; for `user_id`, use 'me' for the authenticated user or an email address to which the authenticated user has delegated access."
                    },
                    {
                      "name": "GMAIL_SEND_DRAFT",
                      "description": "Sends an existing draft email AS-IS to recipients already defined within the draft. IMPORTANT: This action does NOT accept recipient parameters (to, cc, bcc). The Gmail API's drafts/send endpoint sends drafts to whatever recipients are already set in the draft's To, Cc, and Bcc headers - it cannot add or override recipients. If the draft has no recipients, you must either: 1. Create a new draft with recipients using GMAIL_CREATE_EMAIL_DRAFT, then send it 2. Use GMAIL_SEND_EMAIL to send a new email directly with recipients This action only requires the draft_id parameter."
                    },
                    {
                      "name": "GMAIL_SEND_EMAIL",
                      "description": "Sends an email via Gmail API using the authenticated user's Google profile display name. At least one of 'to' (or 'recipient_email'), 'cc', or 'bcc' must be provided. At least one of subject or body must be provided. Requires `is_html=True` if the body contains HTML. For attachments, you must provide a FileUploadable object with valid `s3key` (obtained from a previous file download action like GMAIL_GET_ATTACHMENT), `mimetype` (e.g., 'image/png', 'application/pdf'), and `name` (filename). All common file types including PNG, JPG, PDF, MP4, etc. are supported. Gmail API limits total message size to ~25 MB after base64 encoding."
                    }
                  ],
                  "customHeaders": [
                    {
                      "enabled": true,
                      "key": "x-auth-token",
                      "value": "ak_wSj7YkT6yCOM-Z6mP-q9",
                      "revealValue": true
                    }
                  ]
                }
              ]
            }
          }
        } else {
          http_code = 404;
        }
  
        res.status(http_code).send(reply);

      })

      endpointServer.post('/api/ask', function (req, res) {

        assert(req.body.servers.Gmail);
        assert(req.body.servers.Gmail.url === "https://ext.mcpserver.dev/3751cccb-a8e6-42da-a4d5-340024f66292");
        assert(req.body.servers.Gmail.transport === "streamable_http");
        assert(req.body.servers.Gmail.enabled_tools.length === 2);
        assert(req.body.servers.Gmail.enabled_tools[0] === "GMAIL_SEND_EMAIL");
        assert(req.body.servers.Gmail.enabled_tools[1] === "GMAIL_SEND_DRAFT");
  
        let reply = {}
        let http_code = 200;
        reply = {
            answer: "Risposta dall'agent",
            chat_history_dict: {},
            prompt_token_info: null
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
            "text": '/ai_prompt_mcp',
            "id_project": PROJECT_ID,
            "metadata": "",
            "request": {
              "request_id": REQUEST_ID
            }
          },
          "token": "XXX"
        }
        tilebotService.sendMessageToBot(request, BOT_ID, () => {
          winston.verbose("Message sent:\n", request);
        });
      });

    })

    it('AIPROMPT-SUCCESS-NATIVE-MCP', (done) => {
      
      let listener;
      let endpointServer = express();
      endpointServer.use(bodyParser.json());
      const nativeMcpUrl = "http://localhost:10002/mcp/tiledesk-communicator";
      let testCache;

      const setupNativeMcpCache = async () => {
        testCache = new TdCache({
          host: process.env.REDIS_HOST,
          port: process.env.REDIS_PORT,
          password: process.env.REDIS_PASSWORD
        });
        await testCache.connect();
        await testCache.set(
          NATIVE_MCP_CACHE_KEY,
          JSON.stringify([
            {
              id: "tiledesk-communicator",
              url: nativeMcpUrl
            }
          ])
        );
      };

      const cleanupNativeMcpCache = async () => {
        if (testCache) {
          await testCache.del(NATIVE_MCP_CACHE_KEY);
        }
      };
      
      endpointServer.post('/:projectId/requests/:requestId/messages', (req, res) => {
        res.send({ success: true });
        const message = req.body;
        assert(message.attributes.commands !== null);
        assert(message.attributes.commands.length === 2);
        const command2 = message.attributes.commands[1];
        assert(command2.type === "message");
        assert(command2.message.text === "Answer: Risposta dall'agent");

        util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
          if (err) {
            assert.ok(false);
          }
          else {
            assert(attributes);
            assert(attributes["ai_reply"] === "Risposta dall'agent");
            cleanupNativeMcpCache().finally(() => {
              listener.close(() => {
                done();
              });
            });
          }
        });

      });

      endpointServer.get('/:project_id/integration/name/:name', function (req, res) {
        assert(req.params.name === 'myllm' || req.params.name === 'mcp');

        let reply = {};
        let http_code = 200;

        if (req.params.name === 'myllm') {
          reply = {
            _id: "656728224b45965b69111111",
            id_project: "62c3f10152dc740035000000",
            name: "myllm",
            value: {
              apikey: "example_api_key",
            }
          }
        }
        else if (req.params.name === 'mcp') {
          reply = {
            _id: "656728224b45965b69111112",
            id_project: "62c3f10152dc740035000000",
            name: "mcp",
            value: {
              servers: [
                {
                  id: "tiledesk-communicator",
                  name: "Tiledesk Communicator",
                  native: true,
                  transport: "streamable_http",
                  tools: [ "CHECK_AVAILABLE_AGENTS", "ASK_KB", "CLOSE_CONVERSATION" ],
                }
              ]
            }
          }
        }

        res.status(http_code).send(reply);

      })

      endpointServer.get('/:project_id/mcp/native', async function (req, res) {
        if (testCache) {
          await testCache.set(
            NATIVE_MCP_CACHE_KEY,
            JSON.stringify([
              {
                id: "tiledesk-communicator",
                url: nativeMcpUrl
              }
            ])
          );
        }
        res.status(200).send({ success: true });
      });

      endpointServer.post('/api/ask', function (req, res) {

        assert(req.body.servers["Tiledesk Communicator"]);
        assert(req.body.servers["Tiledesk Communicator"].url === nativeMcpUrl);
        assert(req.body.servers["Tiledesk Communicator"].transport === "streamable_http");
        assert(req.body.servers["Tiledesk Communicator"].enabled_tools.length === 2);
        assert(req.body.servers["Tiledesk Communicator"].enabled_tools[0] === "ASK_KB");
        assert(req.body.servers["Tiledesk Communicator"].enabled_tools[1] === "CHECK_AVAILABLE_AGENTS");
        assert(req.body.servers["Tiledesk Communicator"].headers["x-chatbotToken"] === "XXX");
        assert(req.body.servers["Tiledesk Communicator"].headers["x-project-id"] === PROJECT_ID);
        assert(req.body.servers["Tiledesk Communicator"].headers["x-conversation-id"].startsWith("support-group-projectID"));
        assert(req.body.servers["Tiledesk Communicator"].headers["x-chatbot-name"] === "Your bot");
        assert(req.body.servers["Tiledesk Communicator"].headers["x-chatbot-id"] === "botID");
        assert(req.body.servers["Tiledesk Communicator"].headers["x-last-user-text"] === "/ai_prompt_native_mcp_tools");

        let reply = {}
        let http_code = 200;
        reply = {
            answer: "Risposta dall'agent",
            chat_history_dict: {},
            prompt_token_info: null
        }

        res.status(http_code).send(reply);
      });

      setupNativeMcpCache().then(() => {
        listener = endpointServer.listen(10002, '0.0.0.0', () => {
          winston.verbose('endpointServer started' + listener.address());
          let request = {
            "payload": {
              "senderFullname": "guest#367e",
              "type": "text",
              "sender": "A-SENDER",
              "recipient": REQUEST_ID,
              "text": '/ai_prompt_native_mcp_tools',
              "id_project": PROJECT_ID,
              "metadata": "",
              "request": {
                "request_id": REQUEST_ID
              }
            },
            "token": "XXX"
          }
          tilebotService.sendMessageToBot(request, BOT_ID, () => {
            winston.verbose("Message sent:\n", request);
          });
        });
      }).catch((err) => {
        winston.error("Error setting up native MCP cache: ", err);
        done(err);
      });

    })

  })

  describe('Ask Fail', async () => {

    it('AIPROMPT-FAIL', (done) => {
      
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
        winston.verbose('endpointServer started' + listener.address());
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
        tilebotService.sendMessageToBot(request, BOT_ID, () => {
          winston.verbose("Message sent:\n", request);
        });
      });

    })

  })
  
});

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
    }
  );
}

function myrequest(options, callback) {
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
