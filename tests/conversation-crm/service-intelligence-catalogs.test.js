'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ACTION_PLAYBOOKS,
  KNOWLEDGE_COVERAGE,
  actionPlaybookFor,
  coverageForIntent,
  validateActionPlaybooks,
  validateKnowledgeCoverage
} = require('../../src/conversation-crm/native');

test('matriz classifica exatamente as 52 intenções canônicas', () => {
  validateKnowledgeCoverage();
  assert.equal(KNOWLEDGE_COVERAGE.intent_count, 52);
  assert.equal(KNOWLEDGE_COVERAGE.entries.length, 52);
  assert.equal(new Set(KNOWLEDGE_COVERAGE.entries.map((entry) => entry.intent_id)).size, 52);
});

test('cada intenção possui necessidade, resposta, limite, fontes e playbook', () => {
  for (const entry of KNOWLEDGE_COVERAGE.entries) {
    assert.equal(typeof entry.probable_need, 'string', entry.intent_id);
    assert.equal(typeof entry.expected_direct_answer, 'string', entry.intent_id);
    assert.equal(Array.isArray(entry.internal_sources), true, entry.intent_id);
    assert.equal(Array.isArray(entry.external_sources), true, entry.intent_id);
    assert.equal(actionPlaybookFor(entry.action_playbook).id, entry.action_playbook);
  }
});

test('playbooks possuem contrato versionado completo', () => {
  validateActionPlaybooks();
  assert.equal(Object.keys(ACTION_PLAYBOOKS).length >= 16, true);
  for (const item of Object.values(ACTION_PLAYBOOKS)) {
    assert.equal(item.version, '1.0.0');
    assert.equal(Array.isArray(item.direct_answer), true);
    assert.equal(Array.isArray(item.possible_actions), true);
    assert.equal(Array.isArray(item.prohibited_claims), true);
    assert.equal(Array.isArray(item.sources), true);
  }
});

test('iFood, segurança e Oke têm fontes e limites específicos', () => {
  const ifood = actionPlaybookFor('ifood');
  assert.equal(ifood.sources.some((source) => source.startsWith('ifood:')), true);
  assert.equal(ifood.prohibited_claims.includes('prometer_reembolso'), true);
  const safety = actionPlaybookFor('food_safety');
  assert.equal(safety.sources.some((source) => source.startsWith('ministerio-saude:')), true);
  assert.equal(safety.prohibited_claims.includes('diagnosticar'), true);
  const oke = coverageForIntent('event.oke_pickup');
  assert.equal(oke.action_playbook, 'events_oke');
  assert.match(oke.legitimate_fallback, /preço|quantidade|disponibilidade/u);
});

test('todas as ausências reais permanecem fallback explícito ou limite', () => {
  const examples = [
    'information.hours',
    'information.allergen',
    'reservation.create',
    'waitlist.read',
    'order.status',
    'conversation.ambiguous'
  ];
  for (const intent of examples) {
    const entry = coverageForIntent(intent);
    assert.equal(Boolean(entry.legitimate_fallback || entry.limit), true, intent);
  }
});
