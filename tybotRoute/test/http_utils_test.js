const assert = require('assert');
const http = require('http');
const winston = require('../utils/winston');
const httpUtils = require('../utils/HttpUtils');
const HttpUtils = httpUtils.constructor;

describe('HttpUtils error logging', function () {
  let logged, originalError;

  beforeEach(function () {
    logged = [];
    originalError = winston.error;
    winston.error = function (...args) {
      logged.push(args.map(a => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a) + ' ' + require('util').inspect(a, { depth: 6 }); } catch (e) { return require('util').inspect(a, { depth: 6 }); }
      }).join(' '));
    };
  });

  afterEach(function () {
    winston.error = originalError;
  });

  function doRequest(options) {
    return new Promise((resolve) => {
      new HttpUtils().request(options, (err, data) => resolve({ err, data }));
    });
  }

  it('does not log the Authorization header on a connection error', async function () {
    const { err } = await doRequest({ url: 'http://127.0.0.1:1/x?token=q', method: 'GET', headers: { Authorization: 'JWT SECRET' }, json: null });
    assert.ok(err);
    const text = logged.join('\n');
    assert.ok(text.length > 0);
    assert.ok(!text.includes('SECRET'), text);
    assert.ok(!text.includes('token=q'), text);
  });

  it('does not log the Authorization header on a timeout', async function () {
    const server = http.createServer(() => { /* never answers */ });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
      const { err } = await doRequest({ url: 'http://127.0.0.1:' + server.address().port + '/x?token=q', method: 'GET', headers: { Authorization: 'JWT SECRET' }, json: null, timeout: 200 });
      assert.ok(err);
      const text = logged.join('\n');
      assert.ok(text.length > 0);
      assert.ok(!text.includes('SECRET'), text);
      assert.ok(!text.includes('token=q'), text);
    } finally {
      server.closeAllConnections && server.closeAllConnections();
      await new Promise(r => server.close(r));
    }
  });

  it('logs the server response body on an HTTP error', async function () {
    const server = http.createServer((req, res) => {
      res.writeHead(422, { 'Content-Type': 'application/json' });
      res.end('{"error":"nope"}');
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    try {
      const { err } = await doRequest({ url: 'http://127.0.0.1:' + server.address().port + '/x', method: 'GET', headers: { Authorization: 'JWT SECRET' }, json: null });
      assert.ok(err);
      assert.strictEqual(err.response.status, 422);
      const text = logged.join('\n');
      assert.ok(text.includes('nope'), text);
      assert.ok(text.includes('422'), text);
      assert.ok(!text.includes('SECRET'), text);
    } finally {
      await new Promise(r => server.close(r));
    }
  });

  it('errorSummary handles a non-axios error', function () {
    assert.deepStrictEqual(
      HttpUtils.errorSummary(new Error('boom'), 'http://a/b?c=1'),
      { message: 'boom', code: undefined, status: undefined, url: 'http://a/b', data: undefined }
    );
  });
});
