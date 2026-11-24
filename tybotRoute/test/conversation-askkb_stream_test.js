// Streaming of Ask Knowledge Base answers (/api/qa) on voice turns.
process.env.STREAM_ENABLED = "true";
process.env.STREAM_CHANNELS = "voice_twilio";
process.env.STREAM_CHUNK_MAX_WAIT_MS = "150";

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
const bots_data = require('./conversation-askkb_stream_bot').bots_data;
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');
const PROJECT_ID = "projectID";
const BOT_ID = "botID";
const tilebotService = require('../services/TilebotService');

let SERVER_PORT = 10001

const OPENAI_INTEGRATION = { _id: "656728224b45965b69233333", id_project: PROJECT_ID, name: "openai", value: { apikey: "sk-test-key" } };
const NAMESPACES = [{ default: true, id_project: PROJECT_ID, id: PROJECT_ID, name: "Default",
  engine: { name: "pinecone", type: "serverless", apikey: "", vector_size: 1536, index_name: "example-index" } }];
const DELTAS = ["La fibra di Aruba ", "costa 26,90 euro al mese. ", "L'attivazione ", "è gratuita."];
const ANSWER = DELTAS.join("");
const MISS_DELTAS = ["Mi dispiace, ", "non ho informazioni ", "su questo.", "<NO", "ANS>"];
const MISS_SPOKEN = "Mi dispiace, non ho informazioni su questo.";

function sse(event, data) {
  return "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n";
}

/**
 * Mock of tiledesk-server + tiledesk-llm /api/qa. options.deltas: SSE chunks; options.success: the /qa result's success;
 * options.deltaDelay: ms between chunks.
 */
function mockServer(options, ready) {
  const calls = { qa: [], stream: [], messages: [], answered: [], unanswered: [] };
  const deltas = options.deltas || DELTAS;
  const success = options.success !== false;
  const server = express();
  server.use(bodyParser.json());
  server.get('/:project_id/integration/name/:name', (req, res) => res.status(200).send(OPENAI_INTEGRATION));
  server.get('/:project_id/kb/namespace/all', (req, res) => res.status(200).send(NAMESPACES));
  server.post('/:project_id/kb/answered', (req, res) => { calls.answered.push(req.body); res.send({ success: true }); });
  server.post('/:project_id/kb/unanswered', (req, res) => { calls.unanswered.push(req.body); res.send({ success: true }); });
  server.post('/api/qa', async (req, res) => {
    calls.qa.push({ body: req.body, t: Date.now() });
    const full = deltas.join("").replace("<NOANS>", "");
    const result = { answer: full, success, source: "http://kb.example/fibra", content_chunks: ["chunk 1"], prompt_token_size: 100,
      citations: req.body.citations ? [] : undefined };
    if (!req.body.stream) {
      return res.status(200).send(result);
    }
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    res.write(sse("metadata", { message_id: "m1", status: "started" }));
    for (const d of deltas) {
      await new Promise((r) => setTimeout(r, options.deltaDelay || 20));
      if (res.writableEnded || res.destroyed) {
        return;
      }
      res.write(sse("chunk", { content: d, message_id: "m1" }));
    }
    res.write(sse("metadata", { message_id: "m1", status: "completed", full_response: full, model_used: result }));
    res.end();
  });
  server.post('/:projectId/requests/:requestId/stream', (req, res) => {
    calls.stream.push({ body: req.body, t: Date.now() });
    if (options.onStream) {
      options.onStream(req.body, calls);
    }
    res.status(202).send({ success: true });
  });
  server.post('/:projectId/requests/:requestId/messages', (req, res) => {
    calls.messages.push({ body: req.body, t: Date.now() });
    res.send({ success: true });
    if (options.onMessage) {
      options.onMessage(req.body, calls);
    }
  });
  const listener = server.listen(10002, '0.0.0.0', () => ready(listener, calls));
}

function sendToBot(requestId, channelName, text, requestAttributes) {
  if (requestAttributes === undefined) {
    requestAttributes = channelName === "voice_twilio" ? { voice_stream: true } : {};
  }
  tilebotService.sendMessageToBot({
    "payload": {
      "_id": uuidv4(), "senderFullname": "caller", "type": "text", "sender": "A-CALLER", "recipient": requestId,
      "text": text, "id_project": PROJECT_ID, "metadata": "", "attributes": {},
      "request": { "request_id": requestId, "channel": { "name": channelName }, "attributes": requestAttributes }
    },
    "token": "XXX"
  }, BOT_ID, () => {});
}

function newRequestId() {
  return "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
}

function spokenText(body) {
  const cmd = body.attributes && body.attributes.commands && body.attributes.commands.find((c) => c.type === "message");
  return cmd ? cmd.message.text : body.text;
}

const attributesOf = (requestId) => new Promise((resolve, reject) =>
  new TiledeskChatbotUtil().getChatbotParameters(requestId, (err, a) => (err ? reject(err) : resolve(a))));

