// Streaming of AI Prompt answers on voice turns and turn supersession ("latest message wins").
process.env.STREAM_ENABLED = "true";
process.env.STREAM_CHANNELS = "voice_twilio";
process.env.STREAM_CHUNK_MAX_WAIT_MS = "150";
process.env.VOICE_REASONING_OFF_MODELS = "deepseek/, anthropic/claude-haiku";

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
const OPENROUTER_INTEGRATION = { _id: "656728224b45965b69234444", id_project: PROJECT_ID, name: "openrouter",
  value: { apikey: "sk-or-test-key", models: [{ id: "deepseek/deepseek-v4.1-flash-1017", providers: ["together", "deepinfra/fp8"], allow_fallbacks: false },
    { id: "openai/gpt-oss-120b", providers: ["groq"], allow_fallbacks: false }] } };
const DELTAS = ["Ciao! ", "Sono l'assistente ", "virtuale di Aruba. ", "Posso aiutarti ", "con la fibra?"];
const ANSWER = DELTAS.join("");

function sse(event, data) {
  return "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n";
}

/**
 * Mock of tiledesk-server + tiledesk-llm. Records every call with its arrival time.
 * options.deltaDelay: ms between SSE chunks; options.streamStatus: status returned by /stream.
 * options.askPlan(i): per /api/ask call i, { firstDelay: ms before the first chunk, deltas: [...], status: HTTP error };
 * calls.ask[i].aborted is set when the client closes the connection before the end of the answer.
 */
