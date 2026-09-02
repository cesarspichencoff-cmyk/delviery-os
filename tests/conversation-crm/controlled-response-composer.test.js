'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildResponsePlan, composeControlledText } = require('../../src/conversation-crm/native');

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

function compose(options = {}) {
  const selected = classification(options.classification);
  const result = options.result || { status: 'unknown' };
  const conversation = {
    conversation_id: options.conversation_id || 'SIM-CONV-COMPOSER-001',
    turn_order: options.turn_order || 1,
    source_text: options.source_text || 'Qual é o endereço?',
    asked_fields: options.asked_fields || [],
    known_facts: options.known_facts || []
  };
  const plan = buildResponsePlan({ classification: selected, result, conversation, authorized_text: options.authorized_text || 'Informação confirmada.' });
  return composeControlledText({ plan, classification: selected, result, conversation, authorized_text: options.authorized_text || 'Informação confirmada.', seed: options.seed || 'TATA-SIM-V1' });
}

test('mesma seed, contexto e turno produzem texto e chave idênticos', () => {
  const info = { intent: 'information.menu', subintent: 'institutional_menu', information_source: { classification: 'confirmed' } };
  const first = compose({ classification: info, source_text: 'Quero conhecer o cardápio.', authorized_text: 'Este é o cardápio confirmado: https://example.invalid/menu' });
  const second = compose({ classification: info, source_text: 'Quero conhecer o cardápio.', authorized_text: 'Este é o cardápio confirmado: https://example.invalid/menu' });
  assert.deepEqual(first, second);
});

test('seed diferente pode variar somente a superfície autorizada', () => {
  const base = { classification: { intent: 'information.menu', subintent: 'institutional_menu', information_source: { classification: 'confirmed' } }, source_text: 'Quero conhecer o cardápio.', authorized_text: 'O cardápio confirmado está disponível.' };
  const first = compose({ ...base, seed: 'TATA-SIM-V1' });
  const second = compose({ ...base, seed: 'TATA-SIM-V2' });
  assert.notEqual(first.variation_key, second.variation_key);
  assert.match(first.text, /cardápio confirmado/u);
  assert.match(second.text, /cardápio confirmado/u);
});

test('feriado sem fato confirmado recebe fallback específico', () => {
  const response = compose({
    classification: { intent: 'information.hours', subintent: 'hours', fields_missing: ['date'] },
    source_text: 'Vocês abrem no feriado?',
    authorized_text: 'Ainda não tenho confirmação suficiente.'
  });
  assert.match(response.text, /horário de feriados ainda não está configurado/iu);
  assert.equal(response.fallback_reason, 'public_fact_unconfirmed');
});

test('item faltante aparece de forma concreta e sem compensação', () => {
  const response = compose({
    classification: {
      intent: 'occurrence.missing_item',
      subintent: 'missing_item',
      severity: 'sensitive',
      escalation: 'E2',
      fields_missing: ['order_reference', 'order_channel'],
      entities: { item_name: { value: 'refrigerante', state: 'provided', provenance: 'message' } }
    },
    source_text: 'Faltou meu refrigerante no pedido.',
    authorized_text: 'O caso permanece aberto.'
  });
  assert.match(response.text, /falta de refrigerante/iu);
  assert.match(response.text, /número do pedido/iu);
  assert.match(response.text, /delivery do TATÁ ou pelo iFood/iu);
  assert.doesNotMatch(response.text, /(?:crédito|reembolso|reposição) (?:confirmad|liberad|enviad)/iu);
});

test('grupo grande preserva quantidade e não confirma fila ou reserva', () => {
  const response = compose({
    classification: {
      intent: 'reservation.large_group',
      subintent: 'large_group',
      severity: 'operational',
      escalation: 'E1',
      fields_missing: ['customer_name', 'arrival_estimate'],
      entities: { party_size: { value: 10, state: 'provided', provenance: 'message' } }
    },
    source_text: 'Estamos em 10 pessoas e chegando.',
    authorized_text: 'Atendimento específico.'
  });
  assert.match(response.text, /10 pessoas/u);
  assert.match(response.text, /nome.*previsão aproximada/iu);
  assert.doesNotMatch(response.text, /(?:fila|reserva) (?:está|foi) confirmada/iu);
});

test('caso sensível não recebe emoji nem causalidade', () => {
  const response = compose({
    classification: {
      intent: 'occurrence.health_symptom',
      subintent: 'health_symptom',
      severity: 'critical',
      escalation: 'E4',
      fields_missing: ['symptoms', 'onset'],
      policies: { food_safety: { escalations: ['E3', 'E4'] } }
    },
    source_text: 'Estou com dificuldade para respirar.',
    authorized_text: 'O caso permanece aberto.'
  });
  assert.doesNotMatch(response.text, /\p{Extended_Pictographic}/u);
  assert.doesNotMatch(response.text, /com certeza|foi causado|diagnóstico/iu);
  assert.match(response.text, /qualidade e da gestão/iu);
});

test('continuação não reinicia com saudação', () => {
  const response = compose({
    classification: {
      intent: 'reservation.create',
      subintent: 'reservation',
      fields_missing: ['time'],
      entities: { party_size: { value: 4, state: 'provided', provenance: 'conversation' } }
    },
    source_text: 'Quatro.',
    turn_order: 2,
    authorized_text: 'A confirmação depende do retorno do sistema.'
  });
  assert.doesNotMatch(response.text, /^(?:olá|oi|bom dia)/iu);
  assert.match(response.text, /qual horário/iu);
});
