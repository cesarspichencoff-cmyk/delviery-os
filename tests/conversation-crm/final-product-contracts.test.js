'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CUSTOMER_TOOL_NAMES,
  MENU_TOOL_NAMES,
  FUTURE_MENU_JOURNEYS,
  ZERO_EXTERNAL_COST_POLICY,
  validateCustomerContext,
  validateMenuContext,
  validateRecommendationContext,
  hasDeclaredAllergy,
  evaluateRecommendationSafety,
  createDeferredProductTools,
  normalizeConversationText,
  resolveConversationPattern,
  validateApprovedResponseEnvelope,
  approvedEnvelopeToWriterInput,
  validateApprovedWriterOutput
} = require('../../apps/deliveryos-ai-node');
const { buildApprovedResponseEnvelope } = require('../../src/conversation-crm/native');

function customer(overrides = {}) {
  return {
    schema_version: 'deliveryos-customer-context-v1', status: 'ready', identity_status: 'unique',
    customer_id: 'SIM-CUSTOMER-001', consent_status: 'granted',
    confirmed_facts: [], inferred_facts: [], declared_restrictions: [], unknowns: [], provenance: ['synthetic_fixture'],
    ...overrides
  };
}

function menu(overrides = {}) {
  return {
    schema_version: 'deliveryos-menu-context-v1', status: 'partial', channel: 'dining_room', unit_id: 'SIM-UNIT-001',
    items: [], unknowns: ['availability', 'allergens', 'cross_contamination'], divergences: [], provenance: ['synthetic_fixture'],
    ...overrides
  };
}

function recommendation(overrides = {}) {
  return {
    schema_version: 'deliveryos-recommendation-context-v1', status: 'partial', objectives: ['menu_discovery'],
    constraints: [], candidate_item_ids: [], unknowns: ['ranking_not_implemented'], ...overrides
  };
}

function patternInput(message, overrides = {}) {
  return {
    current_message: message, normalized_message: normalizeConversationText(message), active_journey: null,
    active_step: null, pending_question: null, collected_facts: {}, suspended_journeys: [], side_questions: [],
    last_assistant_act: '', recent_turns: [], candidate_intents: [], candidate_entities: [], ...overrides
  };
}

function plan(overrides = {}) {
  return {
    direct_answer: ['Informação sintética confirmada.'], explanation_needed: [], direction: [], verified_actions: [],
    mandatory_questions: [], tone_profile: 'tata_warm', gravity: 'informational', known_facts: [], new_facts: [],
    prohibited_claims: ['inventar_confirmacao'], authorized_surface: { links: [], numbers: [] }, length: 'short', ...overrides
  };
}

test('01 contexto de cliente é opcional e ausente não vira fato', () => {
  assert.deepEqual(validateCustomerContext(null), { accepted: true, reason: null, context: null });
});

test('02 contexto de cliente único preserva fatos confirmados separados', () => {
  const checked = validateCustomerContext(customer({ confirmed_facts: [{ field: 'preferred_channel', value: 'simulator', source: 'customer_confirmation' }] }));
  assert.equal(checked.accepted, true);
  assert.equal(checked.context.confirmed_facts[0].field, 'preferred_channel');
});

test('03 identidade não única não pode carregar customer_id escolhido', () => {
  assert.equal(validateCustomerContext(customer({ identity_status: 'ambiguous' })).reason, 'CUSTOMER_IDENTITY_NOT_UNIQUE');
});

test('04 fato confirmado e inferido não é unificado silenciosamente', () => {
  const result = validateCustomerContext(customer({
    confirmed_facts: [{ field: 'preference', value: 'A', source: 'customer_confirmation' }],
    inferred_facts: [{ field: 'preference', value: 'B', source: 'synthetic_history' }]
  }));
  assert.equal(result.reason, 'CUSTOMER_FACT_CERTAINTY_CONFLICT');
});

test('05 alergia declarada recebe prioridade de segurança', () => {
  const context = customer({ declared_restrictions: [{ type: 'allergy', status: 'confirmed', source: 'customer_confirmation' }] });
  assert.equal(hasDeclaredAllergy(context), true);
  assert.equal(evaluateRecommendationSafety({ customer_context: context, menu_context: menu() }).requires_allergen_guidance, true);
});

test('06 contrato reserva exatamente as oito ferramentas de cliente', () => {
  assert.equal(CUSTOMER_TOOL_NAMES.length, 8);
  assert.deepEqual(CUSTOMER_TOOL_NAMES, [...new Set(CUSTOMER_TOOL_NAMES)]);
});

