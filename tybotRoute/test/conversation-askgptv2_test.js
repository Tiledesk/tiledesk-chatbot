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
            log: process.env.TILEBOT_LOG
          }, () => {
            winston.info("Tilebot route successfully started.");
            var port = SERVER_PORT;
            app_listener = app.listen(port, () => {
              winston.info('Tilebot connector listening on port ' + port);
              resolve();
            });
          });
      }
      catch (error) {
        winston.error("error:", error)
      }

    })
  });

  after(function (done) {
    app_listener.close(() => {
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
          assert(attributes);
          assert(attributes["gpt_reply"] === "this is mock gpt reply");
          assert(attributes["gpt_source"] === "http://gethelp.test.com/article");
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.post('/api/qa', function (req, res) {

      assert(req.body.engine !== null);
      assert(req.body.engine !== undefined);
      assert(req.body.engine.name === 'pinecone');
      assert(req.body.engine.type === 'serverless');

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
          id: "123456789",
          ids: ["9876543210", "0123456789"],
          source: "http://gethelp.test.com/article",
          sources: [ "TextArticle", "http://gethelp.test.com/article"],
          prompt_token_size: 762
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

    // no longer used in this test --> key retrieved from integrations
    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = { gptkey: "sk-123456" };
      let http_code = 200;

      res.status(http_code).send(reply);
    });

    endpointServer.get('/:project_id/kb/namespace/all', function (req, res) {

      let http_code = 200;

      let reply = [
        {
          default: true,
          id_project: "62c3f10152dc7400352b0000",
          id: "projectID",
          name: "Default",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 128,
            temperature: 0.7,
            top_k: 4
          },
          engine: {
            name: "pinecone",
            type: "serverless",
            apikey: "",
            vector_size: 1536,
            index_name: "example-index"
          },
          createdAt: "2024-06-06T15:50:27.970Z",
          updatedAt: "2024-06-24T15:31:11.224Z"
        },
        {
          default: false,
          id_project: "62c3f10152dc7400352b0000",
          id: "666708c13d20c7002d68fa90",
          name: "Second Namespace",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 512,
            temperature: 0.7,
            top_k: 4,
          },
          createdAt: "2024-06-10T14:08:01.601Z",
          updatedAt: "2024-06-12T08:11:04.208Z"
        },
        {
          default: false,
          id_project: "62c3f10152dc7400352b0000",
          id: "6679917bfc0f8a002d72ec54",
          name: "Test Namespace",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 256,
            temperature: 0.7,
            top_k: 4,
            context: "You are an awesome AI Assistant."
          },
          createdAt: "2024-06-10T14:08:01.601Z",
          updatedAt: "2024-06-12T08:11:04.208Z"
        },
      ]

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
        winston.verbose("Message sent:\n", request);
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
      assert(req.body.system_context === "this is the context: sei un assistente fantastico\nYou are an helpful assistant for question-answering tasks.\nUse ONLY the pieces of retrieved context delimited by #### to answer the question.\nIf you don't know the answer, just say that you don't know.\nIf and only if none of the retrieved context is useful for your task, add this word to the end <NOANS>\n\n####{context}####")

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

    endpointServer.get('/:project_id/kb/namespace/all', function (req, res) {

      let http_code = 200;

      let reply = [
        {
          default: true,
          id_project: "62c3f10152dc7400352b0000",
          id: "projectID",
          name: "Default",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 128,
            temperature: 0.7,
            top_k: 4
          },
          createdAt: "2024-06-06T15:50:27.970Z",
          updatedAt: "2024-06-24T15:31:11.224Z"
        },
        {
          default: false,
          id_project: "62c3f10152dc7400352b0000",
          id: "666708c13d20c7002d68fa90",
          name: "Second Namespace",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 512,
            temperature: 0.7,
            top_k: 4,
          },
          createdAt: "2024-06-10T14:08:01.601Z",
          updatedAt: "2024-06-12T08:11:04.208Z"
        },
        {
          default: false,
          id_project: "62c3f10152dc7400352b0000",
          id: "6679917bfc0f8a002d72ec54",
          name: "Test Namespace",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 256,
            temperature: 0.7,
            top_k: 4,
            context: "You are an awesome AI Assistant."
          },
          createdAt: "2024-06-10T14:08:01.601Z",
          updatedAt: "2024-06-12T08:11:04.208Z"
        },
      ]

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
        winston.verbose("Message sent:\n", request);
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

    endpointServer.get('/:project_id/kb/namespace/all', function (req, res) {

      let http_code = 200;

      let reply = [
        {
          default: true,
          id_project: "62c3f10152dc7400352b0000",
          id: "projectID",
          name: "Default",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 128,
            temperature: 0.7,
            top_k: 4
          },
          createdAt: "2024-06-06T15:50:27.970Z",
          updatedAt: "2024-06-24T15:31:11.224Z"
        },
        {
          default: false,
          id_project: "62c3f10152dc7400352b0000",
          id: "666708c13d20c7002d68fa90",
          name: "Second Namespace",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 512,
            temperature: 0.7,
            top_k: 4,
          },
          createdAt: "2024-06-10T14:08:01.601Z",
          updatedAt: "2024-06-12T08:11:04.208Z"
        },
        {
          default: false,
          id_project: "62c3f10152dc7400352b0000",
          id: "6679917bfc0f8a002d72ec54",
          name: "Test Namespace",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 256,
            temperature: 0.7,
            top_k: 4,
            context: "You are an awesome AI Assistant."
          },
          createdAt: "2024-06-10T14:08:01.601Z",
          updatedAt: "2024-06-12T08:11:04.208Z"
        },
      ]

      res.status(http_code).send(reply);
    })

    // no longer used in this test --> key retrieved from integrations
    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = { gptkey: "sk-123456" };
      let http_code = 200;

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
        winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('/gpt_success_namespace_as_name (key from integrations) - invokes the askgpt mockup with temperature, max_token, top_k, context and test the returning attributes', (done) => {
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

    endpointServer.get('/:project_id/kb/namespace/all', function (req, res) {

      let http_code = 200;

      let reply = [
        {
          default: true,
          id_project: "62c3f10152dc7400352b0000",
          id: "62c3f10152dc7400352bab0d",
          name: "Default",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 128,
            temperature: 0.7,
            top_k: 4
          },
          createdAt: "2024-06-06T15:50:27.970Z",
          updatedAt: "2024-06-24T15:31:11.224Z"
        },
        {
          default: false,
          id_project: "62c3f10152dc7400352b0000",
          id: "666708c13d20c7002d68fa90",
          name: "Second Namespace",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 512,
            temperature: 0.7,
            top_k: 4,
          },
          createdAt: "2024-06-10T14:08:01.601Z",
          updatedAt: "2024-06-12T08:11:04.208Z"
        },
        {
          default: false,
          id_project: "62c3f10152dc7400352b0000",
          id: "6679917bfc0f8a002d72ec54",
          name: "Test Namespace",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 256,
            temperature: 0.7,
            top_k: 4,
            context: "You are an awesome AI Assistant."
          },
          createdAt: "2024-06-10T14:08:01.601Z",
          updatedAt: "2024-06-12T08:11:04.208Z"
        },
      ]

      res.status(http_code).send(reply);
    })

    // no longer used in this test --> key retrieved from integrations
    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = { gptkey: "sk-123456" };
      let http_code = 200;

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
          "text": '/gpt_success_namespace_as_name{"last_user_message":"come ti chiami", "custom_context":"sei un assistente fantastico"}',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": "XXX"
      }
      sendMessageToBot(request, BOT_ID, () => {
        winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('/gpt_success_namespace_as_name_custom_attribute (key from integrations) - invokes the askgpt mockup with temperature, max_token, top_k, context and test the returning attributes', (done) => {
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

    endpointServer.get('/:project_id/kb/namespace/all', function (req, res) {

      let http_code = 200;

      let reply = [
        {
          default: true,
          id_project: "62c3f10152dc7400352b0000",
          id: "62c3f10152dc7400352bab0d",
          name: "Default",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 128,
            temperature: 0.7,
            top_k: 4
          },
          createdAt: "2024-06-06T15:50:27.970Z",
          updatedAt: "2024-06-24T15:31:11.224Z"
        },
        {
          default: false,
          id_project: "62c3f10152dc7400352b0000",
          id: "666708c13d20c7002d68fa90",
          name: "Second Namespace",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 512,
            temperature: 0.7,
            top_k: 4,
          },
          createdAt: "2024-06-10T14:08:01.601Z",
          updatedAt: "2024-06-12T08:11:04.208Z"
        },
        {
          default: false,
          id_project: "62c3f10152dc7400352b0000",
          id: "6679917bfc0f8a002d72ec54",
          name: "Test Namespace",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 256,
            temperature: 0.7,
            top_k: 4,
            context: "You are an awesome AI Assistant."
          },
          createdAt: "2024-06-10T14:08:01.601Z",
          updatedAt: "2024-06-12T08:11:04.208Z"
        },
      ]

      res.status(http_code).send(reply);
    })

    // no longer used in this test --> key retrieved from integrations
    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = { gptkey: "sk-123456" };
      let http_code = 200;

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
          "text": '/gpt_success_namespace_as_name_custom_attribute{"last_user_message":"come ti chiami", "custom_context":"sei un assistente fantastico", "ns_name": "Namespace" }',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": "XXX"
      }
      sendMessageToBot(request, BOT_ID, () => {
        winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('/gpt_success_citations_on (key from integrations) - invokes the askgpt mockup and test the returning attributes', (done) => {
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
          assert(attributes);
          assert(attributes["gpt_reply"] === "this is mock gpt reply");
          assert(attributes["gpt_source"] === "http://gethelp.test.com/article");
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
          id: "123456789",
          ids: ["9876543210", "0123456789"],
          source: "http://gethelp.test.com/article",
          sources: [ "TextArticle", "http://gethelp.test.com/article"],
          prompt_token_size: 762,
          citations: [
            {
              source_id: 0,
              source_name: "TextArticle"
            }
          ],
          
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

    endpointServer.get('/:project_id/kb/namespace/all', function (req, res) {

      let http_code = 200;

      let reply = [
        {
          default: true,
          id_project: "62c3f10152dc7400352b0000",
          id: "projectID",
          name: "Default",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 128,
            temperature: 0.7,
            top_k: 4
          },
          createdAt: "2024-06-06T15:50:27.970Z",
          updatedAt: "2024-06-24T15:31:11.224Z"
        },
        {
          default: false,
          id_project: "62c3f10152dc7400352b0000",
          id: "666708c13d20c7002d68fa90",
          name: "Second Namespace",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 512,
            temperature: 0.7,
            top_k: 4,
          },
          createdAt: "2024-06-10T14:08:01.601Z",
          updatedAt: "2024-06-12T08:11:04.208Z"
        },
        {
          default: false,
          id_project: "62c3f10152dc7400352b0000",
          id: "6679917bfc0f8a002d72ec54",
          name: "Test Namespace",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 256,
            temperature: 0.7,
            top_k: 4,
            context: "You are an awesome AI Assistant."
          },
          createdAt: "2024-06-10T14:08:01.601Z",
          updatedAt: "2024-06-12T08:11:04.208Z"
        },
      ]

      res.status(http_code).send(reply);
    })

    // no longer used in this test --> key retrieved from integrations
    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = { gptkey: "sk-123456" };
      let http_code = 200;

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
          "text": '/gpt_success_citations_on{"last_user_message":"come ti chiami"}',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": "XXX"
      }
      sendMessageToBot(request, BOT_ID, () => {
        winston.verbose("Message sent:\n", request);
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

    endpointServer.get('/:project_id/kb/namespace/all', function (req, res) {

      let http_code = 200;

      let reply = [
        {
          default: true,
          id_project: "62c3f10152dc7400352b0000",
          id: "projectID",
          name: "Default",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 128,
            temperature: 0.7,
            top_k: 4
          },
          createdAt: "2024-06-06T15:50:27.970Z",
          updatedAt: "2024-06-24T15:31:11.224Z"
        },
        {
          default: false,
          id_project: "62c3f10152dc7400352b0000",
          id: "666708c13d20c7002d68fa90",
          name: "Second Namespace",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 512,
            temperature: 0.7,
            top_k: 4,
          },
          createdAt: "2024-06-10T14:08:01.601Z",
          updatedAt: "2024-06-12T08:11:04.208Z"
        },
        {
          default: false,
          id_project: "62c3f10152dc7400352b0000",
          id: "6679917bfc0f8a002d72ec54",
          name: "Test Namespace",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 256,
            temperature: 0.7,
            top_k: 4,
            context: "You are an awesome AI Assistant."
          },
          createdAt: "2024-06-10T14:08:01.601Z",
          updatedAt: "2024-06-12T08:11:04.208Z"
        },
      ]

      res.status(http_code).send(reply);
    })

    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = { gptkey: "sk-123456" };
      let http_code = 200;

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
        winston.verbose("Message sent:\n", request);
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

    endpointServer.get('/:project_id/kb/namespace/all', function (req, res) {

      let http_code = 200;

      let reply = [
        {
          default: true,
          id_project: "62c3f10152dc7400352b0000",
          id: "projectID",
          name: "Default",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 128,
            temperature: 0.7,
            top_k: 4
          },
          createdAt: "2024-06-06T15:50:27.970Z",
          updatedAt: "2024-06-24T15:31:11.224Z"
        },
        {
          default: false,
          id_project: "62c3f10152dc7400352b0000",
          id: "666708c13d20c7002d68fa90",
          name: "Second Namespace",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 512,
            temperature: 0.7,
            top_k: 4,
          },
          createdAt: "2024-06-10T14:08:01.601Z",
          updatedAt: "2024-06-12T08:11:04.208Z"
        },
        {
          default: false,
          id_project: "62c3f10152dc7400352b0000",
          id: "6679917bfc0f8a002d72ec54",
          name: "Test Namespace",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 256,
            temperature: 0.7,
            top_k: 4,
            context: "You are an awesome AI Assistant."
          },
          createdAt: "2024-06-10T14:08:01.601Z",
          updatedAt: "2024-06-12T08:11:04.208Z"
        },
      ]

      res.status(http_code).send(reply);
    })

    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = { gptkey: "sk-123456" };
      let http_code = 200;

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
        winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('/gpt_fail_empty_kb - the ask service does not return a relevant answer', (done) => {
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
      let http_code = 400;

      reply = {
        "success": false,
        "statusText": "Bad Request",
        "error": {
          "answer": "No answer",
          "success": false,
          "namespace": "66ec24a028a0c600130baa6a",
          "id": null,
          "ids": null,
          "source": null,
          "sources": null,
          "citations": null,
          "content_chunks": null,
          "prompt_token_size": 0,
          "error_message": "IndexError('list index out of range')",
          "chat_history_dict": {}
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

    endpointServer.get('/:project_id/kb/namespace/all', function (req, res) {

      let http_code = 200;

      let reply = [
        {
          default: true,
          id_project: "62c3f10152dc7400352b0000",
          id: "projectID",
          name: "Default",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 128,
            temperature: 0.7,
            top_k: 4
          },
          createdAt: "2024-06-06T15:50:27.970Z",
          updatedAt: "2024-06-24T15:31:11.224Z"
        },
        {
          default: false,
          id_project: "62c3f10152dc7400352b0000",
          id: "666708c13d20c7002d68fa90",
          name: "Second Namespace",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 512,
            temperature: 0.7,
            top_k: 4,
          },
          createdAt: "2024-06-10T14:08:01.601Z",
          updatedAt: "2024-06-12T08:11:04.208Z"
        },
        {
          default: false,
          id_project: "62c3f10152dc7400352b0000",
          id: "6679917bfc0f8a002d72ec54",
          name: "Test Namespace",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 256,
            temperature: 0.7,
            top_k: 4,
            context: "You are an awesome AI Assistant."
          },
          createdAt: "2024-06-10T14:08:01.601Z",
          updatedAt: "2024-06-12T08:11:04.208Z"
        },
      ]

      res.status(http_code).send(reply);
    })

    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = { gptkey: "sk-123456" };
      let http_code = 200;

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
        winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('/gpt_fail_undefined_key - move to false intent if gptkey does not exists (key undefined)', (done) => {
    
    process.env.GPTKEY='' // Used to nullify the env variable
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
      winston.verbose('endpointServer started' + listener.address());
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
        winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('/gpt_fail_missing_key - move to false intent if gptkey does not exists (missing key)', (done) => {
    
    process.env.GPTKEY='' // Used to nullify the env variable
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
      winston.verbose('endpointServer started' + listener.address());
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
        winston.verbose("Message sent:\n", request);
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
      winston.verbose('endpointServer started' + listener.address());
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
        winston.verbose("Message sent:\n", request);
      });
    });
  });

  it('/gpt_fail_missing_namespace - namespace not found with id', (done) => {
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
          assert(attributes);
          assert(attributes["gpt_reply"] === "No answers");
          assert(attributes["flowError"] === "AskGPT Error: namespace not found");
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.get('/:project_id/kb/namespace/all', function (req, res) {

      let http_code = 200;

      let reply = [
        {
          default: true,
          id_project: "62c3f10152dc7400352b0000",
          id: "projectID",
          name: "Default",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 128,
            temperature: 0.7,
            top_k: 4
          },
          engine: {
            name: "pinecone",
            type: "serverless",
            apikey: "",
            vector_size: 1536,
            index_name: "example-index"
          },
          createdAt: "2024-06-06T15:50:27.970Z",
          updatedAt: "2024-06-24T15:31:11.224Z"
        }
      ]

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

    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = {};
      reply.error = "no knowledge base settings found"
      http_code = 404;

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
          "text": '/gpt_fail_missing_namespace',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": "XXX"
      }
      sendMessageToBot(request, BOT_ID, () => {
        winston.verbose("Message sent:\n", request);
      });
    });
  })

  it('/gpt_fail_missing_namespace - namespace not found with name', (done) => {
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
          assert(attributes);
          assert(attributes["gpt_reply"] === "No answers");
          assert(attributes["flowError"] === "AskGPT Error: namespace not found");
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.get('/:project_id/kb/namespace/all', function (req, res) {

      let http_code = 200;

      let reply = [
        {
          default: true,
          id_project: "62c3f10152dc7400352b0000",
          id: "projectID",
          name: "Default",
          preview_settings: {
            model: "gpt-3.5-turbo",
            max_tokens: 128,
            temperature: 0.7,
            top_k: 4
          },
          engine: {
            name: "pinecone",
            type: "serverless",
            apikey: "",
            vector_size: 1536,
            index_name: "example-index"
          },
          createdAt: "2024-06-06T15:50:27.970Z",
          updatedAt: "2024-06-24T15:31:11.224Z"
        }
      ]

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

    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = {};
      reply.error = "no knowledge base settings found"
      http_code = 404;

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
          "text": '/gpt_fail_missing_namespace_name',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": REQUEST_ID
          }
        },
        "token": "XXX"
      }
      sendMessageToBot(request, BOT_ID, () => {
        winston.verbose("Message sent:\n", request);
      });
    });
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
  winston.verbose("sendMessageToBot URL" + url);
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
//    
//   const url = `${process.env.TILEBOT_ENDPOINT}/ext/parameters/requests/${requestId}?all`;
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
