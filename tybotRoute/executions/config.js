'use strict';

function bool(v, def) {
  if (v === undefined || v === null || v === '') return def;
  return String(v).toLowerCase() === 'true' || v === '1';
}

function int(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function pem(v) {
  if (!v) return null;
  const s = String(v);
  if (s.trim().startsWith('-----BEGIN')) return s;
  try {
    const decoded = Buffer.from(s.trim(), 'base64').toString('utf8');
    return decoded.trim().startsWith('-----BEGIN') ? decoded : null;
  } catch (e) {
    return null;
  }
}

/**
 * Execution traceability configuration.
 * Reads process.env on every call so tests (and runtime reconfig) can override it.
 */
function getConfig() {
  const env = process.env;
  const enabled = isEnabled();
  return {
    enabled,
    stateEnabled: bool(env.EXECUTIONS_STATE_ENABLED, enabled),
    amqpUrl: env.EXECUTIONS_AMQP_URL || env.AMQP_MANAGER_URL || null,
    sealPublicKeyPem: pem(env.EXECUTIONS_SEAL_PUBLIC_KEY),
    sealKid: env.EXECUTIONS_SEAL_KID || null,
    bufferMax: int(env.EXECUTIONS_BUFFER_MAX, 10000),
    bufferMaxBytes: int(env.EXECUTIONS_BUFFER_MAX_BYTES, 67108864),
    dataMaxBytes: int(env.EXECUTIONS_DATA_MAX_BYTES, 262144),
    stateValueMaxBytes: int(env.EXECUTIONS_STATE_VALUE_MAX_BYTES, 262144),
    keyframeEvery: int(env.EXECUTIONS_STATE_KEYFRAME_EVERY, 20),
    keyframeMaxDeltaBytes: int(env.EXECUTIONS_STATE_KEYFRAME_MAX_DELTA_BYTES, 1048576),
    hashKey: env.EXECUTIONS_STATE_HASH_KEY || null,
    jumpBudgetMs: int(env.EXECUTIONS_JUMP_BUDGET_MS, 1000),
    leaseMs: int(env.EXECUTIONS_LEASE_MS, 15000),
    heartbeatMs: int(env.EXECUTIONS_HEARTBEAT_MS, 5000),
    transitMs: int(env.EXECUTIONS_TRANSIT_MS, 120000)
  };
}

/** Cheap check of the off switch only (same rule as getConfig().enabled). */
function isEnabled() {
  return bool(process.env.EXECUTIONS_ENABLED, false);
}

module.exports = { getConfig, isEnabled };
