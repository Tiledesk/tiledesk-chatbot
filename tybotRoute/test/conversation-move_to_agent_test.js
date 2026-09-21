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
const bots_data = require('./conversation-move_to_agent_bot.js').bots_data;
const PROJECT_ID = "projectID";
const BOT_ID = "botID";
const CHATBOT_TOKEN = "XXX";
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');
const tilebotService = require('../services/TilebotService.js');

const SUPPORT_DEPARTMENT_ID = "dep-support-id";
const DEPARTMENTS = [
  {
    _id: SUPPORT_DEPARTMENT_ID,
    name: "Support"
  },
  {
    _id: "dep-sales-id",
    name: "Sales"
  }
];

let SERVER_PORT = 10001;

function findMessageCommand(commands, expectedText) {
  const command = commands.find((c) => c.type === "message" && c.message && c.message.text === expectedText);
  assert(command, `Expected message command with text "${expectedText}"`);
  return command;
}

function createRequest(requestId, intentText) {
  return {
    "payload": {
      "senderFullname": "guest#367e",
      "type": "text",
      "sender": "A-SENDER",
      "recipient": requestId,
      "text": intentText,
      "id_project": PROJECT_ID,
      "metadata": "",
      "request": {
        "request_id": requestId
      }
    },
    "token": CHATBOT_TOKEN
  };
}

describe('Conversation for Move to Agent test', async () => {

  let app_listener;
  let util = new TiledeskChatbotUtil();

  before(() => {
    return new Promise(async (resolve, reject) => {
      winston.info("Starting tilebot server...");
      try {
        tybot.startApp(
          {
            bots: bots_data,
            TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT,
            API_ENDPOINT: process.env.API_ENDPOINT,
            REDIS_HOST: process.env.REDIS_HOST,
            REDIS_PORT: process.env.REDIS_PORT,
            REDIS_PASSWORD: process.env.REDIS_PASSWORD
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
        winston.error("error:", error);
        reject(error);
      }
    });
  });

  after(function (done) {
    app_listener.close(() => {
      done();
    });
  });

  it('/move_to_agent without depName', (done) => {
    const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    let replyVerified = false;
    let moveToAgentVerified = false;
    let getAllDepartmentsCalled = false;

    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      findMessageCommand(message.attributes.commands, 'Moving you to an agent...');
      replyVerified = true;
      tryDone();
    });

    endpointServer.put('/:projectId/requests/:requestId/agent', function (req, res) {
      assert.strictEqual(req.params.projectId, PROJECT_ID);
      assert.strictEqual(req.params.requestId, REQUEST_ID);
      res.send({ success: true });
      moveToAgentVerified = true;
      tryDone();
    });

    endpointServer.get('/:projectId/departments/allstatus', function (req, res) {
      getAllDepartmentsCalled = true;
      res.send(DEPARTMENTS);
      tryDone();
    });

    function tryDone() {
      if (replyVerified && moveToAgentVerified) {
        assert.strictEqual(getAllDepartmentsCalled, false);
        util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
          if (err) {
            assert.ok(false);
          }
          else {
            listener.close(() => {
              done();
            });
          }
        });
      }
    }

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started ' + listener.address());
      tilebotService.sendMessageToBot(createRequest(REQUEST_ID, '/move_to_agent'), BOT_ID, () => {
        winston.verbose("Message sent for /move_to_agent");
      });
    });
  });

  it('/move_to_agent_with_department with depName', (done) => {
    const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
    let listener;
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    let replyVerified = false;
    let moveToAgentVerified = false;
    let getAllDepartmentsVerified = false;
    let updateDepartmentVerified = false;

    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;
      assert(message.attributes.commands !== null);
      findMessageCommand(message.attributes.commands, 'Moving you to Support department...');
      replyVerified = true;
      tryDone();
    });

    endpointServer.put('/:projectId/requests/:requestId/agent', function (req, res) {
      assert.strictEqual(req.params.projectId, PROJECT_ID);
      assert.strictEqual(req.params.requestId, REQUEST_ID);
      res.send({ success: true });
      moveToAgentVerified = true;
      tryDone();
    });

    endpointServer.get('/:projectId/departments/allstatus', function (req, res) {
      assert.strictEqual(req.params.projectId, PROJECT_ID);
      res.send(DEPARTMENTS);
      getAllDepartmentsVerified = true;
      tryDone();
    });

    endpointServer.put('/:projectId/requests/:requestId/departments', function (req, res) {
      assert.strictEqual(req.params.projectId, PROJECT_ID);
      assert.strictEqual(req.params.requestId, REQUEST_ID);
      assert.strictEqual(req.body.departmentid, SUPPORT_DEPARTMENT_ID);
      res.send({ success: true });
      updateDepartmentVerified = true;
      tryDone();
    });

    function tryDone() {
      if (replyVerified && moveToAgentVerified && getAllDepartmentsVerified && updateDepartmentVerified) {
        util.getChatbotParameters(REQUEST_ID, (err, attributes) => {
          if (err) {
            assert.ok(false);
          }
          else {
            listener.close(() => {
              done();
            });
          }
        });
      }
    }

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started ' + listener.address());
      tilebotService.sendMessageToBot(createRequest(REQUEST_ID, '/move_to_agent_with_department'), BOT_ID, () => {
        winston.verbose("Message sent for /move_to_agent_with_department");
      });
    });
  });

});
