var assert = require('assert');
const axios = require('axios');
const express = require('express');
const tybot = require("../");
const pkg = require('../package.json');

/** `GET /version` dice quale build del motore sta girando: nome e versione di package.json. */
describe('GET /version', () => {
  let listener;
  before((done) => {
    const app = express();
    app.use("/", tybot.router);
    listener = app.listen(10003, '0.0.0.0', () => done());
  });
  after((done) => { listener.close(() => done()); });

  it('returns the package name and version', async () => {
    const res = await axios.get('http://localhost:10003/version');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.data, { name: '@tiledesk/tiledesk-tybot-connector', version: pkg.version });
    assert.strictEqual(res.data.version, '2.2.1-rc16');
  });
});
