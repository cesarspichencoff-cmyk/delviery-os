'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { LlamaCppRuntime } = require('../../../apps/deliveryos-ai-node/runtime/llama-cpp-runtime');
const { ResponseWriter } = require('../../../apps/deliveryos-ai-node/dialogue/response-writer');

const GEMMA_WRITER_ARTIFACTS = Object.freeze({
  runtime_release: 'b10172',
  runtime_sha256: '9a2c7b98925cc4cea59d9e6de1e4ea3cbb07c26245410d5da653bceef9ee6e62',
  model_id: 'google/gemma-4-E4B-it',
  model_revision: 'ee0ef6023621cff504d758262d4e04895a5af4a2',
  gguf_revision: '4b4a2c1d584be7264f87aac328a1bc739ce81b6c',
  model_filename: 'gemma-4-E4B_q4_0-it.gguf',
  model_size_bytes: 5154941280,
  model_sha256: '676c35070db6dbe52f93e9c864ee0fba4eddea94b9c875d9cb10daff453fbaee'
});

function defaultWriterRoot() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, 'DeliveryOS', 'homologation-writer');
}

function artifactPaths(root = defaultWriterRoot()) {
  const resolved = path.resolve(root);
  return Object.freeze({
    root: resolved,
    executable: path.join(resolved, 'runtime', 'llama-b10172', 'llama-server.exe'),
    models_root: path.join(resolved, 'models'),
    model: GEMMA_WRITER_ARTIFACTS.model_filename,
    model_path: path.join(resolved, 'models', GEMMA_WRITER_ARTIFACTS.model_filename),
    verification_manifest: path.join(resolved, 'artifact-verification.json')
  });
}

function inspectLocalWriterArtifacts(options = {}) {
  const paths = artifactPaths(options.root || process.env.DELIVERYOS_HOMOLOGATION_WRITER_ROOT);
  if (String(process.env.DELIVERYOS_LOCAL_WRITER || 'auto').toLowerCase() === 'off') {
    return Object.freeze({ available: false, status: 'deterministic_fallback', reason: 'LOCAL_WRITER_DISABLED', paths });
  }
  if (!fs.existsSync(paths.executable)) {
    return Object.freeze({ available: false, status: 'deterministic_fallback', reason: 'LLAMA_CPP_EXECUTABLE_MISSING', paths });
  }
  if (!fs.existsSync(paths.model_path)) {
    return Object.freeze({ available: false, status: 'deterministic_fallback', reason: 'GEMMA_GGUF_MISSING', paths });
  }
  const size = fs.statSync(paths.model_path).size;
  if (size !== GEMMA_WRITER_ARTIFACTS.model_size_bytes) {
    return Object.freeze({ available: false, status: 'deterministic_fallback', reason: 'GEMMA_GGUF_SIZE_MISMATCH', paths, size });
  }
  let verification = null;
  try { verification = JSON.parse(fs.readFileSync(paths.verification_manifest, 'utf8')); } catch {}
  if (verification?.runtime_sha256 !== GEMMA_WRITER_ARTIFACTS.runtime_sha256
    || verification?.model_sha256 !== GEMMA_WRITER_ARTIFACTS.model_sha256) {
    return Object.freeze({ available: false, status: 'deterministic_fallback', reason: 'ARTIFACT_HASH_NOT_VERIFIED', paths, size });
  }
  return Object.freeze({
    available: true,
    status: 'gemma_local',
    reason: null,
    paths,
    size,
    model_id: GEMMA_WRITER_ARTIFACTS.model_id,
    model_revision: GEMMA_WRITER_ARTIFACTS.model_revision,
    runtime_release: GEMMA_WRITER_ARTIFACTS.runtime_release
  });
}

function timeoutResult(milliseconds) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({
      accepted: false,
      source: 'rejected',
      reason: 'LOCAL_WRITER_TIMEOUT',
      output: null
    }), milliseconds);
    timer.unref?.();
  });
}

class LocalHomologationWriter {
  constructor(options = {}) {
    this.options = options;
    this.runtime = options.runtime || null;
    this.writer = options.writer || null;
    this.starting = null;
    this.lastReason = null;
  }

  inspect() {
    if (this.options.writer) return Object.freeze({ available: true, status: 'gemma_local', reason: null, injected: true });
    if (this.options.enabled === false) {
      return Object.freeze({ available: false, status: 'deterministic_fallback', reason: 'LOCAL_WRITER_DISABLED_FOR_PROCESS' });
    }
    const inspected = inspectLocalWriterArtifacts(this.options);
    return Object.freeze({ ...inspected, reason: this.lastReason || inspected.reason });
  }

  async ensureReady() {
    if (this.writer) return this.writer;
    const inspected = this.inspect();
    if (!inspected.available) throw Object.assign(new Error(inspected.reason), { code: inspected.reason });
    if (!this.runtime) {
      this.runtime = new LlamaCppRuntime({
        executable: inspected.paths.executable,
        models_root: inspected.paths.models_root,
        adapter_id: 'gemma4',
        host: '127.0.0.1',
        port: Number(this.options.port || process.env.DELIVERYOS_HOMOLOGATION_WRITER_PORT || 4191)
      });
    }
    if (!this.starting) {
      this.starting = (async () => {
        await this.runtime.start({
          model: inspected.paths.model,
          adapter_id: 'gemma4',
          context_size: 8192,
          gpu_layers: 0
        });
        await this.runtime.waitUntilReady({ timeout_ms: Number(this.options.startTimeoutMs || 180000) });
        this.writer = new ResponseWriter({ runtime: this.runtime });
        return this.writer;
      })().catch((error) => {
        this.lastReason = error.code || 'LOCAL_WRITER_START_FAILED';
        this.starting = null;
        throw error;
      });
    }
    return this.starting;
  }

  async writeApproved(envelope) {
    try {
      const writer = await this.ensureReady();
      const generated = await Promise.race([
        writer.writeApproved(envelope, { seed: Number(this.options.seed || 7443) }),
        timeoutResult(Number(this.options.requestTimeoutMs || 45000))
      ]);
      if (!generated.accepted) this.lastReason = generated.reason || 'LOCAL_WRITER_REJECTED';
      return generated;
    } catch (error) {
      const reason = error.code || 'LOCAL_WRITER_UNAVAILABLE';
      this.lastReason = reason;
      return { accepted: false, source: 'rejected', reason, output: null };
    }
  }

  async close() {
    if (this.runtime?.stop) await this.runtime.stop();
  }
}

module.exports = {
  GEMMA_WRITER_ARTIFACTS,
  defaultWriterRoot,
  artifactPaths,
  inspectLocalWriterArtifacts,
  LocalHomologationWriter
};

