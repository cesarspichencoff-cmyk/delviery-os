'use strict';

const crypto = require('node:crypto');

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function canonicalJson(value) { return JSON.stringify(canonicalize(value)); }
function sha256(value) { return crypto.createHash('sha256').update(Buffer.from(value)).digest('hex'); }

function signaturePayload(input) {
  return [input.node_id, input.timestamp, input.nonce, input.method, input.path, input.body_hash].join('\n');
}

function signNodeRequest(input, privateKey) {
  const bodyHash = sha256(canonicalJson(input.body || {}));
  const payload = signaturePayload({ ...input, body_hash: bodyHash });
  return {
    body_hash: bodyHash,
    signature: crypto.sign(null, Buffer.from(payload), privateKey).toString('base64url')
  };
}

module.exports = { canonicalize, canonicalJson, sha256, signaturePayload, signNodeRequest };
