const axios = require("axios").default;
const { TiledeskClient } = require('@tiledesk/tiledesk-client');
const { TiledeskChatbotUtil } = require("./TiledeskChatbotUtil");
const { SentenceChunker } = require("./SentenceChunker");
const { StreamSender } = require("./StreamSender");
const winston = require('./winston');

/**
 * Voice turns: streams an LLM answer to the caller while tiledesk-llm is still generating it. Shared by the AI Prompt
 * (/ask) and Ask Knowledge Base (/qa) actions: both answer with SSE ("chunk" events, then a "metadata" event with
 * status "completed"). Deltas are grouped by SentenceChunker and posted to tiledesk-server /stream by StreamSender.
 *
 * holdMarker: a marker the model may append at the very end of its answer (e.g. "<NOANS>" for a knowledge-base miss):
 * any trailing text that could be the start of it is held back, so the marker is never spoken; the marker found at
 * the end is reported as result.marker and removed from result.text.
 *
 * run() resolves with { stopped, error, text, completed, marker, streamed }: stopped = "superseded" (a newer caller
 * message: the request is aborted) or "closed" (the request is closed) or null.
 *
 * hedgeAfterMs (> 0, AI Prompt on OpenRouter only, see LlmStream.hedgeBody): hedged request against provider latency
 * spikes. If no word has arrived after hedgeAfterMs (or the first request fails before any word), the same request is
 * sent again with the OpenRouter provider order rotated; the first of the two to send a word is spoken and the other
 * is aborted. Nothing is spoken before the first word, so the caller never hears parts of two answers.
 */
class LlmStream {

  constructor(directive, { label, holdMarker, hedgeAfterMs } = {}) {
    this.directive = directive;
    this.label = label || "LLM";
    this.holdMarker = holdMarker || null;
    this.hedgeAfterMs = hedgeAfterMs > 0 ? hedgeAfterMs : 0;
    this.controller = new AbortController();
    this.sender = new StreamSender({
      API_ENDPOINT: directive.API_ENDPOINT,
      projectId: directive.projectId,
      requestId: directive.requestId,
      token: directive.token,
      tdcache: directive.tdcache,
      turnId: directive.context.turnId,
      onStop: () => this.controller.abort()
    });
  }

  get streamId() {
    return this.sender.streamId;
  }

  _timing(event) {
    winston.info("[VoiceTiming] " + this.directive.requestId + " " + this.directive.context.turnId + " " + event + " " + Date.now());
  }

  /** Text that can be spoken now: all but a trailing part that could still turn into holdMarker. */
  _release(held) {
    const marker = this.holdMarker;
    if (!marker) {
      return { speak: held, keep: "" };
    }
    const at = held.indexOf(marker);
    if (at !== -1) {
      return { speak: held.slice(0, at), keep: held.slice(at) };
    }
    for (let n = Math.min(marker.length - 1, held.length); n > 0; n--) {
      if (marker.startsWith(held.slice(held.length - n))) {
        return { speak: held.slice(0, held.length - n), keep: held.slice(held.length - n) };
      }
    }
    return { speak: held, keep: "" };
  }

  async run(url, body, headers) {
    let firstChunk = true;
    const chunker = new SentenceChunker({
      maxWaitMs: process.env.STREAM_CHUNK_MAX_WAIT_MS,
      firstMaxWaitMs: process.env.STREAM_CHUNK_FIRST_MAX_WAIT_MS,
      onChunk: (text) => {
        if (firstChunk) {
          firstChunk = false;
          this._timing("first_chunk");
        }
        this.sender.send(text);
      }
    });
    let text = "";
    let held = "";
    const attempts = [];
    let winner = null;
    let hedgeTimer = null;

    // only the attempt that sends the first word is spoken; the others are aborted
    const onEvent = (attempt) => (event, data) => {
      if (winner && winner !== attempt) {
        return;
      }
      if (event === "chunk" && typeof data.content === "string" && data.content) {
        if (!winner) {
          winner = attempt;
          clearTimeout(hedgeTimer);
          attempts.filter((a) => a !== attempt).forEach((a) => a.controller.abort());
          this._timing("llm_first_delta");
          if (attempts.length > 1) {
            this._timing(attempt.hedge ? "hedge_won" : "hedge_lost");
          }
        }
        text += data.content;
        const out = this._release(held + data.content);
        held = out.keep;
        if (out.speak) {
          chunker.push(out.speak);
        }
      }
      else if (event === "metadata" && data.status === "completed") {
        attempt.completed = data;
      }
    };
    const start = (requestBody, hedge) => {
      const attempt = { hedge, controller: new AbortController(), completed: null, error: null };
      attempt.promise = (async () => {
        try {
          const response = await axios.post(url, { ...requestBody, stream: true }, {
            headers: headers,
            responseType: 'stream',
            signal: attempt.controller.signal,
            timeout: 60000
          });
          await LlmStream.readSSE(response.data, onEvent(attempt));
        } catch (err) {
          attempt.error = err;
        }
      })();
      attempts.push(attempt);
      return attempt;
    };
    const stopAll = () => attempts.forEach((a) => a.controller.abort());
    this.controller.signal.addEventListener("abort", stopAll);

    const hedgeBody = this.hedgeAfterMs ? LlmStream.hedgeBody(body) : null;
    const startHedge = () => {
      if (!hedgeBody || winner || attempts.length > 1 || this.sender.stopped) {
        return;
      }
      this._timing("hedge_start");
      start(hedgeBody, true);
    };
    this._timing("llm_request");
    const primary = start(body, false);
    if (hedgeBody) {
      hedgeTimer = setTimeout(startHedge, this.hedgeAfterMs);
    }
    await primary.promise;
    clearTimeout(hedgeTimer);
    if (!winner) {
      startHedge(); // the first request ended (error or no answer) before any word: try the other provider at once
    }
    await Promise.all(attempts.map((a) => a.promise));
    this.controller.signal.removeEventListener("abort", stopAll);

    let error = null;
    if (!this.sender.stopped) {
      error = winner ? winner.error : (attempts.every((a) => a.error) ? attempts[attempts.length - 1].error : null);
    }
    const completed = winner ? winner.completed : (attempts.map((a) => a.completed).find(Boolean) || null);
    let marker = null;
    if (this.holdMarker && held.startsWith(this.holdMarker)) {
      marker = this.holdMarker;
      held = held.slice(this.holdMarker.length);
    }
    if (held) {
      chunker.push(held);
    }
    this.sender.end(chunker.flush());
    await this.sender.drain();
    this._timing("llm_done");

    if (this.holdMarker && text.includes(this.holdMarker)) {
      marker = this.holdMarker;
      text = text.split(this.holdMarker).join("");
    }
    return { stopped: this.sender.stopped || null, error, text: text.trim(), completed, marker,
      streamed: this.sender.streamed && !this.sender.disabled, chunks: this.sender.seq,
      hedged: attempts.length > 1, hedgeWon: !!(winner && winner.hedge) };
  }

