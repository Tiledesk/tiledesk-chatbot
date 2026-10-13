/**
 * Groups LLM deltas into speakable chunks for streaming channels (voice).
 *
 * A chunk is emitted at the last sentence/clause boundary in the buffer (". ! ? ; :" or a newline, followed by
 * whitespace), or, when no boundary arrives within maxWaitMs from the first buffered character, at the last space
 * (never inside a word). Emitted chunks concatenated are exactly the input text.
 * firstMaxWaitMs (default: maxWaitMs) applies to the first chunk only: a low value starts the speech sooner without
 * splitting the rest of the answer into many small chunks.
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
    const first = options.firstMaxWaitMs;
    this.firstMaxWaitMs = (first !== undefined && first !== null && first !== "" && Number(first) >= 0) ? Number(first) : this.maxWaitMs;
    this.emitted = 0;
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
      this.emitted++;
      this.onChunk(chunk);
    }
  }

  #armTimer() {
    if (this.timer || !this.buffer) {
      return;
    }
    const wait = this.emitted === 0 ? this.firstMaxWaitMs : this.maxWaitMs;
    this.timer = setTimeout(() => {
      this.timer = null;
      const space = this.buffer.lastIndexOf(" ");
      if (space > 0) {
        this.#emit(space + 1);
        this.#armTimer();
      }
      // no word boundary yet: the next push arms the timer again (no busy loop with a 0 ms wait)
    }, wait);
  }

  #clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

}

module.exports = { SentenceChunker };
