var assert = require('assert');
const winston = require('winston');
const logger = require('../utils/winston');
const { redactSecrets } = require('../utils/winston');

const MESSAGE = Symbol.for('message');

const Transport = require('winston-transport');
class Mem extends Transport {
  constructor(opts, lines) { super(opts); this.lines = lines; }
  log(info, cb) { this.lines.push(info[MESSAGE]); cb(); }
}

// Logs through a real winston logger using the same format pipeline as the
// transports of ../utils/winston and returns the rendered line.
function render(level, message, ...meta) {
  const lines = [];
  const l = winston.createLogger({
    transports: [new Mem({ format: winston.format.combine(redactSecrets(), winston.format.simple()) }, lines)]
  });
  l.log(level, message, ...meta);
  return lines[0];
}

function axiosLikeError() {
  return Object.assign(new Error('Request failed'), {
    config: {
      headers: { Authorization: 'JWT aaa.bbb.ccc' },
      data: '{"token":"JWT aaa.bbb.ccc"}'
    }
  });
}

describe('winston redaction', () => {
  it('exports the logger and the format', () => {
    assert.strictEqual(typeof logger.info, 'function');
    assert.strictEqual(typeof redactSecrets, 'function');
  });

  it('redacts an axios-like error passed as splat metadata', () => {
    const out = render('error', 'x', axiosLikeError());
    assert.ok(!out.includes('aaa.bbb.ccc'), out);
    assert.ok(out.includes('Request failed'), out);
  });

  it('redacts an axios-like error passed via the real logger transports', (done) => {
    const lines = [];
    const t = new Mem({ format: winston.format.combine(redactSecrets(), winston.format.simple()) }, lines);
    logger.add(t);
    logger.error("x", axiosLikeError());
    logger.info('execIntent token: JWT aaa.bbb.ccc');
    logger.info('hello world');
    setImmediate(() => {
      logger.remove(t);
      const all = lines.join('\n');
      assert.ok(!all.includes('aaa.bbb.ccc'), all);
      assert.ok(lines.some((l) => l.includes('hello world')));
      done();
    });
  });

  it('redacts sensitive object keys', () => {
    const out = render('info', 'cfg', { config: { data: { gptkey: 'sk-123', password: 'pw1', ok: 'fine' } }, 'x-api-key': 'k9' });
    assert.ok(!out.includes('sk-123'), out);
    assert.ok(!out.includes('pw1'), out);
    assert.ok(!out.includes('k9'), out);
    assert.ok(out.includes('fine'), out);
  });

  it('redacts JWT and Bearer strings in the message', () => {
    const out = render('info', 'execIntent token: JWT aaa.bbb.ccc and Bearer zzz.yyy');
    assert.ok(!out.includes('aaa.bbb.ccc'), out);
    assert.ok(!out.includes('zzz.yyy'), out);
    assert.ok(out.includes('JWT [REDACTED]'), out);
  });

  it('leaves ordinary messages unchanged', () => {
    assert.strictEqual(render('info', 'hello world'), 'info: hello world');
  });

  it('does not mutate the caller objects', () => {
    const err = axiosLikeError();
    render('error', 'x', err);
    assert.strictEqual(err.config.headers.Authorization, 'JWT aaa.bbb.ccc');
    assert.strictEqual(err.config.data, '{"token":"JWT aaa.bbb.ccc"}');
    const obj = { token: 'abc' };
    render('info', 'y', obj);
    assert.strictEqual(obj.token, 'abc');
  });

  it('does not throw on cyclic objects', () => {
    const a = { name: 'a', token: 'secret-value' };
    a.self = a;
    let out;
    assert.doesNotThrow(() => { out = render('info', 'cyc', a); });
    assert.ok(!out.includes('secret-value'), out);
  });
});
