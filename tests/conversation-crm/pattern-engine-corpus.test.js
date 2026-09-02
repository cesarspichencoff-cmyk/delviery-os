'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPatternCorpus, executePatternCase, executeLongConversation } = require('../../apps/deliveryos-ai-node');

test('corpus sintético possui as quatorze categorias e quantidades aprovadas', () => {
  const corpus = buildPatternCorpus();
  assert.deepEqual(corpus.counts, {
    greetings: 30, greeting_with_task: 30, short_answers: 40, corrections: 40,
    contextual_references: 40, side_questions: 40, suspension_resume: 40,
    repeats: 20, reformulations: 20, topic_changes: 30, cancellations: 20,
    reopenings: 20, two_journeys: 20, long_conversations: 20
  });
  assert.equal(corpus.total_single_turn_cases, 390);
  assert.equal(corpus.total_long_conversations, 20);
});

test('mesma seed gera o mesmo corpus e hash canônico', () => {
  assert.deepEqual(buildPatternCorpus('TATA-PATTERN-ENGINE-V1'), buildPatternCorpus('TATA-PATTERN-ENGINE-V1'));
});

test('390 casos de turno único respeitam a expectativa independente', () => {
  const results = buildPatternCorpus().cases.map(executePatternCase);
  assert.deepEqual(results.filter((item) => !item.passed), []);
});

test('vinte conversas de oito turnos preservam estado e retomada', () => {
  const results = buildPatternCorpus().conversations.map(executeLongConversation);
  assert.deepEqual(results.filter((item) => !item.passed), []);
  assert.ok(results.every((item) => item.decisions.length === 8));
});

test('corpus não contém scenario_id, oráculo nem identificadores reais', () => {
  const serialized = JSON.stringify(buildPatternCorpus());
  assert.doesNotMatch(serialized, /scenario_id|ideal_response|oracle_payload|customer_name|telefone|cpf|@/iu);
  assert.doesNotMatch(serialized, /TATA-SC-/u);
});
