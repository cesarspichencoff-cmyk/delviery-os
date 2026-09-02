#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  LlamaCppRuntime,
  ResponseWriter,
  createBakeoffCorpus,
  validateBakeoffCorpus,
  createDiagnosticCorpus,
  validateDiagnosticCorpus,
  runBlindBakeoff
} = require('../../../apps/deliveryos-ai-node');

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function required(name) {
  const value = argument(name);
  if (!value) throw Object.assign(new Error(`BAKEOFF_${name.toUpperCase().replace(/-/gu, '_')}_REQUIRED`), { code: `BAKEOFF_${name.toUpperCase().replace(/-/gu, '_')}_REQUIRED` });
  return value;
}

function outsideProject(target) {
  const project = path.resolve(__dirname, '..', '..', '..');
  const resolved = path.resolve(target);
  if (resolved === project || resolved.startsWith(project + path.sep)) {
    throw Object.assign(new Error('BAKEOFF_OUTPUT_MUST_BE_EXTERNAL'), { code: 'BAKEOFF_OUTPUT_MUST_BE_EXTERNAL' });
  }
  return resolved;
}

class LocalCandidate {
  constructor(options = {}) {
    this.key = options.key;
    this.kind = 'local_model';
    this.model_version = options.model_version;
    this.provider_version = options.provider_version;
    this.modelFile = options.model_file;
    this.contextSize = options.context_size;
    this.gpuLayers = options.gpu_layers;
    this.adapterId = options.adapter_id;
    this.runtime = new LlamaCppRuntime({
      executable: options.executable,
      models_root: options.models_root,
      host: '127.0.0.1',
      port: options.port,
      adapter_id: options.adapter_id
    });
    this.writer = new ResponseWriter({ runtime: this.runtime });
  }

  async start() {
    await this.runtime.start({ model: this.modelFile, context_size: this.contextSize, gpu_layers: this.gpuLayers, adapter_id: this.adapterId });
    await this.runtime.waitUntilReady({ timeout_ms: 120_000 });
  }

  write(input, item = {}) {
    const digest = crypto.createHash('sha256').update(String(this.model_version) + '|' + String(item.case_id || 'case')).digest();
    const seed = digest.readUInt32BE(0) & 0x7fffffff;
    return this.writer.write(input, { seed });
  }
  metrics() { return this.runtime.metrics(); }
  stop() { return this.runtime.shutdown(); }
}

function selectedCorpus(mode, seed) {
  const base = createBakeoffCorpus({ seed });
  const diagnostic = createDiagnosticCorpus();
  if (!validateBakeoffCorpus(base).passed || !validateDiagnosticCorpus(diagnostic).passed) throw Object.assign(new Error('BAKEOFF_CORPUS_INVALID'), { code: 'BAKEOFF_CORPUS_INVALID' });
  if (mode === 'base') return base;
  if (mode === 'diagnostic') return Object.freeze({
    schema_version: 'deliveryos-local-ai-diagnostic-run-v1', seed,
    counts: Object.freeze(Object.fromEntries([...new Set(diagnostic.cases.map((item) => item.category))].map((category) => [category, diagnostic.cases.filter((item) => item.category === category).length]))),
    cases: diagnostic.cases
  });
  if (mode === 'combined') return Object.freeze({
    schema_version: 'deliveryos-local-ai-current-combined-corpus-v1', seed,
    counts: Object.freeze({ ...base.counts, diagnostic: diagnostic.cases.length }),
    cases: Object.freeze([...base.cases, ...diagnostic.cases])
  });
  throw Object.assign(new Error('BAKEOFF_CORPUS_MODE_INVALID'), { code: 'BAKEOFF_CORPUS_MODE_INVALID' });
}

function candidate(prefix, port) {
  const modelFile = required(`${prefix}-model-file`);
  const modelVersion = required(`${prefix}-model-version`);
  const providerVersion = argument(`${prefix}-provider-version`, 'llama.cpp-b10172');
  return new LocalCandidate({
    key: `${prefix}_local_candidate`,
    model_version: modelVersion,
    provider_version: providerVersion,
    model_file: modelFile,
    executable: required('llama-executable'),
    models_root: required('models-root'),
    context_size: argument('context-size') ? Number(argument('context-size')) : undefined,
    gpu_layers: Number(argument(`${prefix}-gpu-layers`, argument('gpu-layers', '0'))),
    port,
    adapter_id: argument(`${prefix}-adapter`, 'default')
  });
}

async function main() {
  const outputRoot = outsideProject(required('output-root'));
  const seed = argument('seed', 'TATA-LOCAL-AI-BAKEOFF-V1');
  const corpusMode = argument('corpus', 'base');
  const corpus = selectedCorpus(corpusMode, seed);
  const validation = { passed: true, findings: [], total_cases: corpus.cases.length, corpus_mode: corpusMode };
  const candidates = [candidate('primary', Number(argument('port', '4191')))];
  if (argument('secondary-model-file')) candidates.push(candidate('secondary', Number(argument('secondary-port', '4192'))));
  const bundle = await runBlindBakeoff({
    corpus,
    seed,
    candidates,
    onProgress: ({ candidate_key: key, completed, total }) => {
      if (completed === total || completed % 10 === 0) process.stderr.write(JSON.stringify({ candidate: key, completed, total }) + '\n');
    }
  });
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(outputRoot, 'BLIND_BAKEOFF_PUBLIC.json'), JSON.stringify(bundle.public, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(outputRoot, 'BLIND_BAKEOFF_PRIVATE.json'), JSON.stringify(bundle.private, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(outputRoot, 'CORPUS_SUMMARY.json'), JSON.stringify({
    schema_version: corpus.schema_version,
    seed: corpus.seed,
    counts: corpus.counts,
    total_cases: corpus.cases.length,
    validation,
    public_hash: bundle.public.canonical_hash,
    private_hash: bundle.private.canonical_hash,
    human_winner: null
  }, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({ output_root: outputRoot, total_cases: corpus.cases.length, public_hash: bundle.public.canonical_hash, human_winner: null }) + '\n');
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(JSON.stringify({ error: error.code || 'BAKEOFF_FAILED', findings: error.findings || [] }) + '\n');
    process.exitCode = 1;
  });
}

module.exports = { argument, required, outsideProject, LocalCandidate, selectedCorpus, candidate, main };