describe('Conversation for Ask Knowledge Base streaming (voice)', async () => {

  let app_listener;

  before(() => {
    return new Promise(async (resolve) => {
      tybot.startApp({
        bots: bots_data,
        TILEBOT_ENDPOINT: process.env.TILEBOT_ENDPOINT,
        API_ENDPOINT: process.env.API_ENDPOINT,
        API_URL: process.env.API_URL,
        REDIS_HOST: process.env.REDIS_HOST,
        REDIS_PORT: process.env.REDIS_PORT,
        REDIS_PASSWORD: process.env.REDIS_PASSWORD,
      }, () => {
        app_listener = app.listen(SERVER_PORT, () => resolve());
      });
    })
  });

  after(function (done) {
    app_listener.close(() => done());
  });

  it('streams the KB answer, without citations, then the reply closes the stream (true branch)', (done) => {
    const requestId = newRequestId();
    let listener;
    mockServer({
      onMessage: async (body, calls) => {
        let error;
        try {
          assert.strictEqual(calls.qa.length, 1);
          assert.strictEqual(calls.qa[0].body.stream, true);
          assert.strictEqual(calls.qa[0].body.citations, false, "citations are not requested on voice");
          const chunks = calls.stream.map((c) => c.body);
          assert.ok(chunks.length >= 2, "expected several chunks, got " + chunks.length);
          assert.strictEqual(chunks.map((c) => c.delta).join(""), ANSWER);
          assert.strictEqual(chunks[chunks.length - 1].stream_end, true);
          assert.strictEqual(spokenText(body), ANSWER);
          assert.strictEqual(body.attributes.stream_id, chunks[0].stream_id, "the reply closes the stream");
          const a = await attributesOf(requestId);
          assert.strictEqual(a.kb_reply, ANSWER);
          assert.strictEqual(a.kb_source, "http://kb.example/fibra");
          assert.strictEqual(calls.unanswered.length, 0);
        } catch (err) {
          error = err;
        }
        listener.close(() => done(error));
      }
    }, (l) => {
      listener = l;
      sendToBot(requestId, "voice_twilio", "/kb");
    });
  }).timeout(10000);

  it('a KB miss (<NOANS>): the marker is never spoken, the spoken text closes the stream, false branch, unanswered logged', (done) => {
    const requestId = newRequestId();
    let listener;
    mockServer({
      deltas: MISS_DELTAS,
      success: false,
      onMessage: async (body, calls) => {
        let error;
        try {
          const spokenChunks = calls.stream.map((c) => c.body.delta).join("");
          assert.ok(!spokenChunks.includes("<"), "marker spoken: " + spokenChunks);
          assert.strictEqual(spokenChunks.trim(), MISS_SPOKEN);
          assert.strictEqual(spokenText(body), MISS_SPOKEN, "false branch speaks the spoken text, not a second fallback");
          assert.strictEqual(body.attributes.stream_id, calls.stream[0].body.stream_id);
          const a = await attributesOf(requestId);
          assert.strictEqual(a.kb_reply, MISS_SPOKEN);
          await new Promise((r) => setTimeout(r, 200));
          assert.strictEqual(calls.unanswered.length, 1);
        } catch (err) {
          error = err;
        }
        listener.close(() => done(error));
      }
    }, (l) => {
      listener = l;
      sendToBot(requestId, "voice_twilio", "/kb");
    });
  }).timeout(10000);

  it('a KB miss with nothing spoken uses the configured fallback (false branch)', (done) => {
    const requestId = newRequestId();
    let listener;
    mockServer({
      deltas: ["<NOANS>"],
      success: false,
      onMessage: async (body, calls) => {
        let error;
        try {
          assert.strictEqual(calls.stream.length, 0, "nothing to speak");
          assert.strictEqual(spokenText(body), "No answers");
          assert.strictEqual(body.attributes.stream_id, undefined);
        } catch (err) {
          error = err;
        }
        listener.close(() => done(error));
      }
    }, (l) => {
      listener = l;
      sendToBot(requestId, "voice_twilio", "/kb");
    });
  }).timeout(10000);

  it('does not stream a Gather call (no voice_stream marker): /qa with stream false, citations as configured', (done) => {
    const requestId = newRequestId();
    let listener;
    mockServer({
      onMessage: (body, calls) => {
        let error;
        try {
          assert.ok(!calls.qa[0].body.stream);
          assert.strictEqual(calls.qa[0].body.citations, true);
          assert.strictEqual(calls.stream.length, 0);
          assert.strictEqual(spokenText(body), ANSWER);
          assert.strictEqual(body.attributes.stream_id, undefined);
        } catch (err) {
          error = err;
        }
        listener.close(() => done(error));
      }
    }, (l) => {
      listener = l;
      sendToBot(requestId, "voice_twilio", "/kb", {});
    });
  }).timeout(10000);

  it('a newer caller message supersedes the KB answer being streamed', (done) => {
    const requestId = newRequestId();
    let listener;
    let secondSent = false;
    let finished = false;
    mockServer({
      deltaDelay: 250,
      onStream: () => {
        if (!secondSent) {
          secondSent = true;
          sendToBot(requestId, "voice_twilio", "/kb");
        }
      },
      onMessage: (body, calls) => {
        if (finished || !body.attributes || body.attributes.interrupted) {
          return;
        }
        finished = true;
        setTimeout(() => {
          let error;
          try {
            const firstStream = calls.stream[0].body.stream_id;
            const first = calls.stream.filter((c) => c.body.stream_id === firstStream);
            assert.ok(!first.some((c) => c.body.stream_end), "first stream must not end normally");
            const interrupted = calls.messages.filter((m) => m.body.attributes && m.body.attributes.interrupted);
            assert.strictEqual(interrupted.length, 1);
            assert.strictEqual(interrupted[0].body.attributes.stream_id, firstStream);
            const replies = calls.messages.filter((m) => !(m.body.attributes && m.body.attributes.interrupted));
            assert.strictEqual(replies.length, 1, "the superseded turn must not reply");
            assert.strictEqual(spokenText(replies[0].body), ANSWER);
          } catch (err) {
            error = err;
          }
          listener.close(() => done(error));
        }, 1000);
      }
    }, (l) => {
      listener = l;
      sendToBot(requestId, "voice_twilio", "/kb");
    });
  }).timeout(15000);
});
