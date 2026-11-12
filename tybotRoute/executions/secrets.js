'use strict';

const MASK = '[secret]';

/** A name is secret when, lowercased, it equals authorization/password or contains token, key or secret. */
function isSecretName(name) {
  if (typeof name !== 'string') return false;
  const n = name.toLowerCase();
  return n === 'authorization' || n === 'password' ||
    n.includes('token') || n.includes('key') || n.includes('secret');
}

/** Deep copy of value where the values of secret-named keys are replaced by "[secret]". */
function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === 'object') {
    if (value instanceof Date) return new Date(value.getTime());
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = isSecretName(k) ? MASK : stripSecrets(value[k]);
    }
    return out;
  }
  return value;
}

module.exports = { isSecretName, stripSecrets, MASK };
