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
process.env.DOCPARSE_ENDPOINT = process.env.API_ENDPOINT;
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const redis = require('redis');
const bots_data = require('./docparse_extract_directive_bot.js').bots_data;
const PROJECT_ID = "projectID";
const BOT_ID = "botID";
const CHATBOT_TOKEN = "XXX";
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');
const tilebotService = require('../services/TilebotService');

let SERVER_PORT = 10001;

describe('Conversation for Docparse Extract test', async () => {

  let app_listener;
  const app_sockets = new Set();
  let redisPublisher;
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
          }, async () => {
            winston.info("Tilebot route successfully started.");
            const redisOptions = {
              url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
            };
            if (process.env.REDIS_PASSWORD) {
              redisOptions.password = process.env.REDIS_PASSWORD;
            }
            redisPublisher = redis.createClient(redisOptions);
            await redisPublisher.connect();
            app_listener = app.listen(SERVER_PORT, () => {
              winston.info('Tilebot connector listening on port ' + SERVER_PORT);
              resolve();
            });
            app_listener.on('connection', (socket) => {
              app_sockets.add(socket);
              socket.on('close', () => app_sockets.delete(socket));
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
    if (redisPublisher && redisPublisher.isOpen) {
      redisPublisher.disconnect();
    }

    if (!app_listener) {
      done();
      return;
    }

    // Open sockets from the bot calls would otherwise hold close() past
    // Mocha's default timeout; closeAllConnections() needs Node >= 18.2.
    app_listener.close(() => done());
    for (const socket of app_sockets) {
      socket.destroy();
    }
  });

  function requestId() {
    return "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
  }

  function sendToBot(requestId, text) {
    tilebotService.sendMessageToBot({
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
      "token": CHATBOT_TOKEN
    }, BOT_ID, () => {
      winston.verbose("Message sent:\n", text);
    });
  }

  function invoke(requestId, text, register) {
    return new Promise((resolve, reject) => {
      let listener;
      let endpointServer = express();
      endpointServer.use(bodyParser.json());
      const timer = setTimeout(() => {
        if (listener) {
          listener.close();
        }
        reject(new Error("Timed out waiting for the bot reply to " + text));
      }, 8000);

      endpointServer.post('/:projectId/requests/:requestId/messages', function (req, res) {
        res.send({ success: true });
        clearTimeout(timer);
        const message = req.body;
        listener.close(() => {
          resolve(message);
        });
      });

      register(endpointServer);

      listener = endpointServer.listen(10002, '0.0.0.0', () => {
        winston.verbose('endpointServer started' + listener.address());
        sendToBot(requestId, text);
      });
      listener.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function replyText(message) {
    assert(message.attributes.commands !== null);
    assert(message.attributes.commands.length === 2);
    const command = message.attributes.commands[1];
    assert(command.type === "message");
    return command.message.text;
  }

  function parameters(requestId) {
    return new Promise((resolve, reject) => {
      util.getChatbotParameters(requestId, (err, attributes) => {
        if (err) {
          reject(err);
        } else {
          resolve(attributes);
        }
      });
    });
  }

  function publishCompleted(jobId, payload) {
    return redisPublisher.publish('docparse:jobs:' + jobId + ':completed', JSON.stringify(payload));
  }

  it('/extract_success - the preventive poll already returns the extracted text', async () => {
    const id = requestId();
    const message = await invoke(id, '/extract_success', (endpointServer) => {
      endpointServer.post('/v1/jobs/extract', function (req, res) {
        assert.strictEqual(req.body.filename, '8.pdf');
        assert.strictEqual(req.body.url, 'https://example.com/8.pdf');
        assert.strictEqual(req.body.mode, 'text');
        assert.strictEqual(req.body.enable_vision_fallback, undefined);
        res.status(202).send({
          job_id: "job-ready",
          kind: "extract",
          status: "queued"
        });
      });

      endpointServer.get('/v1/jobs/:jobId', function (req, res) {
        assert.strictEqual(req.params.jobId, 'job-ready');
        res.status(200).send({
          job_id: "job-ready",
          kind: "extract",
          status: "succeeded",
          error: null,
          result: {
            content_type: "text/plain",
            body: "hello from pdf"
          }
        });
      });
    });

    assert.strictEqual(replyText(message), "extracted: hello from pdf");
    const attributes = await parameters(id);
    assert.strictEqual(attributes["extracted_text"], "hello from pdf");
  });

  it('/extract_redis - a redis notification is followed by a GET for the result', async () => {
    const id = requestId();
    const message = await invoke(id, '/extract_redis', (endpointServer) => {
      endpointServer.post('/v1/jobs/extract', function (req, res) {
        assert.strictEqual(req.body.filename, 'scan.pdf');
        assert.strictEqual(req.body.url, 'https://example.com/scan.pdf');
        assert.strictEqual(req.body.mode, 'full');
        res.status(202).send({
          job_id: "job-redis",
          kind: "extract",
          status: "queued"
        });
      });

      let polls = 0;
      endpointServer.get('/v1/jobs/:jobId', function (req, res) {
        assert.strictEqual(req.params.jobId, 'job-redis');
        polls += 1;
        if (polls === 1) {
          publishCompleted('job-redis', { job_id: 'job-redis', status: 'succeeded' }).then(() => {
            res.status(200).send({
              job_id: "job-redis",
              kind: "extract",
              status: "running",
              error: null,
              result: null
            });
          });
          return;
        }
        res.status(200).send({
          job_id: "job-redis",
          kind: "extract",
          status: "succeeded",
          error: null,
          result: {
            content_type: "application/json",
            body: { text: "from redis", filename: "scan.pdf" }
          }
        });
      });
    });

    assert.strictEqual(replyText(message), "extracted: from redis");
    const attributes = await parameters(id);
    assert.strictEqual(attributes["extracted_text"], "from redis");
  });

  it('/extract_attributes - filename and url come from the invocation attributes', async () => {
    const id = requestId();
    const message = await invoke(id, '/extract_attributes{"doc_name":"invoice.pdf","doc_url":"https://example.com/invoice.pdf"}', (endpointServer) => {
      endpointServer.post('/v1/jobs/extract', function (req, res) {
        assert.strictEqual(req.body.filename, 'invoice.pdf');
        assert.strictEqual(req.body.url, 'https://example.com/invoice.pdf');
        res.status(202).send({
          job_id: "job-attributes",
          kind: "extract",
          status: "queued"
        });
      });

      endpointServer.get('/v1/jobs/:jobId', function (req, res) {
        res.status(200).send({
          job_id: "job-attributes",
          status: "succeeded",
          error: null,
          result: {
            content_type: "text/plain",
            body: "invoice text"
          }
        });
      });
    });

    assert.strictEqual(replyText(message), "extracted: invoice text");
    const attributes = await parameters(id);
    assert.strictEqual(attributes["extracted_text"], "invoice text");
    assert.strictEqual(attributes["doc_name"], "invoice.pdf");
    assert.strictEqual(attributes["doc_url"], "https://example.com/invoice.pdf");
  });

  it('/extract_filename_from_url - filename is derived from the url', async () => {
    const id = requestId();
    const message = await invoke(id, '/extract_filename_from_url', (endpointServer) => {
      endpointServer.post('/v1/jobs/extract', function (req, res) {
        console.log("req.body", req.body);
        assert.strictEqual(req.body.filename, 'my invoice.pdf');
        assert.strictEqual(req.body.url, 'https://example.com/documents/my%20invoice.pdf?token=signed#download');
        res.status(202).send({
          job_id: "job-derived-filename",
          kind: "extract",
          status: "queued"
        });
      });

      endpointServer.get('/v1/jobs/:jobId', function (req, res) {
        res.status(200).send({
          job_id: "job-derived-filename",
          status: "succeeded",
          error: null,
          result: {
            content_type: "text/plain",
            body: "derived filename text"
          }
        });
      });
    });

    assert.strictEqual(replyText(message), "extracted: derived filename text");
  });

  it('/extract_fallback - provider and model are sent as vision fallback', async () => {
    const id = requestId();
    const message = await invoke(id, '/extract_fallback', (endpointServer) => {
      endpointServer.get('/:project_id/integration/name/:name', function (req, res) {
        assert.strictEqual(req.params.name, 'openai');
        res.status(200).send({
          _id: "656728224b45965b69111111",
          id_project: PROJECT_ID,
          name: "openai",
          value: {
            apikey: "sk-test",
            organization: "Tiledesk"
          }
        });
      });

      endpointServer.post('/v1/jobs/extract', function (req, res) {
        assert.strictEqual(req.body.filename, '8.pdf');
        assert.strictEqual(req.body.url, 'https://example.com/8.pdf');
        assert.strictEqual(req.body.language, 'ita+eng');
        assert.strictEqual(req.body.dpi, 300);
        assert.strictEqual(req.body.enable_vision_fallback, true);
        assert.strictEqual(req.body.ocr_quality_threshold, 0.98);
        assert.deepStrictEqual(req.body.vision_llm, {
          llm: 'openai',
          llm_key: '',
          model: {
            provider: 'openai',
            name: 'gpt-4o',
            api_key: 'sk-test'
          },
          temperature: 0,
          max_tokens: 8196
        });
        assert.strictEqual(req.body.provider, undefined);
        assert.strictEqual(req.body.api_key, undefined);
        res.status(202).send({
          job_id: "job-fallback",
          kind: "extract",
          status: "queued"
        });
      });

      endpointServer.get('/v1/jobs/:jobId', function (req, res) {
        res.status(200).send({
          job_id: "job-fallback",
          status: "succeeded",
          error: null,
          result: {
            content_type: "text/plain",
            body: "vision text"
          }
        });
      });
    });

    assert.strictEqual(replyText(message), "extracted: vision text");
    const attributes = await parameters(id);
    assert.strictEqual(attributes["extracted_text"], "vision text");
  });

  it('/extract_fail_job - the GET after the redis notification returns the error', async () => {
    const id = requestId();
    const message = await invoke(id, '/extract_fail_job', (endpointServer) => {
      endpointServer.post('/v1/jobs/extract', function (req, res) {
        assert.strictEqual(req.body.filename, 'broken.pdf');
        res.status(202).send({
          job_id: "job-error",
          kind: "extract",
          status: "queued"
        });
      });

      let polls = 0;
      endpointServer.get('/v1/jobs/:jobId', function (req, res) {
        polls += 1;
        if (polls === 1) {
          publishCompleted('job-error', { job_id: 'job-error', status: 'failed' }).then(() => {
            res.status(200).send({
              job_id: "job-error",
              status: "running",
              error: null,
              result: null
            });
          });
          return;
        }
        res.status(200).send({
          job_id: "job-error",
          status: "failed",
          error: {
            code: "processing_failed",
            detail: "unreadable document",
            hint: "check the file"
          },
          result: null
        });
      });
    });

    assert.strictEqual(replyText(message), "extract failed: DocparseExtract Error: processing_failed: unreadable document");
    const attributes = await parameters(id);
    assert.strictEqual(attributes["flowError"], "DocparseExtract Error: processing_failed: unreadable document");
    assert.strictEqual(attributes["extracted_text"], "");
  });

  it('/extract_fail_http - docparse rejects the submit', async () => {
    const id = requestId();
    const message = await invoke(id, '/extract_fail_http', (endpointServer) => {
      endpointServer.post('/v1/jobs/extract', function (req, res) {
        res.status(429).send({
          error: "too_many_jobs",
          detail: "Too many extract/convert jobs are queued or running",
          hint: "Retry later or raise DOCPARSE_JOB_MAX_PENDING."
        });
      });
    });

    assert.strictEqual(replyText(message), "extract failed: DocparseExtract Error: too_many_jobs: Too many extract/convert jobs are queued or running");
    const attributes = await parameters(id);
    assert.strictEqual(attributes["flowError"], "DocparseExtract Error: too_many_jobs: Too many extract/convert jobs are queued or running");
  });

  it('/extract_fail_missing - url is mandatory and docparse is not called', async () => {
    const id = requestId();
    let called = false;
    const message = await invoke(id, '/extract_fail_missing', (endpointServer) => {
      endpointServer.post('/v1/jobs/extract', function (req, res) {
        called = true;
        res.status(500).send({ error: "should_not_be_called" });
      });
    });

    assert.strictEqual(called, false);
    assert.strictEqual(replyText(message), "extract failed: DocparseExtract Error: missing attribute 'url'");
    const attributes = await parameters(id);
    assert.strictEqual(attributes["flowError"], "DocparseExtract Error: missing attribute 'url'");
  });

});
