'use strict';

const crypto = require('node:crypto');
const { sha256 } = require('../native/deterministic');
const { newOpaqueToken, requireToken } = require('./contracts');

function iso(clock) { return new Date(clock()).toISOString(); }

class AiNodeRegistry {
  constructor(options = {}) {
    this.store = options.store;
    this.clock = options.clock || (() => Date.now());
    this.tokenFactory = options.tokenFactory || newOpaqueToken;
  }

  async issueInstallationCode(input = {}) {
    const unitId = requireToken(input.unit_id, 'AI_UNIT_ID_REQUIRED');
    const ttlMs = Number(input.ttl_ms || 10 * 60 * 1000);
    if (!Number.isFinite(ttlMs) || ttlMs < 30_000 || ttlMs > 24 * 60 * 60 * 1000) throw Object.assign(new Error('INSTALL_CODE_TTL_INVALID'), { code: 'INSTALL_CODE_TTL_INVALID' });
    const code = this.tokenFactory(24);
    const createdAt = iso(this.clock);
    const record = {
      code_hash: sha256(code), unit_id: unitId, created_at: createdAt,
      expires_at: new Date(new Date(createdAt).getTime() + ttlMs).toISOString(), used_at: null
    };
    await this.store.putInstallCode(record);
    return { code, expires_at: record.expires_at, unit_id: unitId };
  }

  async register(input = {}) {
    const codeHash = sha256(String(input.installation_code || ''));
    const now = iso(this.clock);
    const record = await this.store.consumeInstallCode(codeHash, now);
    if (!record || record.expires_at <= now) throw Object.assign(new Error('INSTALL_CODE_INVALID'), { code: 'INSTALL_CODE_INVALID' });
    if (record.unit_id !== input.unit_id) throw Object.assign(new Error('INSTALL_CODE_UNIT_MISMATCH'), { code: 'INSTALL_CODE_UNIT_MISMATCH' });
    let key;
    try { key = crypto.createPublicKey(input.public_key_pem); } catch { throw Object.assign(new Error('NODE_PUBLIC_KEY_INVALID'), { code: 'NODE_PUBLIC_KEY_INVALID' }); }
    if (key.asymmetricKeyType !== 'ed25519') throw Object.assign(new Error('NODE_KEY_TYPE_INVALID'), { code: 'NODE_KEY_TYPE_INVALID' });
    const fingerprint = sha256(key.export({ type: 'spki', format: 'der' }));
    const nodeId = `ain_${fingerprint.slice(0, 24)}`;
    const credential = this.tokenFactory(32);
    const node = {
      node_id: nodeId, unit_id: record.unit_id, public_key_pem: input.public_key_pem,
      public_key_fingerprint: fingerprint, credential_hash: sha256(credential),
      state: 'active', allowed_models: [...new Set(input.allowed_models || [])],
      version: String(input.version || 'unknown'), registered_at: now,
      updated_at: now, last_heartbeat_at: null, credential_version: 1
    };
    await this.store.putNode(node);
    await this.store.appendNodeEvent({ type: 'node_registered', node_id: nodeId, occurred_at: now, state: 'active', unit_id: node.unit_id });
    return { node_id: nodeId, device_credential: credential, credential_version: 1 };
  }

  async setState(nodeId, state, reason = 'operator_action') {
    if (!['active', 'maintenance', 'degraded', 'revoked', 'blocked'].includes(state)) throw Object.assign(new Error('NODE_STATE_INVALID'), { code: 'NODE_STATE_INVALID' });
    const node = await this.store.getNode(nodeId);
    if (!node) throw Object.assign(new Error('NODE_NOT_FOUND'), { code: 'NODE_NOT_FOUND' });
    const now = iso(this.clock);
    const updated = { ...node, state, updated_at: now };
    await this.store.putNode(updated);
    await this.store.appendNodeEvent({ type: `node_${state}`, node_id: nodeId, occurred_at: now, state, reason });
    return updated;
  }

  async rotateCredential(nodeId) {
    const node = await this.store.getNode(nodeId);
    if (!node || node.state === 'revoked') throw Object.assign(new Error('NODE_CREDENTIAL_ROTATION_REFUSED'), { code: 'NODE_CREDENTIAL_ROTATION_REFUSED' });
    const credential = this.tokenFactory(32);
    const now = iso(this.clock);
    const updated = { ...node, credential_hash: sha256(credential), credential_version: node.credential_version + 1, updated_at: now };
    await this.store.putNode(updated);
    await this.store.appendNodeEvent({ type: 'node_credential_rotated', node_id: nodeId, occurred_at: now, credential_version: updated.credential_version });
    return { node_id: nodeId, device_credential: credential, credential_version: updated.credential_version };
  }
}

module.exports = { AiNodeRegistry };
