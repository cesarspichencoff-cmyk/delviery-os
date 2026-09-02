#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { canonicalHash } = require('../../../apps/deliveryos-ai-node');

function withHash(value) {
  return { ...value, canonical_hash: canonicalHash(value) };
}

function buildHistoricalBaseline(state) {
  const baseline = state.bakeoff.qwen3_4b;
  return withHash({
    schema_version: 'deliveryos-historical-model-result-v1',
    source_change: '005-portable-local-ai-node',
    execution_status: 'preserved_not_reexecuted',
    candidate: {
      candidate_id: 'Qwen3-4B-Q4_K_M-official',
      organization: 'Qwen',
      model_revision: 'bc640142c66e1fdd12af0bd68f40445458f3869b',
      quantization: 'Q4_K_M',
      model_sha256: '7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5',
      model_size_bytes: 2497280256,
      license: 'Apache-2.0',
      runtime: 'llama.cpp-b10172'
    },
    corpus: {
      total_cases: state.bakeoff.total_cases,
      public_hash: state.bakeoff.public_hash,
      private_hash: state.bakeoff.private_hash
    },
    writer: {
      accepted: baseline.accepted,
      fallback: baseline.fallback,
      p50_ms: baseline.p50_ms,
      p95_ms: baseline.p95_ms,
      max_ms: baseline.max_ms
    },
    director: { status: 'not_reexecuted_in_005b' },
    qualification: {
      status: 'historical_baseline_only',
      human_winner: null
    }
  });
}

function row(id, value, extra = {}) {
  return {
    candidate_id: id,
    executed_in_005b: extra.executed_in_005b ?? true,
    writer_accepted: value.writer?.accepted ?? null,
    writer_fallback: value.writer?.fallback ?? null,
    writer_p50_ms: value.writer?.p50_ms ?? null,
    writer_p95_ms: value.writer?.p95_ms ?? null,
    writer_max_ms: value.writer?.max_ms ?? null,
    writer_qualified: value.writer?.qualified ?? null,
    director_expected: value.director?.expected ?? null,
    director_total: value.director?.total ?? null,
    director_fallback: value.director?.fallback ?? null,
    director_p50_ms: value.director?.p50_ms ?? null,
    director_p95_ms: value.director?.p95_ms ?? null,
    director_max_ms: value.director?.max_ms ?? null,
    director_qualified: value.director?.qualified ?? null,
    technical_status: value.qualification?.status || extra.technical_status,
    human_winner: null,
    ...extra
  };
}

function buildComparison(state, qwen3, gemma, qwen35) {
  const candidates = [
    row('Qwen3-4B-Q4_K_M-official', qwen3, { executed_in_005b: false, technical_status: 'historical_baseline_only' }),
    row('gemma-4-E4B-it-qat-q4_0-official', gemma),
    row('Qwen3.5-4B-Q4_K_M-bartowski', qwen35),
    {
      candidate_id: 'gemma-4-12b-it-qat-q4_0-official',
      executed_in_005b: false,
      technical_status: 'not_executed_doctor_gate',
      reason: state.bakeoff.current_005b.gemma4_12b.reason,
      human_winner: null
    }
  ];
  return withHash({
    schema_version: 'deliveryos-current-model-technical-comparison-v1',
    change_id: '005b-current-open-model-rebakeoff',
    corpus: { base_cases: 260, diagnostic_cases: 32, total_cases: 292 },
    thresholds: {
      writer: { fallback_less_than: 10, p95_ms_less_than: 12000, max_ms_less_than: 25000 },
      director: { fallback: 0, expected_ratio_minimum: 0.9, p95_ms_maximum: 15000, max_ms_less_than: 25000 }
    },
    candidates,
    technically_qualified_new_candidates: [],
    blind_rounds: 'not_created_no_technical_candidate',
    human_winner: null,
    verdict: 'RE-BAKE-OFF LOCAL SEM CANDIDATO TÉCNICO'
  });
}

function buildMetrics(comparison, gemma, qwen35) {
  return withHash({
    schema_version: 'deliveryos-current-model-metrics-v1',
    corpus: comparison.corpus,
    structured_output: {
      generation: 'fixed_gbnf',
      parsing: 'strict_complete_json_object',
      semantics: 'state_and_allowlist_validation',
      negative_controls: 15,
      rejected_negative_controls: 15
    },
    gemma4_e4b: {
      writer: { accepted: gemma.writer.accepted, fallback: gemma.writer.fallback, p50_ms: gemma.writer.p50_ms, p95_ms: gemma.writer.p95_ms, max_ms: gemma.writer.max_ms },
      director: { expected: gemma.director.expected, total: gemma.director.total, fallback: gemma.director.fallback, p50_ms: gemma.director.p50_ms, p95_ms: gemma.director.p95_ms, max_ms: gemma.director.max_ms },
      technical_status: gemma.qualification.status
    },
    qwen35_4b: {
      writer: { accepted: qwen35.writer.accepted, fallback: qwen35.writer.fallback, p50_ms: qwen35.writer.p50_ms, p95_ms: qwen35.writer.p95_ms, max_ms: qwen35.writer.max_ms },
      director: { expected: qwen35.director.expected, total: qwen35.director.total, fallback: qwen35.director.fallback, p50_ms: qwen35.director.p50_ms, p95_ms: qwen35.director.p95_ms, max_ms: qwen35.director.max_ms },
      technical_status: qwen35.qualification.status
    },
    gemma4_12b: { technical_status: 'not_executed_doctor_gate' },
    new_candidate_count: 0,
    human_winner: null
  });
}

function main() {
  const root = path.resolve(__dirname, '../../../');
  const output = path.join(root, 'evals', 'local-ai', 'rebakeoff');
  const state = JSON.parse(fs.readFileSync(path.join(root, 'docs', 'execution', 'chatbot', 'STATE.json'), 'utf8'));
  const gemma = JSON.parse(fs.readFileSync(path.join(output, 'gemma4-e4b-results.json'), 'utf8'));
  const qwen35 = JSON.parse(fs.readFileSync(path.join(output, 'qwen35-4b-results.json'), 'utf8'));
  const qwen3 = buildHistoricalBaseline(state);
  const comparison = buildComparison(state, qwen3, gemma, qwen35);
  const metrics = buildMetrics(comparison, gemma, qwen35);
  for (const [name, value] of [['qwen3-4b-results.json', qwen3], ['technical-comparison.json', comparison], ['metrics.json', metrics]]) {
    fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', 'utf8');
  }
  process.stdout.write(JSON.stringify({ output, files: ['qwen3-4b-results.json', 'technical-comparison.json', 'metrics.json'], verdict: comparison.verdict }) + '\n');
}

if (require.main === module) main();

module.exports = { withHash, buildHistoricalBaseline, row, buildComparison, buildMetrics, main };

