'use strict';

const { isSecretName } = require('./secrets');
const Sealer = require('./Sealer');
const { TiledeskChatbotUtil } = require('../utils/TiledeskChatbotUtil');

/** Type of a raw Redis value (JSON string or raw Code-action string). Never returns 'secret'. */
function valueType(raw) {
  if (raw === null || raw === undefined) return 'null';
  let v;
  try {
    v = JSON.parse(raw);
  } catch (e) {
    return 'string';
  }
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  return (t === 'string' || t === 'number' || t === 'boolean') ? t : 'object';
}

/** True when userFlowAttributes drops the key (system / reserved variable). */
function isReserved(key) {
  return Object.keys(TiledeskChatbotUtil.userFlowAttributes({ [key]: 1 })).length === 0;
}

function byteSize(raw) {
  return Buffer.byteLength(String(raw), 'utf8');
}

/**
 * Diff of two raw flow-state maps (HGETALL output, null = empty).
 * opts: {projectKey, valueMaxBytes, attribute: (key) => string}
 */
function diffStates(before, after, opts) {
  const b = before || {};
  const a = after || {};
  const { projectKey, valueMaxBytes, attribute } = opts;
  const changes = [];
  const sealedValues = {};
  let deltaBytes = 0;

  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const key of keys) {
    const inB = Object.prototype.hasOwnProperty.call(b, key);
    const inA = Object.prototype.hasOwnProperty.call(a, key);
    if (inB && inA && b[key] === a[key]) continue;

    const op = !inB ? 'add' : (!inA ? 'del' : 'set');
    const reserved = isReserved(key);
    const by = attribute(key);

    if (isSecretName(key)) {
      changes.push({ key, op, reserved, by, secret: true, type: 'secret', size: 0 });
      continue;
    }

    const current = op === 'del' ? b[key] : a[key];
    const size = byteSize(current);
    const change = { key, op, type: valueType(current), size };
    if (inB) change.hash_before = Sealer.valueHash(projectKey, b[key]);
    if (inA) change.hash_after = Sealer.valueHash(projectKey, a[key]);
    change.reserved = reserved;
    change.by = by;

    // a set whose before side is oversized is omitted too: the before value is not sealed either
    const tooLarge = size > valueMaxBytes || (inB && inA && byteSize(b[key]) > valueMaxBytes);
    if (tooLarge) {
      change.omitted = 'too_large';
    } else {
      const sealed = {};
      if (inB) sealed.before = b[key];
      if (inA) sealed.after = a[key];
      sealedValues[key] = sealed;
      deltaBytes += size;
    }
    changes.push(change);
  }
  return { changes, sealedValues, deltaBytes };
}

/** Clear manifest of the whole state: [{key, type, size, hash, reserved}], no values. */
function buildManifest(raw, { projectKey }) {
  const out = [];
  for (const key of Object.keys(raw || {})) {
    const reserved = isReserved(key);
    if (isSecretName(key)) {
      out.push({ key, type: 'secret', size: 0, hash: null, reserved });
      continue;
    }
    out.push({
      key,
      type: valueType(raw[key]),
      size: byteSize(raw[key]),
      hash: Sealer.valueHash(projectKey, raw[key]),
      reserved
    });
  }
  return out;
}

/** Keyframe at the first block, every cfg.keyframeEvery blocks, or at cfg.keyframeMaxDeltaBytes of deltas. */
function shouldKeyframe({ isFirstBlock, blocksSinceKeyframe, deltaBytesSinceKeyframe }, cfg) {
  return !!isFirstBlock ||
    blocksSinceKeyframe >= cfg.keyframeEvery ||
    deltaBytesSinceKeyframe >= cfg.keyframeMaxDeltaBytes;
}

module.exports = { valueType, isReserved, diffStates, buildManifest, shouldKeyframe };
