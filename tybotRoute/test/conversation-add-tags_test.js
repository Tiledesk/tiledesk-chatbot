var assert = require('assert');
let axios = require('axios');
const tybot = require("../index.js");
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
const bots_data = require('./conversation-add-tags_bot.js').bots_data;
const PROJECT_ID = "projectID"; //process.env.TEST_ACTIONS_PROJECT_ID;
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID"; //process.env.TEST_ACTIONS_BOT_ID;
const CHATBOT_TOKEN = "XXX"; //process.env.ACTIONS_CHATBOT_TOKEN;
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil.js');
const { statSync } = require('fs');
const tilebotService = require('../services/TilebotService.js');

let SERVER_PORT = 10001

describe('Conversation for AddTags test', async () => {

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

  it('Add tags to conversation without pushing to tags list', (done) => {

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
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/add_tags_complete_for_request',
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
  });

  it('Add tags to conversation without pushing to tags list (with variable as single value)', (done) => {

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

    endpointServer.get('/:projectId/requests/:requestId/', function (req, res) {
      assert(req.params.projectId)
      assert(req.params.requestId)
      assert.ok(req.headers.authorization, 'Expect to have "Authorization" header')
      let reply = {
        request_id: req.params.requestId,
        id_project: req.params.projectId,
        tags: [],
        status: 200,
        channel: {
          name: 'chat21'
        }
      }
      res.status(200).send(reply)

    });


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/add_tags_complete_for_request_and_var{"dynamic_tag":"tag3"}',
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
  });

  it('Add tags to conversation without pushing to tags list (with variable as multiple value)', (done) => {

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

    endpointServer.get('/:projectId/requests/:requestId/', function (req, res) {
      assert(req.params.projectId)
      assert(req.params.requestId)
      assert.ok(req.headers.authorization, 'Expect to have "Authorization" header')
      let reply = {
        request_id: req.params.requestId,
        id_project: req.params.projectId,
        tags: [],
        status: 200,
        channel: {
          name: 'chat21'
        }
      }
      res.status(200).send(reply)

    });


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/add_tags_complete_for_request_and_var{"dynamic_tag":"tag3,tag2"}',
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
  });
  
  it('Add tags to conversation and push to tags list', (done) => {

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

    endpointServer.post('/:projectId/tags/', function (req, res) {
      assert(req.params.projectId)
      assert(req.body)
      assert.ok(req.headers.authorization, 'Expect to have "Authorization" header')
      let tag = {
        color: req.body.color,
        tag: req.body.tag,
        id_project: req.params.projectId
      }
      res.status(200).send(tag)
    });


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/add_tags_complete_for_request_and_push_tags',
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
  });

  it('Add tags to conversation and push to tags list (with variable as single value)', (done) => {

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

    endpointServer.post('/:projectId/tags/', function (req, res) {
      assert(req.params.projectId)
      assert(req.body)
      assert.ok(req.headers.authorization, 'Expect to have "Authorization" header')
      let tag = {
        color: req.body.color,
        tag: req.body.tag,
        id_project: req.params.projectId
      }
      res.status(200).send(tag)
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/add_tags_complete_for_request_with_var_and_push_tags{"dynamic_tag":"tag3,tag2"}',
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
  });

  it('Add tags to lead without pushing to tags list', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.put('/:projectId/leads/:leadId/tag', function (req, res) {
      assert(req.params.projectId)
      assert(req.params.leadId)
      assert.ok(req.headers.authorization, 'Expect to have "Authorization" header')
      assert(req.body)
      assert(req.body.length > 0)
      let tags = req.body
      let lead = {
        _id: req.params.leadId,
        id_project: req.params.projectId,
        tags: tags,
        status: 100
      }
      res.status(200).send(lead)

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

    endpointServer.get('/:projectId/requests/:requestId/', function (req, res) {
      assert(req.params.projectId)
      assert(req.params.requestId)
      assert.ok(req.headers.authorization, 'Expect to have "Authorization" header')

      let reply = {
        request_id: req.params.requestId,
        id_project: req.params.projectId,
        tags: [],
        status: 200,
        lead: {
          _id: 'leadID',
          id_project: req.params.projectId,
          tags: ['tag1']
        },
        channel: {
          name: 'chat21'
        }
      }
      res.status(200).send(reply)

    });


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/add_tags_complete_for_lead',
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
  });

  it('Add tags to lead without pushing to tags list (with variable as single value)', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.put('/:projectId/leads/:leadId/tag', function (req, res) {
      assert(req.params.projectId)
      assert(req.params.leadId)
      assert.ok(req.headers.authorization, 'Expect to have "Authorization" header')
      assert(req.body)
      assert(req.body.length > 0)
      let tags = req.body
      let lead = {
        _id: req.params.leadId,
        id_project: req.params.projectId,
        tags: [ 'tag0' , ...tags ],
        status: 100
      }
      res.status(200).send(lead)

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

    endpointServer.get('/:projectId/requests/:requestId/', function (req, res) {
      assert(req.params.projectId)
      assert(req.params.requestId)
      assert.ok(req.headers.authorization, 'Expect to have "Authorization" header')

      let reply = {
        request_id: req.params.requestId,
        id_project: req.params.projectId,
        tags: [],
        status: 200,
        lead: {
          _id: 'leadID',
          id_project: req.params.projectId,
          tags: ['tag0']
        },
        channel: {
          name: 'chat21'
        }
      }
      res.status(200).send(reply)

    });


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/add_tags_complete_for_lead{"dynamic_tag":"tag3"}',
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
  });

  it('Add tags to lead without pushing to tags list (with variable as multiple value)', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.put('/:projectId/leads/:leadId/tag', function (req, res) {
      assert(req.params.projectId)
      assert(req.params.leadId)
      assert.ok(req.headers.authorization, 'Expect to have "Authorization" header')
      assert(req.body)
      assert(req.body.length > 0)
      let tags = req.body
      let lead = {
        _id: req.params.leadId,
        id_project: req.params.projectId,
        tags: ['tag0', ...tags ],
        status: 100
      }
      res.status(200).send(lead)

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

    endpointServer.get('/:projectId/requests/:requestId/', function (req, res) {
      assert(req.params.projectId)
      assert(req.params.requestId)
      assert.ok(req.headers.authorization, 'Expect to have "Authorization" header')

      let reply = {
        request_id: req.params.requestId,
        id_project: req.params.projectId,
        tags: [],
        status: 200,
        lead: {
          _id: 'leadID',
          id_project: req.params.projectId,
          tags: ['tag0']
        },
        channel: {
          name: 'chat21'
        }
      }
      res.status(200).send(reply)

    });


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/add_tags_complete_for_lead{"dynamic_tag":"tag3,tag4"}',
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
  });

  it('Add tags to lead and push to tags list', (done) => {

    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());
    endpointServer.put('/:projectId/leads/:leadId/tag', function (req, res) {
      assert(req.params.projectId)
      assert(req.params.leadId)
      assert.ok(req.headers.authorization, 'Expect to have "Authorization" header')
      assert(req.body)
      assert(req.body.length > 0)
      let tags = req.body
      let lead = {
        _id: req.params.leadId,
        id_project: req.params.projectId,
        tags: [ 'tag0', ...tags],
        status: 100
      }
      res.status(200).send(lead)

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

    endpointServer.post('/:projectId/tags/', function (req, res) {
      assert(req.params.projectId)
      assert(req.body)
      assert.ok(req.headers.authorization, 'Expect to have "Authorization" header')
      let tag = {
        color: req.body.color,
        tag: req.body.tag,
        id_project: req.params.projectId
      }
      res.status(200).send(tag)
    });

    endpointServer.get('/:projectId/requests/:requestId/', function (req, res) {
      assert(req.params.projectId)
      assert(req.params.requestId)
      let reply = {
        request_id: req.params.requestId,
        id_project: req.params.projectId,
        tags: [],
        status: 200,
        lead: {
          _id: 'leadID',
          id_project: req.params.projectId,
          tags: ['tag0']
        },
        channel: {
          name: 'chat21'
        }
      }
      res.status(200).send(reply)

    });


    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/add_tags_complete_for_lead_and_push',
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
  });

  it('Add empty tags to lead and push to tags list', (done) => {

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
      assert(command2.message.text === "add tags replied: Add tags Error: tags attribute is mandatory");

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
          "text": '/add_empty_tags_complete_for_lead_and_push',
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
  });

});
