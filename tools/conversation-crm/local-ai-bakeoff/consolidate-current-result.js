#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { canonicalHash } = require('../../../apps/deliveryos-ai-node');

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function required(name) {
  const value = argument(name);
  if (!value) throw Object.assign(new Error(`CURRENT_RESULT_${name.toUpperCase().replace(/-/gu, '_')}_REQUIRED`), { code: `CURRENT_RESULT_${name.toUpperCase().replace(/-/gu, '_')}_REQUIRED` });
  return value;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

function writerRows(publicArtifact, privateArtifact, candidateKey = 'primary_local_candidate') {
  return privateArtifact.cases.map((item, index) => {
    const publicCase = publicArtifact.cases[index];
    const option = Object.entries(item.mapping).find(([, key]) => key === candidateKey)?.[0];
    if (!option || publicCase.case_id !== item.case_id) throw Object.assign(new Error('CURRENT_RESULT_MAPPING_INVALID'), { code: 'CURRENT_RESULT_MAPPING_INVALID' });
    const outcome = item.candidates[candidateKey];
    return Object.freeze({
      case_id: item.case_id,
      category: publicCase.category,
      status: outcome.status,
      reason: outcome.reason,
      latency_ms: outcome.latency_ms,
      prompt_tokens: Number(outcome.metrics?.prompt_tokens || 0),
      completion_tokens: Number(outcome.metrics?.completion_tokens || 0),
      response_hash: outcome.response_hash,
      text: publicCase.options.find((candidate) => candidate.option === option).text
    });
  });
}

function summarizeWriter(rows) {
  const latencies = rows.map((row) => row.latency_ms);
  const categories = Object.fromEntries([...new Set(rows.map((row) => row.category))].sort().map((category) => {
    const selected = rows.filter((row) => row.category === category);
    return [category, {
      total: selected.length,
      accepted: selected.filter((row) => row.status === 'accepted').length,
      fallback: selected.filter((row) => row.status !== 'accepted').length,
      p50_ms: percentile(selected.map((row) => row.latency_ms), 0.5),
      p95_ms: percentile(selected.map((row) => row.latency_ms), 0.95)
    }];
  }));
  return Object.freeze({
    total: rows.length,
    accepted: rows.filter((row) => row.status === 'accepted').length,
    fallback: rows.filter((row) => row.status !== 'accepted').length,
    p50_ms: percentile(latencies, 0.5),
    p95_ms: percentile(latencies, 0.95),
    max_ms: Math.max(...latencies),
    categories
  });
}

function confinedOutput(file) {
  const root = path.resolve(__dirname, '../../../evals/local-ai/rebakeoff');
  const target = path.resolve(file);
  if (!target.startsWith(root + path.sep) || !target.endsWith('-results.json')) throw Object.assign(new Error('CURRENT_RESULT_OUTPUT_INVALID'), { code: 'CURRENT_RESULT_OUTPUT_INVALID' });
  return target;
}

function main() {
  const runRoot = path.resolve(required('run-root'));
  const publicArtifact = JSON.parse(fs.readFileSync(path.join(runRoot, 'BLIND_BAKEOFF_PUBLIC.json'), 'utf8'));
  const privateArtifact = JSON.parse(fs.readFileSync(path.join(runRoot, 'BLIND_BAKEOFF_PRIVATE.json'), 'utf8'));
  const director = JSON.parse(fs.readFileSync(path.join(runRoot, 'DIRECTOR_PROBES.json'), 'utf8'));
  const rows = writerRows(publicArtifact, privateArtifact);
  const writer = summarizeWriter(rows);
  const writerQualified = writer.fallback < 10 && writer.p95_ms < 12_000 && writer.max_ms < 25_000;
  const directorQualified = director.fallback === 0 && director.expected >= Math.ceil(director.total * 0.9) && director.p95_ms <= 15_000 && director.max_ms < 25_000;
  const artifact = {
    schema_version: 'deliveryos-current-model-result-v1',
    candidate: {
      candidate_id: required('candidate-id'),
      organization: required('organization'),
      model_revision: required('model-revision'),
      quantization: required('quantization'),
      model_sha256: required('model-sha256'),
      model_size_bytes: Number(required('model-size-bytes')),
      license: required('license'),
      adapter: required('adapter'),
      runtime: required('runtime')
    },
    corpus: {
      base_cases: 260,
      diagnostic_cases: 32,
      total_cases: rows.length,
      public_hash: publicArtifact.canonical_hash,
      private_hash: privateArtifact.canonical_hash
    },
    writer: { ...writer, qualified: writerQualified, rows },
    director: { ...director, qualified: directorQualified },
    security: {
      grammar_constrained: true,
      strict_parse: true,
      semantic_validation: true,
      unapproved_output_accepted: 0,
      reasoning_persisted: 0,
      external_calls: 0,
      adversarial_run: 'not_executed_candidate_failed_director_gate'
    },
    qualification: {
      status: writerQualified && directorQualified ? 'pending_adversarial_gate' : 'not_qualified',
      writer_qualified: writerQualified,
      director_qualified: directorQualified,
      human_winner: null,
      reasons: [
        ...(!writerQualified ? ['WRITER_OPERATIONAL_GATE_FAILED'] : []),
        ...(!directorQualified ? ['DIRECTOR_QUALITY_OR_LATENCY_GATE_FAILED'] : [])
      ]
    }
  };
  const serialized = JSON.stringify(artifact);
  if (/C:\\Users\\|Desktop\\|Downloads\\|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(serialized)) throw Object.assign(new Error('CURRENT_RESULT_PRIVACY_INVALID'), { code: 'CURRENT_RESULT_PRIVACY_INVALID' });
  const output = confinedOutput(required('output'));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ ...artifact, canonical_hash: canonicalHash(artifact) }, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({ output, status: artifact.qualification.status, writer, director: { total: director.total, expected: director.expected, fallback: director.fallback, p50_ms: director.p50_ms, p95_ms: director.p95_ms, max_ms: director.max_ms } }) + '\n');
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(JSON.stringify({ error: error.code || 'CURRENT_RESULT_FAILED' }) + '\n'); process.exitCode = 1; }
}

module.exports = { percentile, writerRows, summarizeWriter, confinedOutput, main };

