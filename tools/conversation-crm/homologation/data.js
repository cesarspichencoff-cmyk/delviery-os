'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BLIND_SEED = 'TATA-HUMAN-REVIEW-V1';
const REHOMOLOGATION_SELECTED = new Set([
  'REV-001', 'REV-004', 'REV-005', 'REV-006', 'REV-007', 'REV-008', 'REV-010',
  'REV-011', 'REV-012', 'REV-013', 'REV-014', 'REV-015', 'REV-016', 'REV-017',
  'REV-019', 'REV-020', 'REV-021', 'REV-022', 'REV-023', 'REV-024', 'REV-025',
  'REV-026', 'REV-027', 'REV-028', 'REV-029', 'REV-030', 'REV-031', 'REV-032',
  'REV-033', 'REV-034', 'REV-035', 'REV-036', 'REV-037', 'REV-038', 'REV-039',
  'REV-040', 'REV-041', 'REV-042', 'REV-043', 'REV-044', 'REV-045', 'REV-047',
  'REV-050'
]);

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
  const refined = readJson(path.join(resultsRoot, 'refined-responses-v2.json'));
  const refinedNewCorpus = readJson(path.join(corpusRoot, 'refined-new-conversations-v2.json'));
  const comparison = readJson(path.join(resultsRoot, 'baseline-vs-humanized-v1.json'));

  if (
    corpus.length !== 50
    || baseline.results.length !== 50
    || humanized.results.length !== 50
    || refined.results.length !== 50
    || refined.new_results.length !== 8
    || refinedNewCorpus.length !== 8
    || comparison.rows.length !== 50
  ) {
    const error = new Error('homologation_artifact_count_invalid');
    error.code = 'HOMOLOGATION_ARTIFACT_COUNT_INVALID';
    throw error;
  }

  const baselineByCase = new Map(baseline.results.map((item) => [item.case_id, item]));
  const humanizedByCase = new Map(humanized.results.map((item) => [item.case_id, item]));
  const refinedByCase = new Map(refined.results.map((item) => [item.case_id, item]));
  const comparisonByCase = new Map(comparison.rows.map((item) => [item.case_id, item]));
  const cases = corpus.map((conversation, index) => {
    const baselineCase = baselineByCase.get(conversation.case_id);
    const humanizedCase = humanizedByCase.get(conversation.case_id);
    const refinedCase = refinedByCase.get(conversation.case_id);
    const comparisonCase = comparisonByCase.get(conversation.case_id);
    if (!baselineCase || !humanizedCase || !refinedCase || !comparisonCase || conversation.turns.length !== humanizedCase.results.length || conversation.turns.length !== refinedCase.results.length) {
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
      refined: refinedCase.results[turnIndex].response_text,
      baseline: baselineCase.results[turnIndex].response_text,
      response_hash: sha256(refinedCase.results[turnIndex].response_text),
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
      },
      technical_refined: {
        intent: refinedCase.results[turnIndex].intent,
        entities: refinedCase.results[turnIndex].entities || {},
        conversation_stage: refinedCase.results[turnIndex].response_plan?.conversation_stage || 'unknown',
        customer_state: refinedCase.results[turnIndex].response_plan?.customer_state || 'unknown',
        gravity: refinedCase.results[turnIndex].response_plan?.gravity || 'unknown',
        response_plan: refinedCase.results[turnIndex].response_plan || null,
        strategy_id: refinedCase.results[turnIndex].response_plan?.strategy_id || null,
        authorized_facts: refinedCase.results[turnIndex].response_plan?.known_facts || [],
        mandatory_questions: refinedCase.results[turnIndex].response_plan?.mandatory_questions || [],
        verified_actions: refinedCase.results[turnIndex].response_plan?.verified_actions || [],
        pending_actions: refinedCase.results[turnIndex].response_plan?.pending_actions || [],
        prohibited_claims: refinedCase.results[turnIndex].response_plan?.prohibited_claims || [],
        fallback_reason: refinedCase.results[turnIndex].response_plan?.fallback_reason || null,
        knowledge_selected: refinedCase.results[turnIndex].response_plan?.knowledge_selected || [],
        knowledge_sources_used: refinedCase.results[turnIndex].response_plan?.knowledge_sources_used || [],
        action_playbook: refinedCase.results[turnIndex].response_plan?.action_playbook || null,
        action_mode: refinedCase.results[turnIndex].response_plan?.action_mode || null,
        validator: refinedCase.results[turnIndex].validation || null,
        replay_hash: refinedCase.results[turnIndex].variation_key || refinedCase.results[turnIndex].input_fingerprint
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
  const refinedNewByCase = new Map(refined.new_results.map((item) => [item.case_id, item]));
  const newCases = refinedNewCorpus.map((conversation, index) => {
    const refinedCase = refinedNewByCase.get(conversation.case_id);
    if (!refinedCase || conversation.turns.length !== refinedCase.results.length) {
      const error = new Error('homologation_refined_new_alignment_invalid');
      error.code = 'HOMOLOGATION_REFINED_NEW_ALIGNMENT_INVALID';
      throw error;
    }
    return Object.freeze({
      review_id: `NEW-${String(index + 1).padStart(3, '0')}`,
      source_case_id: conversation.case_id,
      category: conversation.category,
      synthetic: true,
      rehomologation_reason: 'novo_cenario_derivado',
      order: Object.freeze({ A: 'refined', B: 'refined' }),
      turns: Object.freeze(conversation.turns.map((turn, turnIndex) => Object.freeze({
        turn: turnIndex + 1,
        customer: turn.content,
        humanized: null,
        refined: refinedCase.results[turnIndex].response_text,
        baseline: null,
        response_hash: sha256(refinedCase.results[turnIndex].response_text),
        technical: null,
        technical_refined: {
          intent: refinedCase.results[turnIndex].intent,
          entities: refinedCase.results[turnIndex].entities || {},
          conversation_stage: refinedCase.results[turnIndex].response_plan?.conversation_stage || 'unknown',
          customer_state: refinedCase.results[turnIndex].response_plan?.customer_state || 'unknown',
          gravity: refinedCase.results[turnIndex].response_plan?.gravity || 'unknown',
          response_plan: refinedCase.results[turnIndex].response_plan || null,
          strategy_id: refinedCase.results[turnIndex].response_plan?.strategy_id || null,
          authorized_facts: refinedCase.results[turnIndex].response_plan?.known_facts || [],
          mandatory_questions: refinedCase.results[turnIndex].response_plan?.mandatory_questions || [],
          verified_actions: refinedCase.results[turnIndex].response_plan?.verified_actions || [],
          pending_actions: refinedCase.results[turnIndex].response_plan?.pending_actions || [],
          prohibited_claims: refinedCase.results[turnIndex].response_plan?.prohibited_claims || [],
          fallback_reason: refinedCase.results[turnIndex].response_plan?.fallback_reason || null,
          knowledge_selected: refinedCase.results[turnIndex].response_plan?.knowledge_selected || [],
          knowledge_sources_used: refinedCase.results[turnIndex].response_plan?.knowledge_sources_used || [],
          action_playbook: refinedCase.results[turnIndex].response_plan?.action_playbook || null,
          action_mode: refinedCase.results[turnIndex].response_plan?.action_mode || null,
          validator: refinedCase.results[turnIndex].validation || null,
          replay_hash: refinedCase.results[turnIndex].variation_key || refinedCase.results[turnIndex].input_fingerprint
        }
      })))
    });
  });
  const rehomologationCases = [
    ...cases.filter((item) => REHOMOLOGATION_SELECTED.has(item.review_id)).map((item) => Object.freeze({
      ...item,
      rehomologation_reason: ['REV-001', 'REV-004', 'REV-011', 'REV-019', 'REV-047', 'REV-050'].includes(item.review_id)
        ? 'amostra_aprovada'
        : 'feedback_baixo_ou_incorreto'
    })),
    ...newCases
  ];

  return Object.freeze({
    schema_version: '2.0.0',
    seed: BLIND_SEED,
    corpus_version: refined.schema_version,
    composer_version: refined.runtime?.composer_version || 'response-plan-v2',
    hashes: Object.freeze({
      baseline: baseline.canonical_hash,
      humanized: humanized.canonical_hash,
      refined: refined.canonical_hash,
      comparison: comparison.canonical_hash
    }),
    cases: Object.freeze(cases),
    rehomologation_cases: Object.freeze(rehomologationCases),
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
      response: turn.refined,
      response_hash: turn.response_hash
    })),
    previous_available: item.turns.every((turn) => typeof turn.humanized === 'string'),
    rehomologation_reason: item.rehomologation_reason
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
  REHOMOLOGATION_SELECTED,
  blindOrder,
  loadHomologationData,
  publicBlindCase,
  publicReviewCase,
  sha256
};
