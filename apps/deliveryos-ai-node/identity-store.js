'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function fail(code) { throw Object.assign(new Error(code), { code }); }

class InMemorySecretProtector {
  constructor() { this.key = crypto.randomBytes(32); }
  protect(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(Buffer.from(value)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
  }
  unprotect(value) {
    const bytes = Buffer.from(value, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
  }
}

class DpapiPowerShellProtector {
  constructor(options = {}) {
    this.script = path.resolve(options.script);
    if (!fs.existsSync(this.script)) fail('AI_NODE_DPAPI_SCRIPT_MISSING');
  }

  invoke(operation, value) {
    const result = spawnSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'RemoteSigned',
      '-File', this.script, '-Operation', operation
    ], { encoding: 'utf8', input: value, windowsHide: true, shell: false, timeout: 15_000 });
    if (result.status !== 0) fail('AI_NODE_DPAPI_FAILED');
    return String(result.stdout || '').trim();
  }

  protect(value) { return this.invoke('Protect', Buffer.from(value).toString('base64')); }
  unprotect(value) { return Buffer.from(this.invoke('Unprotect', value), 'base64').toString('utf8'); }
}

class NodeIdentityStore {
  constructor(options = {}) {
    this.root = path.resolve(options.root);
    this.protector = options.protector;
    if (!this.protector) fail('AI_NODE_SECRET_PROTECTOR_REQUIRED');
    this.file = path.join(this.root, 'node-identity.json');
  }

  writeAtomic(record) {
    fs.mkdirSync(this.root, { recursive: true });
    const temporary = path.join(this.root, `.node-identity-${crypto.randomUUID()}.partial`);
    try {
      fs.writeFileSync(temporary, JSON.stringify(record, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, this.file);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }


  create() {
    if (fs.existsSync(this.file)) fail('AI_NODE_IDENTITY_EXISTS');
    fs.mkdirSync(this.root, { recursive: true });
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const record = {
      schema_version: 'deliveryos-ai-node-identity-v1',
      public_key_pem: publicKey.export({ type: 'spki', format: 'pem' }),
      protected_private_key: this.protector.protect(privateKey.export({ type: 'pkcs8', format: 'pem' })),
      created_at: new Date().toISOString()
    };
    this.writeAtomic(record);
    return { public_key_pem: record.public_key_pem };
  }

  saveRegistration(input = {}) {
    const record = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (!input.node_id || !input.device_credential) fail('AI_NODE_REGISTRATION_INVALID');
    const updated = {
      ...record,
      node_id: input.node_id,
      unit_id: input.unit_id,
      bridge_origin: input.bridge_origin,
      protected_device_credential: this.protector.protect(input.device_credential)
    };
    this.writeAtomic(updated);
  }

  load() {
    const record = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (record.schema_version !== 'deliveryos-ai-node-identity-v1') fail('AI_NODE_IDENTITY_SCHEMA_INVALID');
    return {
      public_key_pem: record.public_key_pem,
      private_key: crypto.createPrivateKey(this.protector.unprotect(record.protected_private_key)),
      node_id: record.node_id || null,
      unit_id: record.unit_id || null,
      bridge_origin: record.bridge_origin || null,
      device_credential: record.protected_device_credential ? this.protector.unprotect(record.protected_device_credential) : null
    };
  }
}

module.exports = { InMemorySecretProtector, DpapiPowerShellProtector, NodeIdentityStore };
