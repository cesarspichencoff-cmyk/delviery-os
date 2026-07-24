'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ConversationEngine } = require('../../src/conversation-crm/engine');
const cases = require('../../src/conversation-crm/simulator/cases');
const { deterministicOptions, syntheticPhone, syntheticEmail } = require('./helpers');

function engine() {
  return new ConversationEngine(deterministicOptions());
}

test('fluxo simples identifica reserva', () => {
  const result = engine().triage({ message: 'Quero reservar.', context: { data_mode: 'synthetic', reservation_date: 'SIM-DATE', reservation_time: 'SIM-SLOT', party_size: 2 } });
  assert.equal(result.block_id, 'R01');
  assert.equal(result.human_required, false);
});

test('fluxo operacional cria ocorrência', () => {
  const result = engine().triage({ message: 'Faltou um item.', context: { data_mode: 'synthetic', origin: 'own_delivery', order_reference: 'SIM-ORDER', occurrence_detail_code: 'missing_item' } });
  assert.equal(result.block_id, 'O02');
  assert.equal(result.crm_record.entity_type, 'CustomerOccurrence');
});

test('caso grave sempre escala e permanece aberto', () => {
  const result = engine().triage({ message: 'Há risco de saúde.', context: { data_mode: 'synthetic', intent: 'serious_quality', severity: 'high', occurrence_type: 'health_risk', occurrence_detail_code: 'synthetic_signal' } });
  assert.equal(result.block_id, 'O03');
  assert.equal(result.human_required, true);
  assert.equal(result.crm_record.status, 'waiting_human');
  assert.ok(result.forbidden_actions.includes('close_automatically'));
});

test('promessa anterior exige histórico e humano', () => {
  const result = engine().triage({ message: 'Existe promessa anterior.', context: { data_mode: 'synthetic', intent: 'prior_promise', prior_promise_reference: 'SIM-PROMISE' } });
  assert.equal(result.block_id, 'O08');
  assert.equal(result.human_required, true);
  assert.ok(result.tags.includes('history_required'));
});

test('dado faltante fica explícito', () => {
  const result = engine().triage({ message: 'Quero reservar.', context: { data_mode: 'synthetic', intent: 'reservation' } });
  assert.deepEqual(result.missing_fields, ['reservation_date', 'reservation_time', 'party_size']);
  assert.ok(result.tags.includes('missing_required_data'));
});

test('mensagem ambígua não inventa intenção', () => {
  const result = engine().triage({ message: 'Preciso de ajuda.', context: { data_mode: 'synthetic' } });
  assert.equal(result.intent, 'ambiguous');
  assert.equal(result.block_id, 'B01');
  assert.equal(result.crm_record, null);
});

test('opt-out cria consentimento e não escala', () => {
  const result = engine().triage({ message: 'Não quero receber comunicações.', context: { data_mode: 'synthetic', intent: 'opt_out' } });
  assert.equal(result.consent_record.status, 'opt_out');
  assert.equal(result.human_required, false);
});

test('motor não oferece solução financeira automática', () => {
  const result = engine().triage({ message: 'Houve cobrança incorreta.', context: { data_mode: 'synthetic', intent: 'charge_occurrence', origin: 'dining_room', occurrence_type: 'charge_issue', occurrence_detail_code: 'amount_disputed' } });
  assert.equal(result.audit.automatic_financial_decision, false);
  assert.ok(result.forbidden_actions.includes('financial_decision'));
});

test('motor não acessa sistema externo', () => {
  const result = engine().triage({ message: 'Quero acompanhar no marketplace.', context: { data_mode: 'synthetic', intent: 'tracking', origin: 'marketplace', order_reference: 'SIM-ORDER' } });
  assert.equal(result.audit.external_system_accessed, false);
  assert.ok(result.forbidden_actions.includes('access_external_order'));
});

test('mensagem e marcadores sensíveis não aparecem no resultado ou CRM', () => {
  const phone = syntheticPhone(99);
  const email = syntheticEmail(99);
  const marker = `SENSITIVE_MARKER_UNIQUE ${phone} ${email}`;
  const current = engine();
  const result = current.triage({ message: `Quero ajuda. ${marker}`, context: { data_mode: 'synthetic', intent: 'human_request', severity: 'medium' } });
  const serialized = JSON.stringify({ result, snapshot: current.crm.snapshot('tenant_synthetic', result.profile_id) });
  assert.equal(serialized.includes(marker), false);
  assert.equal(serialized.includes(phone), false);
  assert.equal(serialized.includes(email), false);
  assert.equal(result.privacy.detected, true);
});

test('contexto marcado como real é bloqueado', () => {
  assert.throws(() => engine().triage({ message: 'Teste.', context: { data_mode: 'real' } }), { code: 'REAL_DATA_NOT_ALLOWED' });
});

for (const scenario of cases) {
  test(`caso sintético ${scenario.id} respeita bloco e escalonamento`, () => {
    const result = engine().triage({ message: scenario.message, context: { ...scenario.context, data_mode: 'synthetic' } });
    assert.equal(result.block_id, scenario.expected.block_id);
    assert.equal(result.human_required, scenario.expected.human_required);
    assert.equal(result.audit.raw_message_persisted, false);
  });
}

