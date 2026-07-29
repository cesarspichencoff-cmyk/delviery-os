'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { percentile, summarizeWriter, confinedOutput } = require('../../tools/conversation-crm/local-ai-bakeoff/consolidate-current-result');

test('percentis do resultado usam teto e ordem numérica', () => {
  assert.equal(percentile([30, 10, 20, 40], 0.5), 20);
  assert.equal(percentile([30, 10, 20, 40], 0.95), 40);
});

test('resumo separa aceitos, fallback, latência e categoria', () => {
  const summary = summarizeWriter([
    { category: 'greetings', status: 'accepted', latency_ms: 10 },
    { category: 'greetings', status: 'fallback', latency_ms: 30 },
    { category: 'continuations', status: 'accepted', latency_ms: 20 }
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.accepted, 2);
  assert.equal(summary.fallback, 1);
  assert.equal(summary.p50_ms, 20);
  assert.equal(summary.categories.greetings.fallback, 1);
});

test('resultado só pode ser materializado na área experimental', () => {
  const allowed = path.resolve(__dirname, '../../evals/local-ai/rebakeoff/synthetic-results.json');
  assert.equal(confinedOutput(allowed), allowed);
  assert.throws(() => confinedOutput(path.resolve(__dirname, '../../outside-results.json')), { code: 'CURRENT_RESULT_OUTPUT_INVALID' });
});
