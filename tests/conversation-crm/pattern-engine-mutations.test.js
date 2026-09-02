'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runPatternMutationCertification } = require('../../apps/deliveryos-ai-node');

test('dezesseis mutações independentes ficam vermelhas', () => {
  const report = runPatternMutationCertification();
  assert.equal(report.total, 16);
  assert.equal(report.killed, 16);
  assert.deepEqual(report.survived, []);
});

test('mutações cobrem decisão, estado, Writer, privacidade de oráculo e custo', () => {
  const categories = new Set(runPatternMutationCertification().results.map((item) => item.category));
  for (const expected of ['priority', 'correction', 'reference', 'stack_limit', 'writer_question', 'oracle_isolation', 'financial_gate', 'identity']) {
    assert.equal(categories.has(expected), true, expected);
  }
});
