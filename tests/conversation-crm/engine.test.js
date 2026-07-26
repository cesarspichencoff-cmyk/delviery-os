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

test('grupo de dez chegando segue o R05 canônico e pede somente dados ausentes', () => {
  const result = engine().triage({
    message: 'Estamos em 10 pessoas e chegando',
    context: {
      data_mode: 'synthetic',
      order_reference: 'SIM-ORDER-MANUAL',
      occurrence_detail_code: 'synthetic_detail'
    }
  });
  assert.equal(result.intent, 'reservation');
  assert.equal(result.intent_label, 'grupo_grande');
  assert.equal(result.origin, 'dining_room');
  assert.equal(result.origin_label, 'salão');
  assert.equal(result.severity, 'medium');
  assert.equal(result.severity_label, 'operacional');
  assert.equal(result.block_id, 'R05');
  assert.equal(result.block_code, 'R05_GRUPO_GRANDE');
  assert.equal(result.escalation_code, 'H01_HUMANO_OPERACIONAL');
  assert.equal(result.human_required, true);
  assert.deepEqual(result.known_fields, ['party_size']);
  assert.deepEqual(result.known_field_labels, ['quantidade de pessoas']);
  assert.deepEqual(result.missing_fields, ['customer_name', 'arrival_estimate']);
  assert.deepEqual(result.missing_field_labels, ['nome', 'previsão aproximada de chegada']);
  assert.deepEqual(result.tags, ['TAG_FILA', 'TAG_SALAO', 'TAG_AGUARDANDO_HUMANO']);
  assert.equal(
    result.suggested_response,
    'Perfeito. Como são 10 pessoas, vou sinalizar sua chegada para o responsável. Pode me informar seu nome e a previsão aproximada de chegada?'
  );
  assert.equal(result.crm_record.status, 'waiting_human');
});

for (const [message, expectedSize] of [
  ['Somos 10', 10],
  ['Estamos em dez', 10],
  ['Mesa para 9', 9],
  ['Grupo de 12', 12],
  ['10 pessoas chegando', 10]
]) {
  test(`extrai grupo grande de: ${message}`, () => {
    const result = engine().triage({ message, context: { data_mode: 'synthetic' } });
    assert.equal(result.block_id, 'R05');
    assert.equal(result.block_code, 'R05_GRUPO_GRANDE');
    assert.equal(result.known_fields.includes('party_size'), true);
    assert.equal(result.suggested_response.includes(`Como são ${expectedSize} pessoas`), true);
  });
}

test('grupo de oito não atravessa o limite canônico do R05', () => {
  const result = engine().triage({ message: 'Somos 8', context: { data_mode: 'synthetic' } });
  assert.equal(result.block_id, 'R01');
  assert.equal(result.human_required, false);
});

test('R05 pergunta somente o nome quando a previsão já é conhecida', () => {
  const result = engine().triage({
    message: 'Grupo de 11 chegando',
    context: { data_mode: 'synthetic', arrival_estimate: 'SYNTHETIC_ARRIVAL_WINDOW' }
  });
  assert.deepEqual(result.missing_fields, ['customer_name']);
  assert.equal(result.suggested_response.endsWith('Pode me informar seu nome?'), true);
});

test('R05 não repete pergunta quando todos os dados necessários estão conhecidos', () => {
  const result = engine().triage({
    message: 'Somos doze',
    context: {
      data_mode: 'synthetic',
      customer_name: 'SYNTHETIC_NAME_PRESENT',
      arrival_estimate: 'SYNTHETIC_ARRIVAL_WINDOW'
    }
  });
  assert.deepEqual(result.missing_fields, []);
  assert.equal(result.suggested_response, 'Perfeito. Como são 12 pessoas, vou sinalizar sua chegada para o responsável.');
});

