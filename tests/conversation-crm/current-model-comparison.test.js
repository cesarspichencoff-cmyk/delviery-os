'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildHistoricalBaseline,
  buildComparison,
  buildMetrics
} = require('../../tools/conversation-crm/local-ai-bakeoff/build-current-comparison');

const root = path.resolve(__dirname, '../..');
const state = JSON.parse(fs.readFileSync(path.join(root, 'docs/execution/chatbot/STATE.json'), 'utf8'));
const gemma = JSON.parse(fs.readFileSync(path.join(root, 'evals/local-ai/rebakeoff/gemma4-e4b-results.json'), 'utf8'));
const qwen35 = JSON.parse(fs.readFileSync(path.join(root, 'evals/local-ai/rebakeoff/qwen35-4b-results.json'), 'utf8'));

test('baseline Qwen3 4B preserva exatamente os números históricos', () => {
  const result = buildHistoricalBaseline(state);
  assert.equal(result.execution_status, 'preserved_not_reexecuted');
  assert.equal(result.writer.accepted, 250);
  assert.equal(result.writer.fallback, 10);
  assert.equal(result.writer.p50_ms, 3945.53);
  assert.equal(result.writer.p95_ms, 8425.83);
  assert.equal(result.writer.max_ms, 17024.35);
  assert.equal(result.human_winner, undefined);
  assert.equal(result.qualification.human_winner, null);
});

test('comparação não promove Writer quando Director falha', () => {
  const baseline = buildHistoricalBaseline(state);
  const result = buildComparison(state, baseline, gemma, qwen35);
  assert.deepEqual(result.technically_qualified_new_candidates, []);
  assert.equal(result.blind_rounds, 'not_created_no_technical_candidate');
  assert.equal(result.human_winner, null);
  assert.equal(result.candidates.find((item) => item.candidate_id.startsWith('gemma-4-E4B')).technical_status, 'not_qualified');
  assert.equal(result.candidates.find((item) => item.candidate_id.startsWith('Qwen3.5')).technical_status, 'not_qualified');
});

test('Gemma 12B permanece ausente da execução e sem resultado fictício', () => {
  const baseline = buildHistoricalBaseline(state);
  const result = buildComparison(state, baseline, gemma, qwen35);
  const optional = result.candidates.find((item) => item.candidate_id.startsWith('gemma-4-12b'));
  assert.equal(optional.executed_in_005b, false);
  assert.equal(optional.technical_status, 'not_executed_doctor_gate');
  assert.equal(fs.existsSync(path.join(root, 'evals/local-ai/rebakeoff/gemma4-12b-results.json')), false);
});

test('métricas declaram as três camadas e quinze controles negativos', () => {
  const baseline = buildHistoricalBaseline(state);
  const comparison = buildComparison(state, baseline, gemma, qwen35);
  const result = buildMetrics(comparison, gemma, qwen35);
  assert.equal(result.structured_output.generation, 'fixed_gbnf');
  assert.equal(result.structured_output.rejected_negative_controls, 15);
  assert.equal(result.new_candidate_count, 0);
  assert.equal(result.human_winner, null);
});
