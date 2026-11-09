'use strict';

const assert = require('assert');
const { getTestKeys, openSealed } = require('./helpers/executionsTestKeys');
const { getConfig } = require('../executions/config');
const { isSecretName, stripSecrets } = require('../executions/secrets');
const Sealer = require('../executions/Sealer');

describe('executions: config, secrets, Sealer', function () {
  const keys = getTestKeys();
  const cfg = { sealPublicKeyPem: keys.publicKeyPem, sealKid: 'k1' };

  it('seal → openSealed round-trips {a:1,b:"x"}', function () {
    const sealed = Sealer.seal({ a: 1, b: 'x' }, cfg);
    assert.deepStrictEqual(openSealed(sealed, keys.privateKeyPem), { a: 1, b: 'x' });
    assert.strictEqual(sealed.size, Buffer.byteLength(JSON.stringify({ a: 1, b: 'x' })));
  });

  it('seal returns null without a public key', function () {
    assert.strictEqual(Sealer.seal({ a: 1 }, { sealPublicKeyPem: null, sealKid: 'k1' }), null);
  });

  it('sealed block has alg "RSA-OAEP-256+A256GCM" and the configured kid', function () {
    const sealed = Sealer.seal({ a: 1 }, cfg);
    assert.strictEqual(sealed.alg, 'RSA-OAEP-256+A256GCM');
    assert.strictEqual(sealed.kid, 'k1');
    for (const f of ['wrapped_key', 'iv', 'tag', 'ct']) assert.ok(sealed[f]);
  });

  it('seal works with a null kid and records kid: null', function () {
    const sealed = Sealer.seal({ a: 1 }, { sealPublicKeyPem: keys.publicKeyPem, sealKid: null });
    assert.strictEqual(sealed.kid, null);
    assert.deepStrictEqual(openSealed(sealed, keys.privateKeyPem), { a: 1 });
  });

  it('seal imports the public key once per pem, not per call (T3c)', function () {
    const crypto = require('crypto');
    const orig = crypto.createPublicKey;
    let n = 0;
    crypto.createPublicKey = function (...args) { n++; return orig.apply(crypto, args); };
    try {
      const pemCfg = { sealPublicKeyPem: getTestKeys().publicKeyPem + '\n', sealKid: 'kc' }; // a pem this file has not used yet
      const a = Sealer.seal({ a: 1 }, pemCfg);
      const b = Sealer.seal({ b: 2 }, pemCfg);
      assert.strictEqual(n, 1);
      assert.deepStrictEqual(openSealed(a, keys.privateKeyPem), { a: 1 });
      assert.deepStrictEqual(openSealed(b, keys.privateKeyPem), { b: 2 });
    } finally {
      crypto.createPublicKey = orig;
    }
  });

  it('seal returns Sealer.TOO_LARGE over cfg.dataMaxBytes (T2)', function () {
    const big = { s: 'x'.repeat(300) };
    assert.strictEqual(Sealer.seal(big, Object.assign({ dataMaxBytes: 100 }, cfg)), Sealer.TOO_LARGE);
    assert.ok(Sealer.seal(big, Object.assign({ dataMaxBytes: 1000 }, cfg)).ct);
    assert.ok(Sealer.seal(big, cfg).ct, 'no cap configured: sealed');
  });

  it('isSecretName', function () {
    for (const n of ['Authorization', 'api_key', 'accessToken', 'password', 'client_secret']) {
      assert.strictEqual(isSecretName(n), true, n);
    }
    for (const n of ['order_total', 'lastUserText']) assert.strictEqual(isSecretName(n), false, n);
  });

  it('stripSecrets masks secret-named keys on a deep copy', function () {
    const input = { headers: { Authorization: 'x' }, body: { n: 1 } };
    assert.deepStrictEqual(stripSecrets(input), { headers: { Authorization: '[secret]' }, body: { n: 1 } });
    assert.strictEqual(input.headers.Authorization, 'x');
  });

  it('valueHash is stable per project, differs across projects, null without hash key', function () {
    const k1 = Sealer.projectHashKey('p1', 'hk');
    const k2 = Sealer.projectHashKey('p2', 'hk');
    assert.strictEqual(Sealer.valueHash(k1, 'v'), Sealer.valueHash(Sealer.projectHashKey('p1', 'hk'), 'v'));
    assert.notStrictEqual(Sealer.valueHash(k1, 'v'), Sealer.valueHash(k2, 'v'));
    assert.strictEqual(Sealer.projectHashKey('p1', null), null);
    assert.strictEqual(Sealer.valueHash(null, 'v'), null);
  });

  describe('getConfig', function () {
    const names = ['EXECUTIONS_ENABLED', 'EXECUTIONS_STATE_ENABLED', 'EXECUTIONS_AMQP_URL', 'AMQP_MANAGER_URL',
      'EXECUTIONS_SEAL_PUBLIC_KEY', 'EXECUTIONS_SEAL_KID', 'EXECUTIONS_STATE_HASH_KEY'];
    let saved;
    beforeEach(function () { saved = {}; names.forEach(n => { saved[n] = process.env[n]; delete process.env[n]; }); });
    afterEach(function () { names.forEach(n => { if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n]; }); });

    it('defaults: disabled, numeric defaults, reads env at call time', function () {
      const c = getConfig();
      assert.strictEqual(c.enabled, false);
      assert.strictEqual(c.stateEnabled, false);
      assert.strictEqual(c.bufferMax, 10000);
      assert.strictEqual(c.dataMaxBytes, 262144);
      assert.strictEqual(c.sealKid, null);
      assert.strictEqual(c.stateValueMaxBytes, 262144);
      assert.strictEqual(c.keyframeEvery, 20);
      assert.strictEqual(c.keyframeMaxDeltaBytes, 1048576);
      process.env.EXECUTIONS_ENABLED = 'true';
      assert.strictEqual(getConfig().enabled, true);
      assert.strictEqual(getConfig().stateEnabled, true);
      process.env.EXECUTIONS_STATE_ENABLED = 'false';
      assert.strictEqual(getConfig().stateEnabled, false);
    });

    it('amqpUrl falls back to AMQP_MANAGER_URL', function () {
      process.env.AMQP_MANAGER_URL = 'amqp://fallback';
      assert.strictEqual(getConfig().amqpUrl, 'amqp://fallback');
      process.env.EXECUTIONS_AMQP_URL = 'amqp://own';
      assert.strictEqual(getConfig().amqpUrl, 'amqp://own');
    });

    it('accepts a PEM or a base64-encoded PEM public key', function () {
      process.env.EXECUTIONS_SEAL_PUBLIC_KEY = keys.publicKeyPem;
      assert.strictEqual(getConfig().sealPublicKeyPem, keys.publicKeyPem);
      process.env.EXECUTIONS_SEAL_PUBLIC_KEY = Buffer.from(keys.publicKeyPem).toString('base64');
      assert.strictEqual(getConfig().sealPublicKeyPem, keys.publicKeyPem);
    });
  });
});
