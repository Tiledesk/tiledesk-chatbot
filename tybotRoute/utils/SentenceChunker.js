/**
 * Groups LLM deltas into speakable chunks for streaming channels (voice).
 *
 * A chunk is emitted at the last sentence/clause boundary in the buffer (". ! ? ; :" or a newline, followed by
 * whitespace), or, when no boundary arrives within maxWaitMs from the first buffered character, at the last space
 * (never inside a word). Emitted chunks concatenated are exactly the input text.
 *
 * Example:
 *   const chunker = new SentenceChunker({ maxWaitMs: 150, onChunk: (text) => send(text) });
 *   chunker.push(delta); ...; const rest = chunker.flush();
 */
const BOUNDARY = /[.!?;:\n]\s+|\n/g;

class SentenceChunker {

  constructor(options) {
    options = options || {};
    this.maxWaitMs = Number(options.maxWaitMs) >= 0 ? Number(options.maxWaitMs) : 150;
    this.onChunk = options.onChunk || (() => {});
    this.buffer = "";
    this.timer = null;
  }

  push(delta) {
    if (!delta) {
      return;
    }
    this.buffer += delta;
    const cut = SentenceChunker.lastBoundary(this.buffer);
    if (cut > 0) {
      this.#emit(cut);
    }
    this.#armTimer();
  }

  /** Stops the timer and returns what is left (possibly ""), without emitting it. */
  flush() {
    this.#clearTimer();
    const rest = this.buffer;
    this.buffer = "";
    return rest;
  }

  static lastBoundary(text) {
    let cut = -1;
    let match;
    BOUNDARY.lastIndex = 0;
    while ((match = BOUNDARY.exec(text)) !== null) {
      cut = match.index + match[0].length;
    }
    return cut;
  }

  #emit(cut) {
    const chunk = this.buffer.slice(0, cut);
    this.buffer = this.buffer.slice(cut);
    this.#clearTimer();
    if (chunk) {
      this.onChunk(chunk);
    }
  }

  #armTimer() {
    if (this.timer || !this.buffer) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      const space = this.buffer.lastIndexOf(" ");
      if (space > 0) {
        this.#emit(space + 1);
      }
      this.#armTimer();
    }, this.maxWaitMs);
  }

  #clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

}

module.exports = { SentenceChunker };
