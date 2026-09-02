'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function fail(code) { throw Object.assign(new Error(code), { code }); }

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function validateArtifact(artifact) {
  if (!artifact || !/^[a-z0-9._-]+$/iu.test(artifact.id || '')) fail('UPDATE_ARTIFACT_ID_INVALID');
  if (!/^[a-f0-9]{64}$/iu.test(artifact.sha256 || '')) fail('UPDATE_ARTIFACT_HASH_INVALID');
  const url = new URL(artifact.url);
  if (url.protocol !== 'https:' || !['github.com', 'nodejs.org', 'huggingface.co'].includes(url.hostname)) fail('UPDATE_ARTIFACT_ORIGIN_FORBIDDEN');
  if (!Number.isSafeInteger(artifact.size_bytes) || artifact.size_bytes <= 0) fail('UPDATE_ARTIFACT_SIZE_INVALID');
  return artifact;
}

class UpdateManager {
  constructor(options = {}) {
    this.fetch = options.fetch || globalThis.fetch;
    this.root = path.resolve(options.root);
    this.fs = options.fs || fs;
  }

  async download(artifact) {
    validateArtifact(artifact);
    this.fs.mkdirSync(this.root, { recursive: true });
    const temporary = path.join(this.root, `.${artifact.id}.partial`);
    const destination = path.join(this.root, artifact.filename);
    const response = await this.fetch(artifact.url, { redirect: 'error' });
    if (!response.ok) fail('UPDATE_DOWNLOAD_FAILED');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== artifact.size_bytes) fail('UPDATE_SIZE_MISMATCH');
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    if (digest !== artifact.sha256.toLowerCase()) fail('UPDATE_HASH_MISMATCH');
    this.fs.rmSync(temporary, { force: true });
    try {
      this.fs.writeFileSync(temporary, bytes, { flag: 'wx' });
      this.fs.renameSync(temporary, destination);
    } catch (error) {
      try { this.fs.rmSync(temporary, { force: true }); } catch {}
      throw error;
    }
    return destination;
  }
}

module.exports = { sha256File, validateArtifact, UpdateManager };