  /**
   * Body of the hedged request: the same /ask request with the OpenRouter provider order rotated (["together",
   * "deepinfra/fp8"] -> ["deepinfra/fp8", "together"]), so the second try starts at another provider. With one or no
   * provider the order stays the same (a new request rarely hits the same stalled queue). null when the request is
   * not an OpenRouter one (no hedging).
   */
  static hedgeBody(body) {
    if (!body || body.llm !== "openrouter" || !body.model || typeof body.model !== "object") {
      return null;
    }
    const routing = body.model.provider_routing;
    if (!routing || !Array.isArray(routing.order) || routing.order.length < 2) {
      return body;
    }
    const order = routing.order.slice(1).concat(routing.order[0]);
    return { ...body, model: { ...body.model, provider_routing: { ...routing, order } } };
  }

  /** VOICE_HEDGE_AFTER_MS: ms without a word before the hedged request (0, empty or invalid = no hedging). Read per call. */
  static hedgeAfterMs() {
    const ms = parseInt(process.env.VOICE_HEDGE_AFTER_MS, 10);
    return Number.isInteger(ms) && ms > 0 ? ms : 0;
  }

  /** The reply that speaks `answer` (DirReply) gets attributes.stream_id: the channel closes the stream instead of re-speaking it. */
  async savePending(answer) {
    if (this.sender.streamed && !this.sender.disabled) {
      const { TiledeskChatbot } = require("../engine/TiledeskChatbot"); // lazy: engine <-> directives require cycle
      await this.directive.tdcache.setJSON(TiledeskChatbot.pendingStreamCacheKey(this.directive.requestId),
        { stream_id: this.sender.streamId, text: answer }, { EX: 120 });
    }
  }

  /** Posts what the caller heard of an interrupted answer, so the conversation keeps it. */
  async sendInterrupted() {
    if (!this.sender.streamed) {
      return;
    }
    const d = this.directive;
    const message = {
      text: this.sender.sentText,
      senderFullname: d.chatbot.bot.name,
      attributes: { stream_id: this.sender.streamId, interrupted: true }
    };
    try {
      await TiledeskChatbotUtil.updateConversationTranscript(d.chatbot, message);
      const tdClient = new TiledeskClient({ projectId: d.projectId, token: d.token, APIURL: d.API_ENDPOINT, APIKEY: "___" });
      await new Promise((resolve) => {
        tdClient.sendSupportMessage(d.requestId, message, (err) => {
          if (err) {
            winston.error(this.label + " error sending the interrupted answer: " + (err.message || err));
          }
          resolve();
        });
      });
    } catch (err) {
      winston.error(this.label + " error sending the interrupted answer: " + err.message);
    }
  }

  /** Reads a text/event-stream body, calling onEvent(eventName, parsedData) for every event. */
  static readSSE(stream, onEvent) {
    return new Promise((resolve, reject) => {
      let buffer = "";
      const dispatch = (block) => {
        let event = "message";
        const data = [];
        block.split(/\r?\n/).forEach((line) => {
          if (line.startsWith("event:")) {
            event = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            data.push(line.slice(5).replace(/^ /, ""));
          }
        });
        if (data.length === 0) {
          return;
        }
        let parsed;
        try {
          parsed = JSON.parse(data.join("\n"));
        } catch (err) {
          return;
        }
        onEvent(event, parsed);
      };
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => {
        buffer += chunk;
        let sep;
        while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
          const block = buffer.slice(0, sep);
          buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, "");
          dispatch(block);
        }
      });
      stream.on("end", () => {
        if (buffer.trim()) {
          dispatch(buffer);
        }
        resolve();
      });
      stream.on("error", reject);
      stream.on("close", resolve);
    });
  }
}

module.exports = { LlmStream };
