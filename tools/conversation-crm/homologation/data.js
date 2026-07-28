'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BLIND_SEED = 'TATA-HUMAN-REVIEW-V1';

const BANK = Object.freeze([
  ['informações do restaurante', 'Quero conhecer melhor o restaurante.'],
  ['horário', 'Quais são os horários de funcionamento?'],
  ['endereço', 'Qual é o endereço do restaurante?'],
  ['cardápio', 'Pode me mostrar o cardápio?'],
  ['almoço executivo', 'Como funciona o Almoço Executivo?'],
  ['Sugestão Tatá', 'Como funciona a Sugestão Tatá?'],
  ['reservas', 'Quero fazer uma reserva.'],
  ['fila', 'Como funciona a fila de espera?'],
  ['salão', 'Vocês têm atendimento no salão?'],
  ['grupos grandes', 'Estamos em dez pessoas e chegando.'],
  ['pagamentos', 'Quais pagamentos vocês aceitam?'],
  ['rolha', 'Qual é a taxa de rolha?'],
  ['valet', 'Como funciona o valet?'],
  ['delivery próprio', 'Como faço um pedido pelo delivery próprio?'],
  ['iFood', 'Como acompanho um pedido feito pelo iFood?'],
  ['pedido', 'Quero consultar meu pedido sintético.'],
  ['item faltando', 'Faltou meu refrigerante no pedido.'],
  ['item errado', 'Veio outro item no pedido.'],
  ['quantidade errada', 'Vieram duas peças em vez de três.'],
  ['personalização', 'Pedi sem cebola e veio com.'],
  ['atraso', 'Meu pedido está atrasado.'],
  ['entrega', 'Quero entender o andamento da entrega.'],
  ['qualidade', 'O item chegou fora do padrão esperado.'],
  ['segurança alimentar', 'Encontrei um corpo estranho no alimento.'],
  ['eventos', 'Vocês recebem eventos no restaurante?'],
  ['Okes', 'Quero encomendar um oke para retirada.'],
  ['elogios', 'Quero deixar um elogio para a equipe.'],
  ['reclamações', 'Preciso registrar uma reclamação.'],
  ['privacidade', 'Como meus dados são tratados?'],
  ['handoff', 'Preciso falar com uma pessoa.'],
  ['multiturno', 'Quero continuar uma conversa anterior de teste.'],
  ['falhas simuladas', 'Quero testar uma indisponibilidade simulada.']
].map(([category, example], index) => Object.freeze({
  bank_id: `BANK-${String(index + 1).padStart(2, '0')}`,
  category,
  example,
  synthetic: true
})));

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function reviewId(index) {
  return `REV-${String(index + 1).padStart(3, '0')}`;
}

function blindOrder(caseKey, seed = BLIND_SEED) {
  return Number.parseInt(sha256(`${seed}:${caseKey}`).slice(0, 2), 16) % 2 === 0
    ? Object.freeze({ A: 'baseline', B: 'humanized' })
    : Object.freeze({ A: 'humanized', B: 'baseline' });
}

