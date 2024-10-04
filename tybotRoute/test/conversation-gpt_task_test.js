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
const bots_data = require('./conversation-gpt_task_bot.js').bots_data;
const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;
const { TiledeskChatbotUtil } = require('../models/TiledeskChatbotUtil');

let SERVER_PORT = 10001

describe('Conversation for GptTask test', async () => {

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

  it('/task gpt success (key from integrations) (old action without condition) - invokes the gpt task mockup and test the returning attributes', (done) => {

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
      assert(command2.message.text === "gpt replied: this is the answer");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["gpt_reply"] === "this is the answer");
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.post('/v1/chat/completions', function (req, res) {

      assert(req.headers.authorization === "Bearer example_api_key");

      let reply = {}
      let http_code = 200;

      if (!req.body.model) {
        reply.error = "you must provide a model parameter";
        http_code = 400;
      }
      else if (!req.body.messages) {
        reply.error = "'messages' is a required property";
        http_code = 400;
      }
      else if (req.body.messages && req.body.messages.length == 0) {
        reply.error = "'[] is too short - 'messages'"
        http_code = 400;
      }
      else {
        reply = {
          id: "chatcmpl-7ydspsF20mgTsl4g9yTK8LNbDDYAp",
          object: "chat.completion",
          created: 1694687347,
          model: "gpt-3.5-turbo-0613",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "this is the answer"
              },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: 30,
            completion_tokens: 48,
            total_tokens: 78
          }
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
          "text": '/gpt_task_no_condition',
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

  it('/gpt_task_response_format_json_object success (key from integrations) (old action without condition) - invokes the gpt task mockup and test the returning attributes', (done) => {

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
      assert(command2.message.text === "gpt replied: [object Object]");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert.equal(typeof attributes["gpt_reply"], 'object');
          let json = attributes["gpt_reply"];
          assert(json.firstname === 'John')
          assert(json.lastname === 'Doe')
          assert(json.age === 30)
          assert(json.phone_number === null)
          assert(json.city === 'London')

          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.post('/v1/chat/completions', function (req, res) {

      assert(req.headers.authorization === "Bearer example_api_key");
      assert(req.body.response_format.type === "json_object");

      let reply = {}
      let http_code = 200;

      if (!req.body.model) {
        reply.error = "you must provide a model parameter";
        http_code = 400;
      }
      else if (!req.body.messages) {
        reply.error = "'messages' is a required property";
        http_code = 400;
      }
      else if (req.body.messages && req.body.messages.length == 0) {
        reply.error = "'[] is too short - 'messages'"
        http_code = 400;
      }
      else {
        reply = {
          id: "chatcmpl-7ydspsF20mgTsl4g9yTK8LNbDDYAp",
          object: "chat.completion",
          created: 1694687347,
          model: "gpt-3.5-turbo-0613",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "{\n  \"firstname\": \"John\",\n  \"lastname\": \"Doe\",\n  \"age\": 30,\n  \"phone_number\": null,\n  \"city\": \"London\"\n}"
              },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: 30,
            completion_tokens: 48,
            total_tokens: 78
          }
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
          "text": '/gpt_task_response_format_json_object',
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

  it('/gpt_task_response_format_none success (key from integrations) (old action without condition) - invokes the gpt task mockup and test the returning attributes', (done) => {

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
      assert(command2.message.text === 'gpt replied: {\n  \"firstname\": \"John\",\n  \"lastname\": \"Doe\",\n  \"age\": 30,\n  \"phone_number\": null,\n  \"city\": \"London\"\n}');

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert.equal(typeof attributes["gpt_reply"], 'string');

          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.post('/v1/chat/completions', function (req, res) {

      assert(req.headers.authorization === "Bearer example_api_key");

      let reply = {}
      let http_code = 200;

      if (!req.body.model) {
        reply.error = "you must provide a model parameter";
        http_code = 400;
      }
      else if (!req.body.messages) {
        reply.error = "'messages' is a required property";
        http_code = 400;
      }
      else if (req.body.messages && req.body.messages.length == 0) {
        reply.error = "'[] is too short - 'messages'"
        http_code = 400;
      }
      else {
        reply = {
          id: "chatcmpl-7ydspsF20mgTsl4g9yTK8LNbDDYAp",
          object: "chat.completion",
          created: 1694687347,
          model: "gpt-3.5-turbo-0613",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "{\n  \"firstname\": \"John\",\n  \"lastname\": \"Doe\",\n  \"age\": 30,\n  \"phone_number\": null,\n  \"city\": \"London\"\n}"
              },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: 30,
            completion_tokens: 48,
            total_tokens: 78
          }
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
          "text": '/gpt_task_response_format_none',
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

  it('/task gpt success (key from integrations) (old action without condition) (json response)', (done) => {

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
      assert(command2.message.text === "John");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["gpt_reply"].firstname === "John");
          assert(attributes["gpt_reply"].lastname === "Doe");
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.post('/v1/chat/completions', function (req, res) {

      assert(req.headers.authorization === "Bearer example_api_key");

      let reply = {}
      let http_code = 200;

      if (!req.body.model) {
        reply.error = "you must provide a model parameter";
        http_code = 400;
      }
      else if (!req.body.messages) {
        reply.error = "'messages' is a required property";
        http_code = 400;
      }
      else if (req.body.messages && req.body.messages.length == 0) {
        reply.error = "'[] is too short - 'messages'"
        http_code = 400;
      }
      else {
        reply = {
          id: "chatcmpl-7ydspsF20mgTsl4g9yTK8LNbDDYAp",
          object: "chat.completion",
          created: 1694687347,
          model: "gpt-3.5-turbo-0613",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: '{ "firstname": "John", "lastname": "Doe" }'
              },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: 30,
            completion_tokens: 48,
            total_tokens: 78
          }
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
          "text": '/gpttask_no_condition_json',
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

  it('/task gpt success (key from integrations) (old action without condition) (mixed json response)', (done) => {

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
      assert(command2.message.text === 'This is your json: { "firstname": "John", "lastname": "Doe" }');

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["gpt_reply"] === 'This is your json: { "firstname": "John", "lastname": "Doe" }');
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.post('/v1/chat/completions', function (req, res) {

      assert(req.headers.authorization === "Bearer example_api_key");

      let reply = {}
      let http_code = 200;

      if (!req.body.model) {
        reply.error = "you must provide a model parameter";
        http_code = 400;
      }
      else if (!req.body.messages) {
        reply.error = "'messages' is a required property";
        http_code = 400;
      }
      else if (req.body.messages && req.body.messages.length == 0) {
        reply.error = "'[] is too short - 'messages'"
        http_code = 400;
      }
      else {
        reply = {
          id: "chatcmpl-7ydspsF20mgTsl4g9yTK8LNbDDYAp",
          object: "chat.completion",
          created: 1694687347,
          model: "gpt-3.5-turbo-0613",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: 'This is your json: { "firstname": "John", "lastname": "Doe" }'
              },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: 30,
            completion_tokens: 48,
            total_tokens: 78
          }
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
          "text": '/gpttask_no_condition_mixed_json',
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

  it('/task gpt success (key from integrations) - invokes the gpt task mockup and test the returning attributes', (done) => {

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
      assert(command2.message.text === "gpt replied: this is the answer");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["gpt_reply"] === "this is the answer");
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.post('/v1/chat/completions', function (req, res) {

      assert(req.headers.authorization === "Bearer example_api_key");

      let reply = {}
      let http_code = 200;

      if (!req.body.model) {
        reply.error = "you must provide a model parameter";
        http_code = 400;
      }
      else if (!req.body.messages) {
        reply.error = "'messages' is a required property";
        http_code = 400;
      }
      else if (req.body.messages && req.body.messages.length == 0) {
        reply.error = "'[] is too short - 'messages'"
        http_code = 400;
      }
      else {
        reply = {
          id: "chatcmpl-7ydspsF20mgTsl4g9yTK8LNbDDYAp",
          object: "chat.completion",
          created: 1694687347,
          model: "gpt-3.5-turbo-0613",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "this is the answer"
              },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: 30,
            completion_tokens: 48,
            total_tokens: 78
          }
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
          "text": '/gpt_task',
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

  it('/task gpt success (key from kbsettings) - invokes the gpt task mockup and test the returning attributes', (done) => {

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
      assert(command2.message.text === "gpt replied: this is the answer");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["gpt_reply"] === "this is the answer");
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.post('/v1/chat/completions', function (req, res) {

      assert(req.headers.authorization === "Bearer sk-123456");

      let reply = {}
      let http_code = 200;

      if (!req.body.model) {
        reply.error = "you must provide a model parameter";
        http_code = 400;
      }
      else if (!req.body.messages) {
        reply.error = "'messages' is a required property";
        http_code = 400;
      }
      else if (req.body.messages && req.body.messages.length == 0) {
        reply.error = "'[] is too short - 'messages'"
        http_code = 400;
      }
      else {
        reply = {
          id: "chatcmpl-7ydspsF20mgTsl4g9yTK8LNbDDYAp",
          object: "chat.completion",
          created: 1694687347,
          model: "gpt-3.5-turbo-0613",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "this is the answer"
              },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: 30,
            completion_tokens: 48,
            total_tokens: 78
          }
        }
      }

      res.status(http_code).send(reply);
    });

    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = { gptkey: "sk-123456" };
      // let reply = { gptkey: null };
      let http_code = 200;

      res.status(http_code).send(reply);
    });

    // endpointServer.get('/:project_id/integration/name/:name', function (req, res) {

    //   let http_code = 200;
    //   let reply = "Integration not found";

    //   res.status(http_code).send(reply);
    // })


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      // console.log('endpointServer started', listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/gpt_task',
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

  it('/task gpt success - get quotes availability and increments quote value', (done) => {

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
      assert(command2.message.text === "gpt replied: this is the answer");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          // assert(attributes["gpt_reply"] === "this is the answer");
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.post('/v1/chat/completions', function (req, res) {

      assert(req.headers.authorization === "Bearer sk-123456");

      let reply = {}
      let http_code = 200;

      if (!req.body.model) {
        reply.error = "you must provide a model parameter";
        http_code = 400;
      }
      else if (!req.body.messages) {
        reply.error = "'messages' is a required property";
        http_code = 400;
      }
      else if (req.body.messages && req.body.messages.length == 0) {
        reply.error = "'[] is too short - 'messages'"
        http_code = 400;
      }
      else {
        reply = {
          id: "chatcmpl-7ydspsF20mgTsl4g9yTK8LNbDDYAp",
          object: "chat.completion",
          created: 1694687347,
          model: "gpt-3.5-turbo-0613",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "this is the answer"
              },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: 28,
            completion_tokens: 100,
            total_tokens: 128
          }
        }
      }

      res.status(http_code).send(reply);
    });

    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = { gptkey: "sk-123456" };
      // let reply = { gptkey: null };
      let http_code = 200;

      res.status(http_code).send(reply);
    });

    endpointServer.get('/:project_id/quotes/:type', function (req, res) {

      let reply = { isAvailable: true };
      let http_code = 200;

      res.status(http_code).send(reply);
    })

    endpointServer.post('/:project_id/quotes/incr/:type', function (req, res) {

      assert.equal(req.body.tokens, 128);
      let http_code = 200;
      let reply = {
        message: "value incremented for key quotes:tokens:62c3f10152dc7400352bab0d:12/28/2023",
        key: "quotes:tokens:62c3f10152dc7400352bab0d:12/28/2023",
        currentQuote: 528
      }

      res.status(http_code).send(reply);
    })


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      // console.log('endpointServer started', listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/gpt_task',
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

  it('/task gpt fail - get quotes availability and stop the flow due to quote exceeding', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;

      // console.log("----> message: ", JSON.stringify(message, null, 2))
      assert(message.attributes.commands !== null);
      assert(message.attributes.commands.length === 2);
      const command2 = message.attributes.commands[1];
      assert(command2.type === "message");
      assert(command2.message.text === "Quota exceeded");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes['flowError'] === "GPT Error: tokens quota exceeded")
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = {};
      let http_code = 200;

      res.status(http_code).send(reply);
    });

    endpointServer.get('/:project_id/integration/name/:name', function (req, res) {

      let http_code = 200;
      let reply = "Integration not found";

      res.status(http_code).send(reply);
    })

    endpointServer.get('/:project_id/quotes/:type', function (req, res) {

      let reply = { isAvailable: false };
      let http_code = 200;

      res.status(http_code).send(reply);
    })

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      // console.log('endpointServer started', listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/gpt_task_quote_exceeded',
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

  it('/task gpt fail - completions fail', (done) => {

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
      // console.log(" ### reply text: ", command2.message.text)
      assert(command2.message.text === "gpt replied: No answer.");

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["gpt_reply"] === "No answer.");
          listener.close(() => {
            done();
          });
        }
      });

    });

    endpointServer.post('/v1/chat/completions', function (req, res) {

      assert(req.headers.authorization === 'Bearer example_api_key')
      let reply = {}
      let http_code = 400;

      reply.error = {
        "message": "you must provide a model parameter",
        "type": "invalid_request_error",
        "param": null,
        "code": null
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

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      // console.log('endpointServer started', listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/gpt_task',
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

  it('/task gpt fail - missing gpt key', (done) => {

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

      util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["gpt_reply"] === "No answer.");
          assert(attributes["flowError"] === "GPT Error: gpt apikey is undefined")
          listener.close(() => {
            done();
          });
        }
      });

    });

    // never calleed in this test --- check it
    endpointServer.post('/v1/chat/completions', function (req, res) {
      let reply = {}
      let http_code = 400;

      reply.error = "Generic error";

      res.status(http_code).send(reply);
    });
    

    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = {};
      let http_code = 200;

      res.status(http_code).send(reply);
    });

    endpointServer.get('/:project_id/integration/name/:name', function (req, res) {

      let http_code = 200;
      let reply = "Integration not found";

      res.status(http_code).send(reply);
    })

    endpointServer.get('/:project_id/quotes/:type', function (req, res) {

      let reply = { isAvailable: false };
      let http_code = 200;

      res.status(http_code).send(reply);
    })

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      // console.log('endpointServer started', listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/gpt_task',
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

  it('/task gpt fail - missing action question parameter', (done) => {

    let request_id = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
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
      assert(command2.message.text === "gpt replied: ");

      util.getChatbotParameters(request_id, (err, attributes) => {
        if (err) {
          assert.ok(false);
        }
        else {
          assert(attributes);
          assert(attributes["gpt_reply"] === undefined);
          assert(attributes["flowError"] === "GPT Error: question attribute is undefined")
          listener.close(() => {
            done();
          });
        }
      });

    });

    // never calleed in this test --- check it
    endpointServer.post('/v1/chat/completions', function (req, res) {
      let reply = {}
      let http_code = 400;

      reply.error = "Generic error";

      res.status(http_code).send(reply);
    });

    endpointServer.get('/:project_id/kbsettings', function (req, res) {

      let reply = {};
      let http_code = 200;

      res.status(http_code).send(reply);
    });

    endpointServer.get('/:project_id/integration/name/:name', function (req, res) {

      let http_code = 200;
      let reply = "Integration not found";

      res.status(http_code).send(reply);
    })

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      // console.log('endpointServer started', listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": request_id,
          "text": '/gpt_task_no_question',
          "id_project": PROJECT_ID,
          "metadata": "",
          "request": {
            "request_id": request_id
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
      // console.error("An error occurred:", error);
      if (callback) {
        callback(error, null, null);
      }
    });
}