test('refrigerante faltando prevalece sobre palavra genérica pedido', () => {
  const result = engine().triage({ message: 'Faltou meu refrigerante no pedido', context: { data_mode: 'synthetic' } });
  assert.equal(result.intent, 'wrong_or_missing_item');
  assert.equal(result.intent_label, 'reclamação / item_faltando');
  assert.equal(result.block_id, 'O02');
  assert.equal(result.block_code, 'O02_ITEM_ERRADO_OU_FALTANDO');
  assert.equal(result.severity_label, 'sensível');
  assert.equal(result.origin, 'unknown');
  assert.equal(result.human_required, true);
  assert.equal(result.escalation_code, 'H02_HUMANO_COMERCIAL_OPERACIONAL');
  assert.equal(result.item_identified, 'refrigerante');
  assert.deepEqual(result.known_field_labels, ['item identificado: refrigerante']);
  assert.deepEqual(result.missing_field_labels, ['numero_pedido', 'canal_pedido']);
  assert.deepEqual(result.tags, ['TAG_ITEM_FALTANDO', 'TAG_AGUARDANDO_HUMANO']);
  assert.equal(result.crm_record.entity_type, 'CustomerOccurrence');
  assert.equal(result.crm_record.status, 'waiting_human');
  assert.deepEqual(result.forbidden_actions, ['offer_credit', 'promise_replacement', 'offer_courtesy', 'offer_refund', 'financial_decision']);
  assert.equal(
    result.suggested_response,
    'Peço desculpas pelo ocorrido. Pode me informar o número do pedido e se ele foi feito pelo nosso delivery ou pelo iFood? Vou registrar a falta do refrigerante e direcionar a situação corretamente.'
  );
});

for (const [message, expectedItem] of [
  ['Não veio a bebida', 'bebida'],
  ['Esqueceram o shoyu', 'shoyu'],
  ['Veio sem acompanhamento', 'acompanhamento'],
  ['Veio sem sobremesa', 'sobremesa'],
  ['Ficou faltando uma peça', 'peça'],
  ['Não mandaram o item', null]
]) {
  test(`item faltando reconhecido em: ${message}`, () => {
    const result = engine().triage({ message, context: { data_mode: 'synthetic' } });
    assert.equal(result.intent, 'wrong_or_missing_item');
    assert.equal(result.block_code, 'O02_ITEM_ERRADO_OU_FALTANDO');
    assert.equal(result.escalation_code, 'H02_HUMANO_COMERCIAL_OPERACIONAL');
    assert.equal(result.human_required, true);
    assert.equal(result.item_identified, expectedItem);
    assert.equal(result.crm_record.status, 'waiting_human');
  });
}

test('canal e número conhecidos não são solicitados novamente em item faltando', () => {
  const result = engine().triage({
    message: 'Não veio a bebida',
    context: { data_mode: 'synthetic', origin: 'marketplace', order_reference: 'SIM-ORDER-KNOWN' }
  });
  assert.equal(result.origin, 'marketplace');
  assert.deepEqual(result.missing_fields, []);
  assert.equal(
    result.suggested_response,
    'Peço desculpas pelo ocorrido. Vou registrar a falta da bebida e direcionar a situação corretamente.'
  );
});

test('item errado continua distinto da variante item faltando', () => {
  const result = engine().triage({
    message: 'Veio um item errado.',
    context: { data_mode: 'synthetic', origin: 'own_delivery', order_reference: 'SIM-ORDER-WRONG', occurrence_detail_code: 'wrong_item' }
  });
  assert.equal(result.block_id, 'O02');
  assert.equal(result.item_identified, null);
  assert.equal(result.escalation_code, 'H01');
  assert.ok(result.tags.includes('item_issue'));
  assert.equal(result.tags.includes('TAG_ITEM_FALTANDO'), false);
});

for (const scenario of cases) {
  test(`caso sintético ${scenario.id} respeita bloco e escalonamento`, () => {
    const result = engine().triage({ message: scenario.message, context: { ...scenario.context, data_mode: 'synthetic' } });
    assert.equal(result.block_id, scenario.expected.block_id);
    assert.equal(result.human_required, scenario.expected.human_required);
    assert.equal(result.audit.raw_message_persisted, false);
  });
}