function loadHomologationData(projectRoot) {
  const corpusRoot = path.join(projectRoot, 'evals', 'human-review');
  const resultsRoot = path.join(corpusRoot, 'results');
  const corpus = readJson(path.join(corpusRoot, 'baseline-conversations-v1.json'));
  const baseline = readJson(path.join(resultsRoot, 'baseline-responses-v1.json'));
  const humanized = readJson(path.join(resultsRoot, 'humanized-responses-v1.json'));
  const comparison = readJson(path.join(resultsRoot, 'baseline-vs-humanized-v1.json'));

  if (corpus.length !== 50 || baseline.results.length !== 50 || humanized.results.length !== 50 || comparison.rows.length !== 50) {
    const error = new Error('homologation_artifact_count_invalid');
    error.code = 'HOMOLOGATION_ARTIFACT_COUNT_INVALID';
    throw error;
  }

  const baselineByCase = new Map(baseline.results.map((item) => [item.case_id, item]));
  const humanizedByCase = new Map(humanized.results.map((item) => [item.case_id, item]));
  const comparisonByCase = new Map(comparison.rows.map((item) => [item.case_id, item]));
  const cases = corpus.map((conversation, index) => {
    const baselineCase = baselineByCase.get(conversation.case_id);
    const humanizedCase = humanizedByCase.get(conversation.case_id);
    const comparisonCase = comparisonByCase.get(conversation.case_id);
    if (!baselineCase || !humanizedCase || !comparisonCase || conversation.turns.length !== humanizedCase.results.length) {
      const error = new Error('homologation_artifact_alignment_invalid');
      error.code = 'HOMOLOGATION_ARTIFACT_ALIGNMENT_INVALID';
      throw error;
    }
    const id = reviewId(index);
    const order = blindOrder(id);
    const turns = conversation.turns.map((turn, turnIndex) => ({
      turn: turnIndex + 1,
      customer: turn.content,
      humanized: humanizedCase.results[turnIndex].response_text,
      baseline: baselineCase.results[turnIndex].response_text,
      response_hash: sha256(humanizedCase.results[turnIndex].response_text),
      technical: {
        intent: humanizedCase.results[turnIndex].intent,
        entities: humanizedCase.results[turnIndex].entities || {},
        conversation_stage: humanizedCase.results[turnIndex].response_plan?.conversation_stage || 'unknown',
        customer_state: humanizedCase.results[turnIndex].response_plan?.customer_state || 'unknown',
        gravity: humanizedCase.results[turnIndex].response_plan?.gravity || 'unknown',
        response_plan: humanizedCase.results[turnIndex].response_plan || null,
        strategy_id: humanizedCase.results[turnIndex].response_plan?.strategy_id || null,
        authorized_facts: humanizedCase.results[turnIndex].response_plan?.known_facts || [],
        mandatory_questions: humanizedCase.results[turnIndex].response_plan?.mandatory_questions || [],
        verified_actions: humanizedCase.results[turnIndex].response_plan?.verified_actions || [],
        pending_actions: humanizedCase.results[turnIndex].response_plan?.pending_actions || [],
        prohibited_claims: humanizedCase.results[turnIndex].response_plan?.prohibited_claims || [],
        fallback_reason: humanizedCase.results[turnIndex].response_plan?.fallback_reason || null,
        validator: humanizedCase.results[turnIndex].validation || null,
        replay_hash: humanizedCase.results[turnIndex].variation_key || humanizedCase.results[turnIndex].input_fingerprint
      }
    }));
    return Object.freeze({
      review_id: id,
      source_case_id: conversation.case_id,
      category: conversation.category,
      synthetic: true,
      order,
      turns: Object.freeze(turns.map(Object.freeze))
    });
  });

  return Object.freeze({
    schema_version: '1.0.0',
    seed: BLIND_SEED,
    corpus_version: humanized.schema_version,
    composer_version: humanized.runtime?.composer_version || 'humanized-v1',
    hashes: Object.freeze({
      baseline: baseline.canonical_hash,
      humanized: humanized.canonical_hash,
      comparison: comparison.canonical_hash
    }),
    cases: Object.freeze(cases),
    bank: BANK
  });
}

function publicReviewCase(item) {
  return {
    review_id: item.review_id,
    category: item.category,
    turns: item.turns.map((turn) => ({
      turn: turn.turn,
      customer: turn.customer,
      response: turn.humanized,
      response_hash: turn.response_hash
    }))
  };
}

function publicBlindCase(item) {
  return {
    review_id: item.review_id,
    category: item.category,
    turns: item.turns.map((turn) => ({
      turn: turn.turn,
      customer: turn.customer,
      A: item.order.A === 'humanized' ? turn.humanized : turn.baseline,
      B: item.order.B === 'humanized' ? turn.humanized : turn.baseline
    })),
    order_fingerprint: sha256(`${BLIND_SEED}:${item.review_id}:order`)
  };
}

module.exports = {
  BANK,
  BLIND_SEED,
  blindOrder,
  loadHomologationData,
  publicBlindCase,
  publicReviewCase,
  sha256
};
