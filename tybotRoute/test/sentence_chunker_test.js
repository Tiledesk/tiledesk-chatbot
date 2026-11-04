var assert = require('assert');
const { SentenceChunker } = require('../utils/SentenceChunker');

function collect(maxWaitMs) {
  const chunks = [];
  const chunker = new SentenceChunker({ maxWaitMs: maxWaitMs, onChunk: (t) => chunks.push(t) });
  return { chunks, chunker };
}

describe('SentenceChunker', function () {

  it('emits at sentence and clause boundaries', () => {
    const { chunks, chunker } = collect(10000);
    chunker.push("Ciao! Sono l'assist");
    chunker.push("ente; come posso aiutarti? Dimmi");
    assert.deepStrictEqual(chunks, ["Ciao! ", "Sono l'assistente; come posso aiutarti? "]);
    assert.strictEqual(chunker.flush(), "Dimmi");
  });

  it('does not cut decimals or words without a following space', () => {
    const { chunks, chunker } = collect(10000);
    chunker.push("Costa 3.5 euro al mese");
    assert.deepStrictEqual(chunks, []);
    assert.strictEqual(chunker.flush(), "Costa 3.5 euro al mese");
  });

  it('cuts at a newline', () => {
    const { chunks, chunker } = collect(10000);
    chunker.push("Primo punto\nSecondo");
    assert.deepStrictEqual(chunks, ["Primo punto\n"]);
    chunker.flush();
  });

  it('emits at the last space after maxWaitMs without a boundary', async () => {
    const { chunks, chunker } = collect(50);
    chunker.push("una frase lunga che non fin");
    await new Promise((r) => setTimeout(r, 120));
    assert.deepStrictEqual(chunks, ["una frase lunga che non "]);
    assert.strictEqual(chunker.flush(), "fin");
  });

  it('keeps the text intact: chunks + rest == input', async () => {
    const { chunks, chunker } = collect(20);
    const input = ["Buongiorno, ", "la fibra arriva ", "a 2.5 Gbit/s. ", "Vuoi ", "sapere ", "altro"];
    for (const d of input) {
      chunker.push(d);
      await new Promise((r) => setTimeout(r, 15));
    }
    const rest = chunker.flush();
    assert.strictEqual(chunks.join("") + rest, input.join(""));
  });

  it('flush stops the timer', async () => {
    const { chunks, chunker } = collect(20);
    chunker.push("senza confine");
    chunker.flush();
    await new Promise((r) => setTimeout(r, 60));
    assert.deepStrictEqual(chunks, []);
  });

});

describe('SentenceChunker first chunk', function () {

  it('firstMaxWaitMs cuts the first chunk sooner, then maxWaitMs applies', async () => {
    const chunks = [];
    const chunker = new SentenceChunker({ maxWaitMs: 200, firstMaxWaitMs: 10, onChunk: (t) => chunks.push(t) });
    chunker.push("Il costo della fibra ");
    await new Promise((r) => setTimeout(r, 40));
    assert.deepStrictEqual(chunks, ["Il costo della fibra "]);
    chunker.push("parte da venti euro al ");
    await new Promise((r) => setTimeout(r, 60));
    assert.strictEqual(chunks.length, 1, "second chunk must wait maxWaitMs");
    await new Promise((r) => setTimeout(r, 200));
    assert.deepStrictEqual(chunks, ["Il costo della fibra ", "parte da venti euro al "]);
    chunker.flush();
  });

  it('a 0 ms wait without a word boundary waits for the next delta (no busy loop)', async () => {
    const chunks = [];
    const chunker = new SentenceChunker({ maxWaitMs: 0, onChunk: (t) => chunks.push(t) });
    chunker.push("Buongiorno");
    await new Promise((r) => setTimeout(r, 30));
    assert.deepStrictEqual(chunks, []);
    assert.strictEqual(chunker.timer, null);
    chunker.push(", come ");
    await new Promise((r) => setTimeout(r, 10));
    assert.deepStrictEqual(chunks, ["Buongiorno, come "]);
    chunker.flush();
  });

  it('defaults to maxWaitMs when firstMaxWaitMs is not set', () => {
    assert.strictEqual(new SentenceChunker({ maxWaitMs: 150 }).firstMaxWaitMs, 150);
    assert.strictEqual(new SentenceChunker({ maxWaitMs: 150, firstMaxWaitMs: "" }).firstMaxWaitMs, 150);
    assert.strictEqual(new SentenceChunker({ maxWaitMs: 150, firstMaxWaitMs: "0" }).firstMaxWaitMs, 0);
  });

});
