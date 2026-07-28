'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildResponsePlan, validateResponsePlan, STRATEGIES, validateStrategyCatalog, validateVoiceProfile } = require('../../src/conversation-crm/native');

function classification(overrides = {}) {
  return {
    intent: 'information.address',
    subintent: 'address',
    severity: 'low',
    fields_missing: [],
    entities: {},
    action: 'read_information',
    escalation: 'E0',
    prohibited_responses: [],
    policies: { food_safety: null },
    closure: { expected_state: 'open' },
    ...overrides
  };
}

test('Response Plan v2 contém o contrato mínimo versionado', () => {
  const plan = buildResponsePlan({
    classification: classification(),
    result: { status: 'unknown' },
    authorized_text: 'O endereço confirmado é sintético.',
    conversation: { conversation_id: 'SIM-CONV-PLAN-001', turn_order: 1, source_text: 'Qual é o endereço?' }
  });
  assert.equal(plan.version, '2.0.0');
  assert.equal(plan.response_goal, 'inform');
  assert.equal(plan.conversation_stage, 'opening');
  assert.equal(plan.tone_profile, 'tata_warm');
  assert.equal(plan.strategy_id, 'information_direct');
  assert.equal(plan.customer_need, 'localizar o restaurante');
  assert.equal(plan.action_playbook, 'restaurant_information');
  assert.equal(Array.isArray(plan.knowledge_candidates), true);
  assert.equal(Array.isArray(plan.knowledge_selected), true);
  assert.equal(Array.isArray(plan.knowledge_sources_used), true);
  assert.deepEqual(plan.verified_actions, []);
  assert.deepEqual(plan.pending_actions, ['read_information']);
  assert.equal(validateResponsePlan(plan), plan);
});

test('plano separa ação confirmada de ação pendente', () => {
  const plan = buildResponsePlan({
    classification: classification({ action: 'read_information', closure: { expected_state: 'resolved' } }),
    result: { status: 'confirmed' },
    authorized_text: 'Informação confirmada.',
    conversation: { turn_order: 1, source_text: 'Pode consultar?' }
  });
  assert.deepEqual(plan.verified_actions, ['read_information']);
  assert.deepEqual(plan.pending_actions, []);
  assert.equal(plan.conversation_stage, 'resolution');
});

test('perguntas já feitas não reaparecem no plano', () => {
  const plan = buildResponsePlan({
    classification: classification({ intent: 'reservation.create', subintent: 'reservation', fields_missing: ['date', 'time', 'party_size'] }),
    result: { status: 'unknown' },
    authorized_text: 'A confirmação depende do retorno do sistema.',
    conversation: { turn_order: 2, source_text: 'Quatro.', asked_fields: ['party_size'] }
  });
  assert.deepEqual(plan.mandatory_questions, ['date']);
  assert.deepEqual(plan.deferred_questions, ['time']);
  assert.equal(plan.conversation_stage, 'continuation');
});

test('conflito recebe fallback específico e nunca escolhe candidato', () => {
  const plan = buildResponsePlan({
    classification: classification({
      intent: 'reservation.large_group',
      subintent: 'large_group',
      entities: { party_size: { state: 'conflict', candidates: [9, 12] } }
    }),
    result: { status: 'conflict' },
    authorized_text: 'Recebi informações diferentes.',
    conversation: { turn_order: 1, source_text: 'Somos nove, na verdade doze.' }
  });
  assert.equal(plan.fallback_reason, 'context_conflict');
  assert.equal(plan.new_facts.length, 0);
});

test('segurança alimentar força gravidade crítica e zero emoji', () => {
  const plan = buildResponsePlan({
    classification: classification({
      intent: 'occurrence.health_symptom',
      subintent: 'health_symptom',
      severity: 'critical',
      escalation: 'E4',
      policies: { food_safety: { escalations: ['E3', 'E4'] } }
    }),
    result: { status: 'unknown' },
    authorized_text: 'O caso permanece aberto.',
    conversation: { turn_order: 1, source_text: 'Estou com dificuldade para respirar.' }
  });
  assert.equal(plan.strategy_id, 'food_safety');
  assert.equal(plan.gravity, 'critical');
  assert.equal(plan.customer_state, 'sensitive');
  assert.equal(plan.emoji_policy, 'none');
});

test('catálogo contém estratégias estruturais e perfil tata_warm válido', () => {
  validateStrategyCatalog();
  validateVoiceProfile();
  assert.equal(Object.keys(STRATEGIES).length >= 30, true);
  for (const item of Object.values(STRATEGIES)) {
    assert.equal(Array.isArray(item.mandatory_components), true);
    assert.equal(Object.hasOwn(item, 'fallback_conditions'), true);
  }
});

test('schema inválido falha fechado', () => {
  assert.throws(() => validateResponsePlan({
    version: '2.0.0',
    response_goal: 'invent',
    conversation_stage: 'opening'
  }), { code: 'RESPONSE_PLAN_INVALID' });
});
