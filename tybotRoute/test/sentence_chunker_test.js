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
