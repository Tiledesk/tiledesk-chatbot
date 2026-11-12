'use strict';

const crypto = require('crypto');

const ALG = 'RSA-OAEP-256+A256GCM';
/** seal() result for a value whose JSON is over cfg.dataMaxBytes: nothing is sealed. */
const TOO_LARGE = Object.freeze({ too_large: true });

// the imported public key, kept per pem (a config change brings a new pem)
let keyCache = { pem: null, key: null };
function publicKeyOf(pem) {
  if (keyCache.pem !== pem) keyCache = { pem, key: crypto.createPublicKey(pem) };
  return keyCache.key;
}

class Sealer {

  /**
   * Envelope-encrypts a JSON-serialisable value: a fresh AES-256-GCM key encrypts it,
   * and the key is wrapped with the RSA public key (OAEP, SHA-256).
   * Returns null when no public key is configured, and Sealer.TOO_LARGE when the JSON is over
   * cfg.dataMaxBytes (when set); the caller flags data_missing for both.
   *
   * @returns {{alg, kid, wrapped_key, iv, tag, ct, size}|null|TOO_LARGE}
   */
  static seal(plain, cfg) {
    if (!cfg || !cfg.sealPublicKeyPem) return null;
    const json = Buffer.from(JSON.stringify(plain === undefined ? null : plain), 'utf8');
    if (cfg.dataMaxBytes > 0 && json.length > cfg.dataMaxBytes) return TOO_LARGE;
    const dataKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, iv);
    const ct = Buffer.concat([cipher.update(json), cipher.final()]);
    const wrapped = crypto.publicEncrypt(
      { key: publicKeyOf(cfg.sealPublicKeyPem), padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      dataKey
    );
    return {
      alg: ALG,
      kid: cfg.sealKid,
      wrapped_key: wrapped.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ct: ct.toString('base64'),
      size: json.length
    };
  }

  /** Per-project HMAC key: HMAC-SHA256(hashKey, idProject). Null without a hash key. */
  static projectHashKey(idProject, hashKey) {
    if (!hashKey) return null;
    return crypto.createHmac('sha256', hashKey).update(String(idProject)).digest();
  }

  /** Hex HMAC-SHA256(projectKey, raw). Null without a project key. */
  static valueHash(projectKey, raw) {
    if (!projectKey) return null;
    return crypto.createHmac('sha256', projectKey).update(String(raw)).digest('hex');
  }
}

Sealer.TOO_LARGE = TOO_LARGE;

module.exports = Sealer;
