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
 */
class LlmStream {

  constructor(directive, { label, holdMarker } = {}) {
    this.directive = directive;
    this.label = label || "LLM";
    this.holdMarker = holdMarker || null;
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
    let completed = null;
    let error = null;
    let firstDelta = true;
    this._timing("llm_request");
    try {
      const response = await axios.post(url, { ...body, stream: true }, {
        headers: headers,
        responseType: 'stream',
        signal: this.controller.signal,
        timeout: 60000
      });
      await LlmStream.readSSE(response.data, (event, data) => {
        if (event === "chunk" && typeof data.content === "string" && data.content) {
          if (firstDelta) {
            firstDelta = false;
            this._timing("llm_first_delta");
          }
          text += data.content;
          const out = this._release(held + data.content);
          held = out.keep;
          if (out.speak) {
            chunker.push(out.speak);
          }
        }
        else if (event === "metadata" && data.status === "completed") {
          completed = data;
        }
      });
    } catch (err) {
      if (!this.sender.stopped) {
        error = err;
      }
    }
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
      streamed: this.sender.streamed && !this.sender.disabled, chunks: this.sender.seq };
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
