'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SERVICE_KNOWLEDGE,
  buildResponsePlan,
  searchServiceKnowledge,
  validateServiceKnowledge
} = require('../../src/conversation-crm/native');

function classification(overrides = {}) {
  return {
    intent: 'conversation.ambiguous',
    subintent: 'ambiguous',
    severity: 'low',
    fields_missing: [],
    entities: {},
    action: null,
    escalation: 'E0',
    prohibited_responses: [],
    policies: { food_safety: null },
    closure: { expected_state: 'open' },
    ...overrides
  };
}

test('banco de atendimento é versionado, rastreável e sem entrada órfã', () => {
  validateServiceKnowledge();
  assert.equal(SERVICE_KNOWLEDGE.length >= 20, true);
  assert.equal(SERVICE_KNOWLEDGE.every((entry) => entry.sources.length > 0), true);
});

test('busca ampla encontra fatos relacionados mesmo com intenção ambígua', () => {
  const result = searchServiceKnowledge({
    classification: classification(),
    conversation: { source_text: 'Aceita vale-refeição?' }
  });
  assert.equal(result.selected.some((item) => item.knowledge_id === 'payment.meal_voucher'), true);
  assert.match(result.direct_answer.join(' '), /Ticket Restaurante.*Alelo.*Pluxee/u);
  assert.equal(result.knowledge_sources_used.includes('TATA_OPERATIONAL_PUBLIC_INFO_V1'), true);
});

test('busca não para no primeiro fato e combina experiência e cardápio', () => {
  const result = searchServiceKnowledge({
    classification: classification({ intent: 'information.menu' }),
    conversation: { source_text: 'Vocês têm rodízio? Quero entender as experiências.' },
    authorized_text: 'O TATÁ trabalha à la carte.'
  });
  assert.equal(result.selected.some((item) => item.knowledge_id === 'engine.authorized_surface'), true);
  assert.equal(result.selected.some((item) => item.knowledge_id === 'restaurant.experiences'), true);
  assert.equal(result.direct_answer.length >= 2, true);
});

test('procedimento iFood só é selecionado quando o canal é iFood', () => {
  const base = classification({ intent: 'occurrence.missing_item', severity: 'sensitive' });
  const own = searchServiceKnowledge({ classification: base, conversation: { source_text: 'Faltou a bebida no delivery próprio.' } });
  assert.equal(own.selected.some((item) => item.knowledge_id === 'ifood.problem_path'), false);
  const ifood = searchServiceKnowledge({
    classification: { ...base, entities: { order_channel: { value: 'ifood', state: 'provided' } } },
    conversation: { source_text: 'Faltou a bebida no iFood.' }
  });
  assert.equal(ifood.selected.some((item) => item.knowledge_id === 'ifood.problem_path'), true);
});

test('orientação urgente só aparece com sinal grave', () => {
  const mild = searchServiceKnowledge({
    classification: classification({ intent: 'occurrence.health_symptom', severity: 'critical' }),
    conversation: { source_text: 'Tive náusea depois de comer.' }
  });
  assert.equal(mild.selected.some((item) => item.knowledge_id === 'food_safety.emergency'), false);
  const urgent = searchServiceKnowledge({
    classification: classification({ intent: 'occurrence.health_symptom', severity: 'critical' }),
    conversation: { source_text: 'Estou com dificuldade para respirar.' }
  });
  assert.equal(urgent.selected.some((item) => item.knowledge_id === 'food_safety.emergency'), true);
});

test('plano registra candidatos, seleção, fontes, rejeições e modo de ação', () => {
  const plan = buildResponsePlan({
    classification: classification({ intent: 'occurrence.missing_item', severity: 'sensitive', action: 'record_occurrence' }),
    result: { status: 'unknown' },
    conversation: { source_text: 'Faltou meu refrigerante no pedido.', turn_order: 1 },
    authorized_text: 'Vou registrar somente o que está confirmado.'
  });
  assert.equal(plan.version, '2.0.0');
  assert.equal(plan.knowledge_rejected.includes('engine.authorized_surface'), true);
  assert.equal(plan.rejection_reason['engine.authorized_surface'], 'generic_or_unconfirmed_surface');
  assert.equal(plan.action_mode, 'orientation');
  assert.equal(plan.action_available, false);
  assert.equal(plan.action_selected, null);
  assert.equal(plan.direct_answer.length, 0);
  assert.equal(plan.optional_enrichment.includes('occurrence.specific_direction'), true);
});
