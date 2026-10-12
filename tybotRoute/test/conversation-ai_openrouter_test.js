var assert = require('assert');
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
const bots_data = require('./conversation-ai_openrouter_bot').bots_data;
const PROJECT_ID = "projectID";
const BOT_ID = "botID";
const tilebotService = require('../services/TilebotService');
const { OPENROUTER_BASE_URL } = require('../utils/openrouterUtils');

let SERVER_PORT = 10001

const OPENROUTER_INTEGRATION = {
  _id: "656728224b45965b69222222",
  id_project: PROJECT_ID,
  name: "openrouter",
  value: {
    apikey: "sk-or-test-key",
    models: [
      { id: "openai/gpt-4o", name: "GPT-4o", providers: ["azure", "openai"], allow_fallbacks: false, sort: "price" }
    ]
  }
};

// The same model object the server's /llm/preview sends. Without provider_routing
// OpenRouter picks the upstream provider itself, so the bot would not hit the
// providers the preview was tested against.
const EXPECTED_MODEL = {
  provider: "openrouter",
  name: "openai/gpt-4o",
  url: OPENROUTER_BASE_URL,
  api_key: "sk-or-test-key",
  provider_routing: { order: ["azure", "openai"], allow_fallbacks: false, sort: "price" }
};

/**
 * Sends `text` to the bot while serving what the directive calls: the
 * integration lookup, the LLM /api/ask and the reply message. `onReply` gets
 * the reply text and the /api/ask body (undefined if /api/ask was never called).
 */
function converse({ text, integration, answer, onReply }, done) {
  const requestId = "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
  let askBody;
  let listener;
  let endpointServer = express();
  endpointServer.use(bodyParser.json());

  endpointServer.get('/:project_id/integration/name/:name', (req, res) => {
    if (req.params.name !== integration.name) {
      return res.status(404).send({ success: false });
    }
    res.status(200).send(integration);
  });

  endpointServer.post('/api/ask', (req, res) => {
    askBody = req.body;
    res.status(200).send({ answer: answer });
  });

  endpointServer.post('/:projectId/requests/:requestId/messages', (req, res) => {
    res.send({ success: true });
    let error;
    try {
      onReply(req.body.attributes.commands[1].message.text, askBody);
    } catch (err) {
      error = err;
    }
    listener.close(() => done(error));
  });

  listener = endpointServer.listen(10002, '0.0.0.0', () => {
    let request = {
      "payload": {
        "senderFullname": "guest#367e",
        "type": "text",
        "sender": "A-SENDER",
        "recipient": requestId,
        "text": text,
        "id_project": PROJECT_ID,
        "metadata": "",
        "request": {
          "request_id": requestId
        }
      },
      "token": "XXX"
    }
    tilebotService.sendMessageToBot(request, BOT_ID, () => {
      winston.verbose("Message sent:\n", request);
    });
  });
}

describe('Conversation for OpenRouter AI actions test', async () => {

  let app_listener;

  before(() => {
    return new Promise(async (resolve, reject) => {
      winston.info("Starting tilebot server...");
      try {
        tybot.startApp(
          {
            bots: bots_data,
            TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT,
            API_ENDPOINT: process.env.API_ENDPOINT,
            API_URL: process.env.API_URL,
            REDIS_HOST: process.env.REDIS_HOST,
            REDIS_PORT: process.env.REDIS_PORT,
            REDIS_PASSWORD: process.env.REDIS_PASSWORD,
          }, () => {
            winston.info("Tilebot route successfully started.");
            app_listener = app.listen(SERVER_PORT, () => {
              winston.info('Tilebot connector listening on port ', SERVER_PORT);
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

  describe('AiPrompt', async () => {

    it('sends the model with its provider routing to the LLM', (done) => {
      converse({
        text: '/ai_prompt_openrouter',
        integration: OPENROUTER_INTEGRATION,
        answer: "this is the answer",
        onReply: (text, askBody) => {
          assert.ok(askBody, "/api/ask was not called");
          assert.strictEqual(askBody.llm, "openrouter");
          assert.strictEqual(askBody.llm_key, "sk-or-test-key");
          assert.deepStrictEqual(askBody.model, EXPECTED_MODEL);
          assert.strictEqual(text, "Answer: this is the answer");
        }
      }, done);
    })

    it('fails without calling the LLM when the integration has no key', (done) => {
      converse({
        text: '/ai_prompt_openrouter',
        integration: { ...OPENROUTER_INTEGRATION, value: { models: OPENROUTER_INTEGRATION.value.models } },
        answer: "never returned",
        onReply: (text, askBody) => {
          assert.strictEqual(askBody, undefined);
          assert.strictEqual(text, "Error: AiPrompt Error: missing key for llm openrouter");
        }
      }, done);
    })
  })

  describe('AiCondition', async () => {

    it('sends the model with its provider routing to the LLM', (done) => {
      converse({
        text: '/ai_condition_openrouter',
        integration: OPENROUTER_INTEGRATION,
        answer: "medical",
        onReply: (text, askBody) => {
          assert.ok(askBody, "/api/ask was not called");
          assert.strictEqual(askBody.llm, "openrouter");
          assert.strictEqual(askBody.llm_key, "sk-or-test-key");
          assert.deepStrictEqual(askBody.model, EXPECTED_MODEL);
          assert.strictEqual(text, "Answer: medical");
        }
      }, done);
    })

    it('fails without calling the LLM when the integration has no key', (done) => {
      converse({
        text: '/ai_condition_openrouter',
        integration: { ...OPENROUTER_INTEGRATION, value: { models: OPENROUTER_INTEGRATION.value.models } },
        answer: "never returned",
        onReply: (text, askBody) => {
          assert.strictEqual(askBody, undefined);
          assert.strictEqual(text, "Error: AiCondition Error: missing key for llm openrouter");
        }
      }, done);
    })
  })
})
