'use strict';

const crypto = require('node:crypto');
const { sha256, canonicalJson } = require('../native/deterministic');

function signaturePayload(input) {
  return [input.node_id, input.timestamp, input.nonce, input.method, input.path, input.body_hash].join('\n');
}

function signNodeRequest(input, privateKey) {
  const bodyHash = sha256(canonicalJson(input.body || {}));
  const payload = signaturePayload({ ...input, body_hash: bodyHash });
  return { body_hash: bodyHash, signature: crypto.sign(null, Buffer.from(payload), privateKey).toString('base64url') };
}

class AiNodeAuth {
  constructor(options = {}) {
    this.store = options.store;
    this.clock = options.clock || (() => Date.now());
    this.maxSkewMs = Number(options.maxSkewMs || 60_000);
  }

  async verify(input = {}) {
    const node = await this.store.getNode(input.node_id);
    if (!node || !['active', 'degraded'].includes(node.state)) throw Object.assign(new Error('NODE_NOT_ACTIVE'), { code: 'NODE_NOT_ACTIVE' });
    const suppliedCredential = Buffer.from(sha256(String(input.device_credential || '')), 'hex');
    const expectedCredential = Buffer.from(String(node.credential_hash || ''), 'hex');
    if (expectedCredential.length !== suppliedCredential.length || !crypto.timingSafeEqual(expectedCredential, suppliedCredential)) {
      throw Object.assign(new Error('NODE_CREDENTIAL_INVALID'), { code: 'NODE_CREDENTIAL_INVALID' });
    }
    const timestampMs = new Date(input.timestamp).getTime();
    if (!Number.isFinite(timestampMs) || Math.abs(this.clock() - timestampMs) > this.maxSkewMs) throw Object.assign(new Error('NODE_CLOCK_INVALID'), { code: 'NODE_CLOCK_INVALID' });
    const bodyHash = sha256(canonicalJson(input.body || {}));
    if (bodyHash !== input.body_hash) throw Object.assign(new Error('NODE_BODY_HASH_MISMATCH'), { code: 'NODE_BODY_HASH_MISMATCH' });
    const nonceAccepted = await this.store.useNonce(node.node_id, input.nonce, new Date(this.clock() + this.maxSkewMs * 2).toISOString());
    if (!nonceAccepted) throw Object.assign(new Error('NODE_NONCE_REPLAY'), { code: 'NODE_NONCE_REPLAY' });
    const payload = signaturePayload(input);
    const valid = crypto.verify(null, Buffer.from(payload), node.public_key_pem, Buffer.from(String(input.signature || ''), 'base64url'));
    if (!valid) throw Object.assign(new Error('NODE_SIGNATURE_INVALID'), { code: 'NODE_SIGNATURE_INVALID' });
    return node;
  }
}

module.exports = { signaturePayload, signNodeRequest, AiNodeAuth };
