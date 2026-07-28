'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { verifyConversation, summarize } = require('../../scripts/verifiers/chatbot/checks');

const projectRoot = path.resolve(__dirname, '..', '..');

function conversation(texts, contract = {}, status = 'unknown') {
  return {
    case_id: 'VERIFIER-TEST',
    expected_contract: { must_include: [], must_not_include: [], facts: [], questions: [], maximum_length: 500, ...contract },
    results: texts.map((response_text) => ({ response_text, result_status: status }))
  };
}

function failed(checks, name) {
  return checks.some((item) => item.check === name && item.status === 'failed');
}

test('verificador aceita saída curta, factual e sem promessa', () => {
  const checks = verifyConversation(conversation(['Ainda não tenho confirmação. Pode informar o número do pedido?']), { projectRoot });
  assert.equal(summarize(checks).ok, true);
});

test('verificador detecta os sete controles negativos', () => {
  assert.equal(failed(verifyConversation(conversation(['Para que possamos tratar com a devida atenção.']), { projectRoot }), 'bureaucratic_language'), true);
  assert.equal(failed(verifyConversation(conversation(['Acesse https://unknown.example.test.']), { projectRoot }), 'unknown_links'), true);
  assert.equal(failed(verifyConversation(conversation(['O preço é R$ 98765,43.']), { projectRoot }), 'unknown_values'), true);
  assert.equal(failed(verifyConversation(conversation(['Sua reserva está confirmada.']), { projectRoot }), 'forbidden_promises'), true);
  assert.equal(failed(verifyConversation(conversation(['Qual é o pedido?', 'Qual é o pedido?']), { projectRoot }), 'repeated_question'), true);
  assert.equal(failed(verifyConversation(conversation(['intent: occurrence.missing_item']), { projectRoot }), 'technical_leakage'), true);
  assert.equal(failed(verifyConversation(conversation(['']), { projectRoot }), 'non_empty_response'), true);
});

test('verificador aceita somente links públicos canônicos', () => {
  const checks = verifyConversation(conversation(['Use https://reservation.getin.app/MP9xnVkL.']), { projectRoot });
  assert.equal(failed(checks, 'unknown_links'), false);
});

test('contrato externo valida inclusão, exclusão e extensão', () => {
  const checks = verifyConversation(conversation(['Resposta segura.'], {
    must_include: ['segura'],
    must_not_include: ['reembolso'],
    maximum_length: 40
  }), { projectRoot });
  assert.equal(summarize(checks).ok, true);
});

test('material de oráculo no artefato capturado é rejeitado', () => {
  const item = conversation(['Resposta segura.']);
  item.oracle_payload = { ideal_response: 'não permitido' };
  assert.equal(failed(verifyConversation(item, { projectRoot }), 'oracle_presence'), true);
});
