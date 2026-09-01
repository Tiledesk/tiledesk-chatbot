var assert = require('assert');
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
const bots_data = require('./conversation-askgpt_bot.js').bots_data;
const PROJECT_ID = "projectID";
const REQUEST_ID = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
const BOT_ID = "botID";

let SERVER_PORT = 10001

// REGRESSION TEST - DirAskGPT public (shared) GPTKEY path.
//
// With no project key in the integrations and none in the kb settings,
// LLMKeyService falls back to the shared env GPTKEY and reports
// `publicKey: true`. DirAskGPT then has to check the project's token quota
// before spending the shared key. It used to do that with
// `await this.checkQuoteAvailability()` - a method that exists on neither
// DirAskGPT nor BaseDirective - so the whole path died with
// "this.checkQuoteAvailability is not a function" and the reply was never
// sent. Every sibling directive (DirGptTask, DirAddKbContent, DirAiPrompt,
// DirAiCondition, DirAskGPTV2) calls
// `quotasService.checkQuoteAvailability(this.projectId, this.token)`.
//
// The mock below therefore asserts BOTH that the quota endpoint is reached
// and that it is reached with the project id and the bot token, then that
// the flow carries on to the true intent.
describe('Conversation for AskGPT with the public (shared) GPTKEY', async () => {

  let app_listener;
  let util = new TiledeskChatbotUtil();

  before(() => {
    // No project key anywhere -> resolveOpenAIKey() falls back to this one and
    // flags it public, which is the branch under test.
    process.env.GPTKEY = 'sk-shared-public-key';
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
        winston.error("error:", error)
      }

    })
  });

  after(function (done) {
    app_listener.close(() => {
      done();
    });
  });

  it('/gpt success (public key) - checks the token quota, then answers', (done) => {
    let listener;
    let quota_calls = [];
    let endpointServer = express();
    endpointServer.use(bodyParser.json());

    endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
      res.send({ success: true });
      const message = req.body;

      // The quota MUST have been checked before the shared key was spent.
      assert.strictEqual(quota_calls.length, 1);
      assert.strictEqual(quota_calls[0].project_id, PROJECT_ID);
      assert.strictEqual(quota_calls[0].type, "tokens");
      assert.strictEqual(quota_calls[0].authorization, "JWT XXX");

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

    endpointServer.get('/:project_id/quotes/:type', function (req, res) {
      quota_calls.push({
        project_id: req.params.project_id,
        type: req.params.type,
        authorization: req.headers.authorization
      });
      res.status(200).send({ isAvailable: true });
    });

    endpointServer.post('/api/qa', function (req, res) {
      // The shared key is the one that must reach the kb service here.
      assert.strictEqual(req.body.gptkey, 'sk-shared-public-key');
      res.status(200).send({
        answer: "this is mock gpt reply",
        success: true,
        source_url: "http://test"
      });
    });

    // no openai integration for this project
    endpointServer.get('/:project_id/integration/name/:name', function (req, res) {
      res.status(200).send("Integration not found");
    });

    // ...and no key in the kb settings either
    endpointServer.get('/:project_id/kbsettings', function (req, res) {
      res.status(200).send({});
    });

    listener = endpointServer.listen(10002, '0.0.0.0', () => {
      winston.verbose('endpointServer started' + listener.address());
      let request = {
        "payload": {
          "senderFullname": "guest#367e",
          "type": "text",
          "sender": "A-SENDER",
          "recipient": REQUEST_ID,
          "text": '/gpt success{"last_user_message":"come ti chiami"}',
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
