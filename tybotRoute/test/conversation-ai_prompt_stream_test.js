// Streaming of AI Prompt answers on voice turns and turn supersession ("latest message wins").
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
const bots_data = require('./conversation-ai_prompt_stream_bot').bots_data;
const PROJECT_ID = "projectID";
const BOT_ID = "botID";
const tilebotService = require('../services/TilebotService');

let SERVER_PORT = 10001

const OPENAI_INTEGRATION = { _id: "656728224b45965b69233333", id_project: PROJECT_ID, name: "openai", value: { apikey: "sk-test-key" } };
const DELTAS = ["Ciao! ", "Sono l'assistente ", "virtuale di Aruba. ", "Posso aiutarti ", "con la fibra?"];
const ANSWER = DELTAS.join("");

function sse(event, data) {
  return "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n";
}

/**
 * Mock of tiledesk-server + tiledesk-llm. Records every call with its arrival time.
 * options.deltaDelay: ms between SSE chunks; options.streamStatus: status returned by /stream.
 */
function mockServer(options, ready) {
  const calls = { ask: [], stream: [], messages: [] };
  const server = express();
  server.use(bodyParser.json());
  server.get('/:project_id/integration/name/:name', (req, res) => {
    if (req.params.name !== OPENAI_INTEGRATION.name) {
      return res.status(404).send({ success: false });
    }
    res.status(200).send(OPENAI_INTEGRATION);
  });
  server.post('/api/ask', async (req, res) => {
    calls.ask.push({ body: req.body, t: Date.now() });
    if (!req.body.stream) {
      return res.status(200).send({ answer: ANSWER });
    }
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    res.write(sse("metadata", { message_id: "m1", status: "started" }));
    for (const d of DELTAS) {
      await new Promise((r) => setTimeout(r, options.deltaDelay || 20));
      if (res.writableEnded || res.destroyed) {
        return;
      }
      res.write(sse("chunk", { content: d, message_id: "m1" }));
    }
    res.write(sse("metadata", { message_id: "m1", status: "completed", full_response: ANSWER, model_used: { answer: ANSWER, prompt_token_info: { total_tokens: 10 } } }));
    res.end();
  });
  server.post('/:projectId/requests/:requestId/stream', (req, res) => {
    calls.stream.push({ body: req.body, auth: req.headers.authorization, t: Date.now() });
    if (options.onStream) {
      options.onStream(req.body, calls);
    }
    res.status(options.streamStatus || 202).send({ success: (options.streamStatus || 202) === 202 });
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

function sendToBot(requestId, channelName, text) {
  const request = {
    "payload": {
      "_id": uuidv4(),
      "senderFullname": "caller",
      "type": "text",
      "sender": "A-CALLER",
      "recipient": requestId,
      "text": text,
      "id_project": PROJECT_ID,
      "metadata": "",
      "request": {
        "request_id": requestId,
        "channel": { "name": channelName }
      }
    },
    "token": "XXX"
  }
  tilebotService.sendMessageToBot(request, BOT_ID, () => {});
}

function newRequestId() {
  return "support-group-" + PROJECT_ID + "-" + uuidv4().replace(/-/g, "");
}

function spokenText(body) {
  const cmd = body.attributes && body.attributes.commands && body.attributes.commands.find((c) => c.type === "message");
  return cmd ? cmd.message.text : body.text;
}

describe('Conversation for AI Prompt streaming (voice)', async () => {

  let app_listener;

  before(() => {
    return new Promise(async (resolve, reject) => {
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
          app_listener = app.listen(SERVER_PORT, () => resolve());
        });
    })
  });

  after(function (done) {
    app_listener.close(() => done());
  });

  it('streams sentence chunks, then the reply closes the stream', (done) => {
    const requestId = newRequestId();
    mockServer({
      onMessage: (body, calls) => {
        let error;
        try {
          assert.strictEqual(calls.ask.length, 1);
          assert.strictEqual(calls.ask[0].body.stream, true);
          const chunks = calls.stream.map((c) => c.body);
          assert.ok(chunks.length >= 2, "expected several chunks, got " + chunks.length);
          chunks.forEach((c, i) => {
            assert.strictEqual(c.seq, i);
            assert.strictEqual(c.stream_id, chunks[0].stream_id);
            assert.strictEqual(c.stream_end, i === chunks.length - 1);
          });
          assert.strictEqual(chunks.map((c) => c.delta).join(""), ANSWER);
          assert.strictEqual(calls.stream[0].auth, "JWT XXX");
          assert.strictEqual(spokenText(body), ANSWER);
          assert.strictEqual(body.attributes.stream_id, chunks[0].stream_id);
          assert.ok(calls.messages[0].t >= calls.stream[calls.stream.length - 1].t, "reply before the last chunk");
        } catch (err) {
          error = err;
        }
        listener.close(() => done(error));
      }
    }, (l) => {
      listener = l;
      sendToBot(requestId, "voice_twilio", "/kb");
    });
    let listener;
  }).timeout(10000);

  it('does not stream on other channels', (done) => {
    const requestId = newRequestId();
    let listener;
    mockServer({
      onMessage: (body, calls) => {
        let error;
        try {
          assert.strictEqual(calls.ask.length, 1);
          assert.ok(!calls.ask[0].body.stream, "stream requested on a non voice channel");
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
      sendToBot(requestId, "chat21", "/kb");
    });
  }).timeout(10000);

  it('falls back to a plain reply when /stream is not available (503)', (done) => {
    const requestId = newRequestId();
    let listener;
    mockServer({
      streamStatus: 503,
      onMessage: (body, calls) => {
        let error;
        try {
          assert.strictEqual(calls.stream.length, 1, "streaming must stop after the first 503");
          assert.strictEqual(spokenText(body), ANSWER);
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

  it('a newer caller message supersedes the turn being streamed', (done) => {
    const requestId = newRequestId();
    let listener;
    let secondSent = false;
    let finished = false;
    mockServer({
      deltaDelay: 250,
      onStream: (body) => {
        if (!secondSent) {
          secondSent = true;
          sendToBot(requestId, "voice_twilio", "/kb");
        }
      },
      onMessage: (body, calls) => {
        if (finished || !body.attributes || body.attributes.interrupted) {
          return;
        }
        // first complete reply: wait a bit to catch anything the first turn might still send
        finished = true;
        setTimeout(() => {
          let error;
          try {
            const firstStream = calls.stream[0].body.stream_id;
            const first = calls.stream.filter((c) => c.body.stream_id === firstStream);
            const second = calls.stream.filter((c) => c.body.stream_id !== firstStream);
            assert.ok(first.length < DELTAS.length - 1, "first stream was not stopped: " + first.length + " chunks");
            assert.ok(!first.some((c) => c.body.stream_end), "first stream must not end normally");
            const interrupted = calls.messages.filter((m) => m.body.attributes && m.body.attributes.interrupted);
            assert.strictEqual(interrupted.length, 1);
            assert.strictEqual(interrupted[0].body.attributes.stream_id, firstStream);
            assert.strictEqual(interrupted[0].body.text, first.map((c) => c.body.delta).join(""));
            const replies = calls.messages.filter((m) => !(m.body.attributes && m.body.attributes.interrupted));
            assert.strictEqual(replies.length, 1, "the superseded turn must not reply");
            assert.ok(second.length >= 2);
            assert.strictEqual(second.map((c) => c.body.delta).join(""), ANSWER);
            assert.strictEqual(replies[0].body.attributes.stream_id, second[0].body.stream_id);
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

  it('a newer caller message stops a turn between two actions', (done) => {
    const requestId = newRequestId();
    let listener;
    mockServer({
      onMessage: (body, calls) => {
        if (spokenText(body) !== ANSWER) {
          return;
        }
        // the 2nd turn replied: give the 1st turn's wait (1 s) time to end, then check it did not reply
        setTimeout(() => {
          let error;
          try {
            assert.ok(!calls.messages.some((m) => spokenText(m.body) === "slow done"), "superseded turn replied");
          } catch (err) {
            error = err;
          }
          listener.close(() => done(error));
        }, 1500);
      }
    }, (l) => {
      listener = l;
      sendToBot(requestId, "voice_twilio", "/slow");
      setTimeout(() => sendToBot(requestId, "voice_twilio", "/kb"), 300);
    });
  }).timeout(15000);

  it('without a newer message the same block replies (control)', (done) => {
    const requestId = newRequestId();
    let listener;
    mockServer({
      onMessage: (body) => {
        let error;
        try {
          assert.strictEqual(spokenText(body), "slow done");
        } catch (err) {
          error = err;
        }
        listener.close(() => done(error));
      }
    }, (l) => {
      listener = l;
      sendToBot(requestId, "voice_twilio", "/slow");
    });
  }).timeout(15000);

});