test('07 mocks de cliente falham fechados sem ecoar entrada sensível', async () => {
  const marker = 'SIM-PRIVATE-MARKER-DO-NOT-ECHO';
  const result = await createDeferredProductTools().find_customer_by_phone({ phone: marker });
  assert.equal(result.status, 'unavailable');
  assert.equal(JSON.stringify(result).includes(marker), false);
});

test('08 Menu Context aceita somente item identificado e canal explícito', () => {
  const result = validateMenuContext(menu({ items: [{ item_id: 'SIM-ITEM-001', name: 'Item sintético', channel: 'dining_room', unit_id: 'SIM-UNIT-001' }] }));
  assert.equal(result.accepted, true);
});

test('09 Menu Context bloqueia mistura de canais', () => {
  const result = validateMenuContext(menu({ items: [{ item_id: 'SIM-ITEM-001', name: 'Item sintético', channel: 'ifood' }] }));
  assert.equal(result.reason, 'MENU_CONTEXT_CHANNEL_MIXED');
});

test('10 Menu Context bloqueia mistura de unidades', () => {
  const result = validateMenuContext(menu({ items: [{ item_id: 'SIM-ITEM-001', name: 'Item sintético', unit_id: 'SIM-UNIT-999' }] }));
  assert.equal(result.reason, 'MENU_CONTEXT_UNIT_MIXED');
});

test('11 contrato reserva exatamente as oito ferramentas de cardápio', () => {
  assert.equal(MENU_TOOL_NAMES.length, 8);
  assert.deepEqual(MENU_TOOL_NAMES, [...new Set(MENU_TOOL_NAMES)]);
});

test('12 recomendação não aceita ranking ou score nesta mudança', () => {
  assert.equal(validateRecommendationContext(recommendation({ ranking: ['SIM-ITEM-001'] })).reason, 'RECOMMENDATION_RANKING_NOT_AUTHORIZED');
});

test('13 seis jornadas futuras ficam apenas reservadas', () => {
  assert.deepEqual(FUTURE_MENU_JOURNEYS, ['menu_discovery', 'dish_recommendation', 'drink_pairing', 'dietary_filter', 'allergen_guidance', 'order_composition']);
});

test('14 Pattern Engine aceita contextos opcionais válidos sem os transformar em fatos', () => {
  const result = resolveConversationPattern(patternInput('Oi', { customer_context: customer(), menu_context: menu(), recommendation_context: recommendation() }));
  assert.equal(result.pattern, 'greeting');
  assert.deepEqual(result.facts_added, {});
});

test('15 identidade ambígua força clarificação determinística', () => {
  const ambiguous = customer({ status: 'ambiguous', identity_status: 'ambiguous', customer_id: null });
  const result = resolveConversationPattern(patternInput('Quero meu pedido de sempre.', { customer_context: ambiguous }));
  assert.equal(result.pattern, 'clarification');
  assert.match(result.clarification_question, /qual cadastro/iu);
});

test('16 alergia e cardápio bloqueiam recomendação sem cobertura', () => {
  const allergic = customer({ declared_restrictions: [{ type: 'allergy', status: 'confirmed', source: 'customer_confirmation' }] });
  const result = resolveConversationPattern(patternInput('Qual prato você recomenda?', { customer_context: allergic, menu_context: menu() }));
  assert.equal(result.pattern, 'clarification');
  assert.equal(result.question_to_answer, 'allergen_guidance');
});

test('17 ApprovedResponseEnvelope contém os contextos sem expor valores do cliente', () => {
  const envelope = buildApprovedResponseEnvelope({
    plan: plan(), customer_context: customer({ confirmed_facts: [{ field: 'preferred_channel', value: 'sensitive-value', source: 'confirmation' }] }),
    menu_context: menu(), recommendation_context: recommendation(), cost_policy: ZERO_EXTERNAL_COST_POLICY
  });
  assert.equal(validateApprovedResponseEnvelope(envelope).accepted, true);
  assert.deepEqual(envelope.customer_context_summary.confirmed_fields, ['preferred_channel']);
  assert.equal(JSON.stringify(envelope).includes('sensitive-value'), false);
  assert.equal(approvedEnvelopeToWriterInput(envelope).authorized_facts.length, 0);
});

test('18 Writer não pode trocar a pergunta aprovada', () => {
  const envelope = buildApprovedResponseEnvelope({ plan: plan({ mandatory_questions: ['order_reference'] }), cost_policy: ZERO_EXTERNAL_COST_POLICY });
  const changed = validateApprovedWriterOutput({ text: 'Entendi. Pode me dizer seu endereço?' }, envelope);
  const preserved = validateApprovedWriterOutput({ text: `Entendi. ${envelope.question_to_ask}` }, envelope);
  assert.equal(changed.reason, 'WRITER_QUESTION_CHANGED');
  assert.equal(preserved.accepted, true);
});
