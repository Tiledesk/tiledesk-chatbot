'use strict';

const assert = require('assert');
const Sealer = require('../executions/Sealer');
const { valueType, isReserved, diffStates, buildManifest, shouldKeyframe } = require('../executions/StateDiff');

describe('executions: StateDiff', function () {
  const projectKey = Sealer.projectHashKey('p1', 'hash-key');
  const opts = { projectKey, valueMaxBytes: 262144, attribute: (k) => 'act-' + k };

  it('unchanged keys are not in changes', function () {
    const r = diffStates({ a: '"1"', b: '2' }, { a: '"1"', b: '2' }, opts);
    assert.deepStrictEqual(r.changes, []);
    assert.deepStrictEqual(r.sealedValues, {});
    assert.strictEqual(r.deltaBytes, 0);
  });

  it('add / set / del ops', function () {
    const r = diffStates({ s: '"old"', d: '"gone"' }, { s: '"new!"', n: '5' }, opts);
    const by = Object.fromEntries(r.changes.map(c => [c.key, c]));
    assert.strictEqual(by.n.op, 'add');
    assert.strictEqual(by.n.type, 'number');
    assert.strictEqual(by.n.size, 1);
    assert.ok(!('hash_before' in by.n));
    assert.strictEqual(by.n.hash_after, Sealer.valueHash(projectKey, '5'));
    assert.strictEqual(by.s.op, 'set');
    assert.strictEqual(by.s.size, 6);
    assert.strictEqual(by.s.hash_before, Sealer.valueHash(projectKey, '"old"'));
    assert.strictEqual(by.d.op, 'del');
    assert.strictEqual(by.d.type, 'string');
    assert.strictEqual(by.d.size, 6);
    assert.ok(!('hash_after' in by.d));
    assert.deepStrictEqual(r.sealedValues.d, { before: '"gone"' });
    assert.deepStrictEqual(r.sealedValues.n, { after: '5' });
    assert.deepStrictEqual(r.sealedValues.s, { before: '"old"', after: '"new!"' });
    assert.strictEqual(r.deltaBytes, 1 + 6 + 6);
    assert.strictEqual(by.n.reserved, false);
  });

  it('by comes from attribute(key)', function () {
    const r = diffStates(null, { x: '1' }, opts);
    assert.strictEqual(r.changes[0].by, 'act-x');
  });

  it('diffStates handles raw and oversized values', function () {
    const raw = diffStates(null, { x: 'plain text not json' }, opts);
    assert.strictEqual(raw.changes[0].type, 'string');
    const big = 'a'.repeat(307200);
    const r = diffStates({}, { y: big }, opts);
    const c = r.changes[0];
    assert.strictEqual(c.omitted, 'too_large');
    assert.strictEqual(c.size, 307200);
    assert.ok(c.hash_after);
    assert.ok(!('y' in r.sealedValues));
    assert.strictEqual(r.deltaBytes, 0);
  });

  it('no project key gives null hashes', function () {
    const r = diffStates(null, { x: '1' }, { ...opts, projectKey: null });
    assert.strictEqual(r.changes[0].hash_after, null);
  });

  it('secret keys carry secret:true, no hashes, no sealed value', function () {
    const r = diffStates({ api_token: '"a"' }, { api_token: '"b"', password: '"p"' }, opts);
    for (const c of r.changes) {
      assert.strictEqual(c.secret, true);
      assert.strictEqual(c.type, 'secret');
      assert.strictEqual(c.size, 0);
      assert.ok(!('hash_before' in c) && !('hash_after' in c));
    }
    assert.deepStrictEqual(r.sealedValues, {});
    assert.strictEqual(r.deltaBytes, 0);
  });

  it('reserved true for lastUserText and _tdX, false for order_total', function () {
    assert.strictEqual(isReserved('lastUserText'), true);
    assert.strictEqual(isReserved('_tdX'), true);
    assert.strictEqual(isReserved('order_total'), false);
  });

  it('valueType', function () {
    assert.strictEqual(valueType(null), 'null');
    assert.strictEqual(valueType(undefined), 'null');
    assert.strictEqual(valueType('null'), 'null');
    assert.strictEqual(valueType('"s"'), 'string');
    assert.strictEqual(valueType('3'), 'number');
    assert.strictEqual(valueType('true'), 'boolean');
    assert.strictEqual(valueType('[1]'), 'array');
    assert.strictEqual(valueType('{"a":1}'), 'object');
    assert.strictEqual(valueType('hello'), 'string');
  });

  it('buildManifest lists every key without values', function () {
    const m = buildManifest({ a: '"x"', api_key: '"s"', _tdX: '1' }, { projectKey });
    const by = Object.fromEntries(m.map(e => [e.key, e]));
    assert.deepStrictEqual(by.a, { key: 'a', type: 'string', size: 3, hash: Sealer.valueHash(projectKey, '"x"'), reserved: false });
    assert.deepStrictEqual(by.api_key, { key: 'api_key', type: 'secret', size: 0, hash: null, reserved: false });
    assert.strictEqual(by._tdX.reserved, true);
    assert.deepStrictEqual(buildManifest(null, { projectKey }), []);
  });

  it('shouldKeyframe', function () {
    const cfg = { keyframeEvery: 20, keyframeMaxDeltaBytes: 1048576 };
    assert.strictEqual(shouldKeyframe({ isFirstBlock: true, blocksSinceKeyframe: 0, deltaBytesSinceKeyframe: 0 }, cfg), true);
    assert.strictEqual(shouldKeyframe({ isFirstBlock: false, blocksSinceKeyframe: 20, deltaBytesSinceKeyframe: 0 }, cfg), true);
    assert.strictEqual(shouldKeyframe({ isFirstBlock: false, blocksSinceKeyframe: 1, deltaBytesSinceKeyframe: 1048576 }, cfg), true);
    assert.strictEqual(shouldKeyframe({ isFirstBlock: false, blocksSinceKeyframe: 19, deltaBytesSinceKeyframe: 1048575 }, cfg), false);
  });
});