function mockServer(options, ready) {
  const calls = { ask: [], stream: [], messages: [] };
  const server = express();
  server.use(bodyParser.json());
  server.get('/:project_id/integration/name/:name', (req, res) => {
    const integration = [OPENAI_INTEGRATION, OPENROUTER_INTEGRATION].find((i) => i.name === req.params.name);
    if (!integration) {
      return res.status(404).send({ success: false });
    }
    res.status(200).send(integration);
  });
  server.post('/api/ask', async (req, res) => {
    const entry = { body: req.body, t: Date.now(), aborted: false };
    const index = calls.ask.push(entry) - 1;
    const plan = options.askPlan ? options.askPlan(index) || {} : {};
    const deltas = plan.deltas || DELTAS;
    const answer = deltas.join("");
    res.on("close", () => {
      if (!res.writableEnded) {
        entry.aborted = true;
      }
    });
    if (plan.status) {
      return res.status(plan.status).send({ error: "provider error" });
    }
    if (!req.body.stream) {
      return res.status(200).send({ answer: answer });
    }
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    res.write(sse("metadata", { message_id: "m1", status: "started" }));
    if (plan.firstDelay) {
      await new Promise((r) => setTimeout(r, plan.firstDelay));
    }
    for (const d of deltas) {
      await new Promise((r) => setTimeout(r, options.deltaDelay || 20));
      if (res.writableEnded || res.destroyed) {
        return;
      }
      res.write(sse("chunk", { content: d, message_id: "m1" }));
    }
    res.write(sse("metadata", { message_id: "m1", status: "completed", full_response: answer, model_used: { answer: answer, prompt_token_info: { total_tokens: 10 } } }));
    res.end();
  });
  server.post('/:projectId/requests/:requestId/stream', (req, res) => {
    calls.stream.push({ body: req.body, auth: req.headers.authorization, t: Date.now() });
    if (options.onStream) {
      options.onStream(req.body, calls);
    }
    res.status(options.streamStatus || 202).send(options.streamBody || { success: (options.streamStatus || 202) === 202 });
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

function sendToBot(requestId, channelName, text, attributes, requestAttributes) {
  if (attributes === undefined) {
    attributes = {};
  }
  if (requestAttributes === undefined) {
    // the connector marks relay calls on /start (request attribute); Gather calls on the same channel carry no marker
    requestAttributes = channelName === "voice_twilio" ? { voice_stream: true } : {};
  }
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
      "attributes": attributes,
      "request": {
        "request_id": requestId,
        "channel": { "name": channelName },
        "attributes": requestAttributes
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
          assert.strictEqual(calls.ask[0].body.thinking, undefined, "no reasoning field outside OpenRouter");
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

  it('switches reasoning off on a voice turn for an OpenRouter model listed in VOICE_REASONING_OFF_MODELS', (done) => {
    const requestId = newRequestId();
    let listener;
    mockServer({
      onMessage: (body, calls) => {
        let error;
        try {
          assert.strictEqual(calls.ask.length, 1);
          assert.strictEqual(calls.ask[0].body.stream, true);
          assert.deepStrictEqual(calls.ask[0].body.thinking, { type: "disabled" });
          assert.strictEqual(calls.ask[0].body.model.name, "deepseek/deepseek-v4.1-flash-1017");
          assert.deepStrictEqual(calls.ask[0].body.model.provider_routing.order, ["together", "deepinfra/fp8"]);
          assert.strictEqual(spokenText(body), ANSWER);
        } catch (err) {
          error = err;
        }
        listener.close(() => done(error));
      }
    }, (l) => {
      listener = l;
      sendToBot(requestId, "voice_twilio", "/kbor");
    });
  }).timeout(10000);

  it('leaves reasoning alone on a voice turn for an OpenRouter model not listed (mandatory reasoning)', (done) => {
    const requestId = newRequestId();
    let listener;
    mockServer({
      onMessage: (body, calls) => {
        let error;
        try {
          assert.strictEqual(calls.ask.length, 1);
          assert.strictEqual(calls.ask[0].body.stream, true);
          assert.strictEqual(calls.ask[0].body.model.name, "openai/gpt-oss-120b");
          assert.strictEqual(calls.ask[0].body.thinking, undefined);
          assert.strictEqual(spokenText(body), ANSWER);
        } catch (err) {
          error = err;
        }
        listener.close(() => done(error));
      }
    }, (l) => {
      listener = l;
      sendToBot(requestId, "voice_twilio", "/kborx");
    });
  }).timeout(10000);

  it('VOICE_REASONING_OFF_MODELS: empty = never, comma-separated id prefixes otherwise', () => {
    const { DirAiPrompt } = require('../tiledeskChatbotPlugs/directives/DirAiPrompt');
    const saved = process.env.VOICE_REASONING_OFF_MODELS;
    try {
      delete process.env.VOICE_REASONING_OFF_MODELS;
      assert.strictEqual(DirAiPrompt.voiceReasoningOff("deepseek/deepseek-v4.1-flash-1017"), false);
      process.env.VOICE_REASONING_OFF_MODELS = " deepseek/ , anthropic/claude-haiku ";
      assert.strictEqual(DirAiPrompt.voiceReasoningOff("deepseek/deepseek-v4.1-flash-1017"), true);
      assert.strictEqual(DirAiPrompt.voiceReasoningOff("anthropic/claude-haiku-5.5"), true);
      assert.strictEqual(DirAiPrompt.voiceReasoningOff("openai/gpt-oss-120b"), false);
      assert.strictEqual(DirAiPrompt.voiceReasoningOff(undefined), false);
    } finally {
      process.env.VOICE_REASONING_OFF_MODELS = saved;
    }
  });

  it('leaves reasoning alone on an OpenRouter chat turn (no voice)', (done) => {
    const requestId = newRequestId();
    let listener;
    mockServer({
      onMessage: (body, calls) => {
        let error;
        try {
          assert.strictEqual(calls.ask.length, 1);
          assert.ok(!calls.ask[0].body.stream, "a chat turn is not streamed");
          assert.strictEqual(calls.ask[0].body.thinking, undefined);
          assert.strictEqual(calls.stream.length, 0);
        } catch (err) {
          error = err;
        }
        listener.close(() => done(error));
      }
    }, (l) => {
      listener = l;
      sendToBot(requestId, "chat21", "/kbor");
    });
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

  it('streams a relay call marked only with the previous per-message marker (voice_relay)', (done) => {
    const requestId = newRequestId();
    let listener;
    mockServer({
      onMessage: (body, calls) => {
        let error;
        try {
          assert.ok(calls.ask[0].body.stream, "stream not requested for a voice_relay call");
          assert.ok(calls.stream.length > 0, "no chunk streamed");
          assert.ok(body.attributes.stream_id, "final message not tied to the stream");
        } catch (err) {
          error = err;
        }
        listener.close(() => done(error));
      }
    }, (l) => {
      listener = l;
      sendToBot(requestId, "voice_twilio", "/kb", { voice_relay: true }, {});
    });
  }).timeout(10000);

  it('does not stream a Gather call on the voice channel (no voice_stream / voice_relay marker)', (done) => {
    const requestId = newRequestId();
    let listener;
    mockServer({
      onMessage: (body, calls) => {
        let error;
        try {
          assert.ok(!calls.ask[0].body.stream, "stream requested for a Gather call");
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
      sendToBot(requestId, "voice_twilio", "/kb", {}, {});
    });
  }).timeout(10000);

  it('a server without the stream route (404) does not stop the conversation', (done) => {
    const requestId = newRequestId();
    let listener;
    mockServer({
      streamStatus: 404,
      streamBody: "Cannot POST /projectID/requests/x/stream",
      onMessage: (body, calls) => {
        let error;
        try {
          assert.strictEqual(calls.stream.length, 1, "streaming must stop after the first 404");
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

  it('the route 404 for a closed request stops the flow', (done) => {
    const requestId = newRequestId();
    let listener;
    let replied = false;
    mockServer({
      streamStatus: 404,
      streamBody: { success: false, msg: "Request not found or closed." },
      onMessage: () => { replied = true; }
    }, (l) => {
      listener = l;
      sendToBot(requestId, "voice_twilio", "/kb");
      setTimeout(() => {
        let error;
        try {
          assert.strictEqual(replied, false, "a closed request must not get the reply");
        } catch (err) {
          error = err;
        }
        listener.close(() => done(error));
      }, 1500);
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


  // Hedged request (VOICE_HEDGE_AFTER_MS): a second /ask with the provider order rotated when the first is late
  const HEDGE_DELTAS = ["Risposta ", "del secondo ", "provider."];
  const withHedge = (ms, fn) => (done) => {
    const saved = process.env.VOICE_HEDGE_AFTER_MS;
    process.env.VOICE_HEDGE_AFTER_MS = String(ms);
    fn((err) => {
      if (saved === undefined) {
        delete process.env.VOICE_HEDGE_AFTER_MS;
      } else {
        process.env.VOICE_HEDGE_AFTER_MS = saved;
      }
      done(err);
    });
  };
  const hedgeCase = (askPlan, text, check) => (done) => {
    const requestId = newRequestId();
    let listener;
    mockServer({
      askPlan,
      onMessage: (body, calls) => {
        setTimeout(() => { // let the aborted request close
          let error;
          try {
            check(body, calls);
          } catch (err) {
            error = err;
          }
          listener.close(() => done(error));
        }, 200);
      }
    }, (l) => {
      listener = l;
      sendToBot(requestId, "voice_twilio", text);
    });
  };

  it('hedge: a fast first request is not hedged (one /ask)', withHedge(300, hedgeCase(() => ({}), "/kbor", (body, calls) => {
    assert.strictEqual(calls.ask.length, 1);
    assert.strictEqual(spokenText(body), ANSWER);
  }))).timeout(10000);

  it('hedge: a late first request is hedged with the provider order rotated; the hedge answer is spoken, the first aborted',
    withHedge(300, hedgeCase((i) => (i === 0 ? { firstDelay: 2000 } : { deltas: HEDGE_DELTAS }), "/kbor", (body, calls) => {
      assert.strictEqual(calls.ask.length, 2);
      assert.deepStrictEqual(calls.ask[0].body.model.provider_routing.order, ["together", "deepinfra/fp8"]);
      assert.deepStrictEqual(calls.ask[1].body.model.provider_routing.order, ["deepinfra/fp8", "together"]);
      assert.deepStrictEqual(calls.ask[1].body.thinking, { type: "disabled" }, "the hedge is the same request");
      assert.ok(calls.ask[1].t - calls.ask[0].t >= 280, "hedge sent too early: " + (calls.ask[1].t - calls.ask[0].t) + " ms");
      assert.strictEqual(calls.ask[0].aborted, true, "the late request must be aborted");
      assert.strictEqual(spokenText(body), HEDGE_DELTAS.join(""));
      assert.strictEqual(calls.stream.map((c) => c.body.delta).join(""), HEDGE_DELTAS.join(""), "only the winner is streamed");
    }))).timeout(10000);

  it('hedge: when both are late, the first to send a word wins and the other is aborted',
    withHedge(300, hedgeCase((i) => (i === 0 ? { firstDelay: 700 } : { firstDelay: 3000, deltas: HEDGE_DELTAS }), "/kbor", (body, calls) => {
      assert.strictEqual(calls.ask.length, 2);
      assert.strictEqual(spokenText(body), ANSWER);
      assert.strictEqual(calls.ask[1].aborted, true);
      assert.strictEqual(calls.stream.map((c) => c.body.delta).join(""), ANSWER);
    }))).timeout(10000);

  it('hedge: a first request that fails before any word is hedged at once',
    withHedge(2000, hedgeCase((i) => (i === 0 ? { status: 500 } : { deltas: HEDGE_DELTAS }), "/kbor", (body, calls) => {
      assert.strictEqual(calls.ask.length, 2);
      assert.ok(calls.ask[1].t - calls.ask[0].t < 1500, "the hedge must not wait for the timer after an error");
      assert.strictEqual(spokenText(body), HEDGE_DELTAS.join(""));
    }))).timeout(10000);

  it('hedge: off when VOICE_HEDGE_AFTER_MS is 0 (one /ask even if late)',
    withHedge(0, hedgeCase((i) => (i === 0 ? { firstDelay: 1000 } : { deltas: HEDGE_DELTAS }), "/kbor", (body, calls) => {
      assert.strictEqual(calls.ask.length, 1);
      assert.strictEqual(spokenText(body), ANSWER);
    }))).timeout(10000);

  it('hedge: never for a model that is not on OpenRouter',
    withHedge(300, hedgeCase((i) => (i === 0 ? { firstDelay: 1000 } : { deltas: HEDGE_DELTAS }), "/kb", (body, calls) => {
      assert.strictEqual(calls.ask.length, 1);
      assert.strictEqual(spokenText(body), ANSWER);
    }))).timeout(10000);

  it('hedge: a newer caller message during the race aborts both requests; only the new turn replies', withHedge(300, (done) => {
    const requestId = newRequestId();
    let listener;
    let replied = false;
    mockServer({
      askPlan: (i) => (i < 2 ? { firstDelay: 3000 } : { deltas: HEDGE_DELTAS }),
      onMessage: (body, calls) => {
        if (replied || (body.attributes && body.attributes.interrupted)) {
          return;
        }
        replied = true;
        setTimeout(() => {
          let error;
          try {
            // the superseded turn is noticed when its first word arrives (3 s): both racing requests are aborted then
            assert.ok(calls.ask.length >= 3, "expected 2 racing requests + the new turn, got " + calls.ask.length);
            assert.strictEqual(calls.ask[0].aborted, true);
            assert.strictEqual(calls.ask[1].aborted, true);
            const replies = calls.messages.filter((m) => !(m.body.attributes && m.body.attributes.interrupted));
            assert.strictEqual(replies.length, 1, "the superseded turn must not reply");
            assert.strictEqual(spokenText(replies[0].body), HEDGE_DELTAS.join(""));
            const spoken = calls.stream.map((c) => c.body.delta).join("");
            assert.ok(!spoken.includes(DELTAS[0]), "nothing of the superseded turn may be streamed: " + spoken);
          } catch (err) {
            error = err;
          }
          listener.close(() => done(error));
        }, 3500);
      }
    }, (l) => {
      listener = l;
      sendToBot(requestId, "voice_twilio", "/kbor");
      setTimeout(() => sendToBot(requestId, "voice_twilio", "/kbor"), 700); // after the hedge started (300 ms)
    });
  })).timeout(15000);

  it('hedgeBody rotates the OpenRouter provider order and leaves other requests alone', () => {
    const { LlmStream } = require('../utils/LlmStream');
    const body = { llm: "openrouter", question: "q", model: { name: "m", provider_routing: { order: ["a", "b", "c"], allow_fallbacks: false } } };
    assert.deepStrictEqual(LlmStream.hedgeBody(body).model.provider_routing, { order: ["b", "c", "a"], allow_fallbacks: false });
    assert.deepStrictEqual(body.model.provider_routing.order, ["a", "b", "c"], "the original body is not changed");
    const one = { llm: "openrouter", model: { name: "m", provider_routing: { order: ["a"] } } };
    assert.strictEqual(LlmStream.hedgeBody(one), one);
    assert.strictEqual(LlmStream.hedgeBody({ llm: "openai", model: { name: "gpt-4o" } }), null);
    const saved = process.env.VOICE_HEDGE_AFTER_MS;
    try {
      delete process.env.VOICE_HEDGE_AFTER_MS;
      assert.strictEqual(LlmStream.hedgeAfterMs(), 0);
      process.env.VOICE_HEDGE_AFTER_MS = "1000";
      assert.strictEqual(LlmStream.hedgeAfterMs(), 1000);
      process.env.VOICE_HEDGE_AFTER_MS = "abc";
      assert.strictEqual(LlmStream.hedgeAfterMs(), 0);
    } finally {
      if (saved === undefined) delete process.env.VOICE_HEDGE_AFTER_MS; else process.env.VOICE_HEDGE_AFTER_MS = saved;
    }
  });
});
