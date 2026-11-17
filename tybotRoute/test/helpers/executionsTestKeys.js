'use strict';

const crypto = require('crypto');

let cached = null;

/** RSA-3072 keypair generated once per test run. */
function getTestKeys() {
  if (!cached) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 3072,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    cached = { publicKeyPem: publicKey, privateKeyPem: privateKey };
  }
  return cached;
}

/** Tests only: opens a SealedBlock and returns the parsed plaintext. */
function openSealed(sealed, privateKeyPem) {
  const key = crypto.privateDecrypt(
    { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(sealed.wrapped_key, 'base64')
  );
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(sealed.ct, 'base64')), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

module.exports = { getTestKeys, openSealed };
