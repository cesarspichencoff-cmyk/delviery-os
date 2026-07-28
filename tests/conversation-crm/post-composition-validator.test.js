'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildResponsePlan,
  validatePostComposition,
  composeHumanizedResponse,
  NativeConversationRuntime
} = require('../../src/conversation-crm/native');

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
    information_source: { classification: 'confirmed' },
    ...overrides
  };
}

function planFor(overrides = {}) {
  const selected = classification(overrides.classification);
  return buildResponsePlan({
    classification: selected,
    result: overrides.result || { status: 'unknown' },
    authorized_text: overrides.authorized_text || 'O valor confirmado é R$ 70. Veja https://example.invalid/ok',
    conversation: {
      conversation_id: 'SIM-CONV-VALIDATOR',
      turn_order: 1,
      source_text: overrides.source_text || 'Qual é o valor?',
      previous_responses: [],
      asked_fields: []
    }
  });
}

test('validador independente aceita somente número e link autorizados no plano', () => {
  const plan = planFor();
  const valid = validatePostComposition({ text: 'O valor confirmado é R$ 70. Veja https://example.invalid/ok', plan });
  const invalid = validatePostComposition({ text: 'O valor é R$ 999. Veja https://unsafe.example/x', plan });
  assert.equal(valid.passed, true);
  assert.deepEqual(new Set(invalid.finding_codes), new Set(['UNAPPROVED_LINK', 'UNAPPROVED_NUMBER']));
});

test('validador rejeita promessa, compensação, culpa, medicina, técnica e oráculo', () => {
  const plan = planFor({
    classification: {
      intent: 'occurrence.health_symptom',
      subintent: 'health_symptom',
      severity: 'critical',
      escalation: 'E4',
      policies: { food_safety: { escalations: ['E3', 'E4'] } },
      information_source: null
    },
    authorized_text: 'O caso permanece aberto.'
  });
  const text = 'Sua reserva está confirmada. O reembolso foi liberado. A culpa é nossa. O diagnóstico é alergia. capability_id: x. TATA-SC-999.';
  const result = validatePostComposition({ text, plan });
  assert.equal(result.passed, false);
  for (const code of ['AUTOMATIC_COMPENSATION', 'LIABILITY_ADMISSION', 'MEDICAL_OR_CAUSALITY_CLAIM', 'TECHNICAL_INFORMATION_EXPOSED', 'ORACLE_INFORMATION_EXPOSED', 'UNVERIFIED_ACTION_CONFIRMATION']) {
    assert.equal(result.finding_codes.includes(code), true, code);
  }
});

test('validador rejeita emoji em segurança alimentar e pergunta repetida', () => {
  const plan = planFor({
    classification: {
      intent: 'occurrence.health_symptom',
      subintent: 'health_symptom',
      severity: 'critical',
      escalation: 'E4',
      fields_missing: ['symptoms'],
      policies: { food_safety: { escalations: ['E3', 'E4'] } },
      information_source: null
    },
    authorized_text: 'O caso permanece aberto.'
  });
  const text = 'Sinto muito 😊 Quais sintomas apareceram?';
  const result = validatePostComposition({ text, plan, previous_responses: ['Quais sintomas apareceram?'] });
  assert.equal(result.finding_codes.includes('SENSITIVE_EMOJI'), true);
  assert.equal(result.finding_codes.includes('REPEATED_QUESTION'), true);
});

test('composição rejeitada usa fallback seguro e preserva códigos sanitizados', () => {
  const selected = classification({
    intent: 'occurrence.missing_item',
    subintent: 'missing_item',
    severity: 'sensitive',
    escalation: 'E2',
    fields_missing: ['order_reference'],
    entities: { item_name: { value: 'bebida', state: 'provided', provenance: 'message' } },
    information_source: null
  });
  const response = composeHumanizedResponse({
    classification: selected,
    result: { status: 'unknown' },
    handoff: { status: 'confirmed' },
    seed: 'TATA-SIM-V1',
    conversation: {
      conversation_id: 'SIM-CONV-FALLBACK',
      turn_order: 1,
      source_text: 'Faltou a bebida.',
      previous_responses: [],
      asked_fields: [],
      known_facts: []
    }
  });
  assert.equal(response.humanized, true);
  assert.equal(response.validation.passed, true);
  assert.match(response.text, /bebida/iu);
});

function runtimeInput(runtime, turn, content) {
  return {
    synthetic: true,
    message_type: 'text',
    content,
    channel: 'synthetic',
    subject_id: 'SIM-SUBJECT-HUMANIZED',
    conversation_id: 'SIM-CONV-HUMANIZED',
    message_id: `SIM-MSG-HUMANIZED-${turn}`,
    correlation_id: `SIM-CORR-HUMANIZED-${turn}`,
    idempotency_key: `humanized:${turn}`,
    occurred_at: runtime.clock.iso(),
    turn_order: turn,
    unit_id: 'SIM-UNIT-001',
    context: { synthetic: true }
  };
}

test('runtime integra plano, validação e continuidade sem alterar Engine', (t) => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-humanized-runtime-'));
  t.after(() => fs.rmSync(runtimeRoot, { recursive: true, force: true }));
  const runtime = new NativeConversationRuntime({ runtimeRoot });
  const first = runtime.processMessage(runtimeInput(runtime, 1, 'Quero reservar para hoje.'));
  const second = runtime.processMessage(runtimeInput(runtime, 2, 'Quatro.'));
  assert.equal(first.response.humanized, true);
  assert.equal(second.response.plan.conversation_stage, 'continuation');
  assert.match(second.response.text, /4 pessoas/iu);
  assert.doesNotMatch(second.response.text, /^(?:olá|oi|bom dia)/iu);
  assert.equal(second.response.validation.passed, true);
});

test('replay recompõe a mesma resposta e não duplica efeito', (t) => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-humanized-replay-'));
  t.after(() => fs.rmSync(runtimeRoot, { recursive: true, force: true }));
  let runtime = new NativeConversationRuntime({ runtimeRoot });
  const input = runtimeInput(runtime, 1, 'Faltou meu refrigerante no pedido.');
  const first = runtime.processMessage(input);
  runtime = new NativeConversationRuntime({ runtimeRoot });
  const replayed = runtime.processMessage(input);
  assert.equal(replayed.response.text, first.response.text);
  assert.equal(replayed.response.variation_key, first.response.variation_key);
  assert.equal(replayed.duplicate, true);
  assert.equal(runtime.store.eventsOfType('runtime.response_registered').length, 1);
});
