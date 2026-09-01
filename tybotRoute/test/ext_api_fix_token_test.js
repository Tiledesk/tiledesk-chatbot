const assert = require('assert');
const winston = require('../utils/winston');
const { ExtApi } = require('../pipeline/ExtApi');

// REGRESSION TEST - ExtApi.fixToken with no token.
//
// Every plain-text (no-actions) reply goes out through
// ExtApi.sendSupportMessageExt, whose first statement is fixToken(token).
// fixToken went straight to `token.startsWith('JWT ')`, so a missing token
// raised "Cannot read properties of undefined (reading 'startsWith')" from
// inside an async express handler: express 4 does not forward a rejected
// handler promise, and nothing logs it, so the reply was dropped without a
// single line anywhere. That is what made conversation-form-test.js and
// conversation-locked-intent-test.js look like they "timed out" whenever
// CHATBOT_TOKEN was unset (see scripts/run-tests.js).
//
// This is a unit-style test because the failure is invisible from the HTTP
// side by construction - the route swallows the rejection either way. What
// changes, and what is asserted here, is that the failure now names itself
// and is logged.
describe('ExtApi.fixToken', () => {

  let original_winston_error;
  let api;

  beforeEach(() => {
    original_winston_error = winston.error;
    api = new ExtApi({ TILEBOT_ENDPOINT: 'http://localhost:10001' });
  });

  afterEach(() => {
    winston.error = original_winston_error;
  });

  it('is unchanged for a valid token', () => {
    assert.strictEqual(api.fixToken('abcdef'), 'JWT abcdef');
    assert.strictEqual(api.fixToken('JWT abcdef'), 'JWT abcdef');
    assert.strictEqual(api.fixToken('JWT '), 'JWT ');
    assert.strictEqual(api.fixToken('jwt abcdef'), 'JWT jwt abcdef');
  });

  it('fails loudly on a missing token instead of dropping the reply silently', () => {
    for (const bad of [undefined, null, '', 0, {}]) {
      const logged = [];
      winston.error = (...args) => { logged.push(args.map((a) => String(a)).join(' ')); };

      assert.throws(
        () => api.fixToken(bad),
        (err) => {
          assert.ok(err instanceof Error, 'expected an Error for ' + String(bad));
          assert.ok(
            /\(ExtApi\)/.test(err.message),
            'expected the error to name ExtApi, got: ' + err.message
          );
          assert.ok(
            /token/i.test(err.message),
            'expected the error to name the token, got: ' + err.message
          );
          return true;
        },
        'expected fixToken(' + String(bad) + ') to throw'
      );

      assert.strictEqual(
        logged.length, 1,
        'expected exactly one winston.error call for ' + String(bad) + ', got: ' + JSON.stringify(logged)
      );
      assert.ok(
        /\(ExtApi\)/.test(logged[0]),
        'expected the log to name ExtApi, got: ' + logged[0]
      );
    }
  });

});
