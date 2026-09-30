var assert = require('assert');
// must be set before the router (and TilebotService) are loaded: nothing listens there
process.env.TILEBOT_ENDPOINT = 'http://127.0.0.1:1';
const axios = require('axios');
const express = require('express');
const tybot = require('..');

describe('POST /block async error', () => {
  let listener;
  let port;

  before((done) => {
    const app = express();
    app.use('/', tybot.router);
    listener = app.listen(0, () => {
      port = listener.address().port;
      done();
    });
  });

  after((done) => {
    listener.close(() => done());
  });

  it('returns 500 with a message only, never the bot token', async () => {
    let res;
    try {
      res = await axios.post(
        `http://127.0.0.1:${port}/block/projectID/botID/blockID`,
        { async: true, token: 'JWT aaa.bbb.ccc' },
        { validateStatus: () => true }
      );
    } catch (e) {
      assert.fail('request failed: ' + e.message);
    }
    assert.strictEqual(res.status, 500);
    assert.strictEqual(res.data.success, false);
    assert.strictEqual(typeof res.data.error, 'string');
    assert.ok(!JSON.stringify(res.data).includes('aaa.bbb.ccc'), JSON.stringify(res.data));
  });
});
