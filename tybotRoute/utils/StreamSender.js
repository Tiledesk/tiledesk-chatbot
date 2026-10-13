const axios = require("axios").default;
const { v4: uuidv4 } = require('uuid');
const winston = require('./winston');
const { TiledeskChatbot } = require('../engine/TiledeskChatbot');

/**
 * Posts the chunks of one streamed answer to tiledesk-server (POST /:project_id/requests/:request_id/stream),
 * one at a time and in order, without blocking the caller (send() only queues).
 *
 * Before every chunk it checks the voice turn: when a newer caller message superseded it, nothing more is sent and
 * onStop("superseded") fires. 404 (request missing/closed) stops with onStop("closed"). Any other error (503: stream
 * not available) disables streaming for this answer: the complete message is still sent by the flow as usual.
 */
class StreamSender {

  constructor(options) {
    this.url = options.API_ENDPOINT + "/" + options.projectId + "/requests/" + options.requestId + "/stream";
    this.token = options.token;
    this.tdcache = options.tdcache;
    this.requestId = options.requestId;
    this.turnId = options.turnId;
    this.onStop = options.onStop || (() => {});
    this.timeout = options.timeout || 5000;
    this.streamId = options.streamId || uuidv4();
    this.seq = 0;
    this.sentText = "";
    this.ended = false;
    this.disabled = false;
    this.stopped = null; // "superseded" | "closed"
    this.chain = Promise.resolve();
  }

  send(delta, streamEnd) {
    this.chain = this.chain.then(() => this.#post(delta, streamEnd === true));
    return this.chain;
  }

  end(delta) {
    return this.send(delta || "", true);
  }

  /** Resolves when every queued chunk has been handled. */
  drain() {
    return this.chain;
  }

  /** true when the caller has heard (part of) this answer through the stream. */
  get streamed() {
    return this.seq > 0;
  }

  async #post(delta, streamEnd) {
    if (this.disabled || this.stopped || this.ended) {
      return;
    }
    if (!delta && !streamEnd) {
      return;
    }
    if (streamEnd && this.seq === 0 && !delta) {
      // nothing was streamed: no stream to close
      this.ended = true;
      return;
    }
    try {
      if (await TiledeskChatbot.isTurnSuperseded(this.tdcache, this.requestId, this.turnId)) {
        this.#stop("superseded");
        return;
      }
    } catch (err) {
      winston.error("(StreamSender) Error checking the voice turn: " + err.message);
    }
    try {
      await axios.post(this.url,
        { stream_id: this.streamId, seq: this.seq, delta: delta, stream_end: streamEnd },
        { headers: { "Content-Type": "application/json", "Authorization": "JWT " + this.token }, timeout: this.timeout });
      this.seq++;
      this.sentText += delta;
      if (streamEnd) {
        this.ended = true;
      }
    } catch (err) {
      const status = err.response && err.response.status;
      if (status === 404) {
        this.#stop("closed");
      } else {
        // never log err.config: it carries the Authorization header
        winston.warn("(StreamSender) streaming disabled for " + this.streamId + ": " + (status || err.code || err.message));
        this.disabled = true;
      }
    }
  }

  #stop(reason) {
    this.stopped = reason;
    winston.verbose("(StreamSender) stream " + this.streamId + " stopped: " + reason);
    try {
      this.onStop(reason);
    } catch (err) {
      winston.error("(StreamSender) onStop error: " + err.message);
    }
  }

}

module.exports = { StreamSender };
