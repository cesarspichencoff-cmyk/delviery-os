'use strict';

const { canonicalHash } = require('../bakeoff/runner');
const { normalizeConversationText, resolveConversationPattern } = require('../dialogue/conversation-pattern-engine');
const { initialPatternJourneyState, applyPatternDecision } = require('../dialogue/pattern-journey-state');

const PATTERN_CORPUS_COUNTS = Object.freeze({
  greetings: 30,
  greeting_with_task: 30,
  short_answers: 40,
  corrections: 40,
  contextual_references: 40,
  side_questions: 40,
  suspension_resume: 40,
  repeats: 20,
  reformulations: 20,
  topic_changes: 30,
  cancellations: 20,
  reopenings: 20,
  two_journeys: 20,
  long_conversations: 20
});

function patternInput(message, overrides = {}) {
  return {
    current_message: message,
    normalized_message: normalizeConversationText(message),
    active_journey: null,
    active_step: null,
    pending_question: null,
    collected_facts: {},
    suspended_journeys: [],
    side_questions: [],
    last_assistant_act: '',
    recent_turns: [],
    candidate_intents: [],
    candidate_entities: [],
    ...overrides
  };
}

function repeated(count, category, variants, inputFactory, expectedFactory) {
  return Array.from({ length: count }, (_, index) => {
    const variant = variants[index % variants.length];
    return Object.freeze({
      case_id: `PATTERN-${category.toUpperCase().replace(/[^A-Z0-9]+/gu, '-')}-${String(index + 1).padStart(3, '0')}`,
      category,
      input: Object.freeze(patternInput(variant, inputFactory ? inputFactory(index, variant) : {})),
      expected: Object.freeze(expectedFactory(index, variant))
    });
  });
}

function buildSingleTurnCases() {
  const cases = [];
  cases.push(...repeated(30, 'greetings', ['Oi.', 'Olá!', 'Bom dia.', 'Boa tarde!', 'Boa noite.', 'Oi, tudo bem?'], null, () => ({ pattern: 'greeting', journey_action: 'none' })));
  cases.push(...repeated(30, 'greeting_with_task', [
    'Oi, quero reservar uma mesa para quatro.', 'Boa noite, quero reservar para cinco.', 'Olá, preciso de mesa para seis.'
  ], () => ({ candidate_intents: ['reservation.create'] }), () => ({ pattern: 'continue', target_journey: 'reservation', journey_action: 'start' })));
  cases.push(...repeated(40, 'short_answers', ['quatro', 'cinco', 'seis', 'sete', 'oito'], () => ({ active_journey: 'reservation', active_step: 'collect_party_size', pending_question: 'party_size' }), () => ({ pattern: 'continue', journey_action: 'advance', target_journey: 'reservation' })));
  cases.push(...repeated(40, 'corrections', ['Na verdade, agora somos dez.', 'Corrigindo, somos nove.', 'Éramos sete, agora somos onze.'], () => ({ active_journey: 'reservation', active_step: 'collect_time', pending_question: 'time', collected_facts: { party_size: 7, date: 'amanhã' } }), () => ({ pattern: 'correction', journey_action: 'backtrack', target_journey: 'reservation' })));
  cases.push(...repeated(40, 'contextual_references', ['O segundo.', 'A segunda.'], () => ({ active_journey: 'own_delivery', active_step: 'collect_selected_option', pending_question: 'selected_option', candidate_entities: [{ field: 'selected_option', value: 'retirada' }, { field: 'selected_option', value: 'delivery' }] }), () => ({ pattern: 'continue', journey_action: 'advance', target_journey: 'own_delivery' })));
  cases.push(...repeated(40, 'side_questions', ['Antes, vocês têm valet?', 'Antes, qual é o horário?', 'Antes, aceitam cartão?', 'Antes, onde fica?'], () => ({ active_journey: 'reservation', active_step: 'collect_time', pending_question: 'time', collected_facts: { party_size: 4, date: 'amanhã' } }), () => ({ pattern: 'side_question', journey_action: 'none', target_journey: 'reservation' })));
  cases.push(...repeated(40, 'suspension_resume', ['Voltando à reserva.', 'Retomando a reserva.', 'Quero retomar a reserva.', 'Podemos continuar?'], () => ({ active_journey: 'missing_item', active_step: 'collect_order_reference', pending_question: 'order_reference', suspended_journeys: [{ journey_id: 'reservation', active_step: 'collect_time', pending_question: 'time', collected_facts: { party_size: 4, date: 'amanhã' } }] }), () => ({ pattern: 'resume', journey_action: 'resume', target_journey: 'reservation' })));
  cases.push(...repeated(20, 'repeats', ['Pode repetir?', 'Repete, por favor.', 'Como?', 'Não ouvi.'], () => ({ active_journey: 'reservation', active_step: 'collect_time', pending_question: 'time' }), () => ({ pattern: 'repeat', journey_action: 'none', reference_mode: 'repeat' })));
  cases.push(...repeated(20, 'reformulations', ['Não entendi, explica melhor.', 'Fala de outro jeito.', 'O que isso quer dizer?', 'Como assim?'], () => ({ active_journey: 'reservation', active_step: 'collect_time', pending_question: 'time' }), () => ({ pattern: 'repeat', journey_action: 'none', reference_mode: 'reformulate' })));
  cases.push(...repeated(30, 'topic_changes', ['Também faltou um item no pedido.', 'Agora preciso falar de um item que não veio.', 'Mudando de assunto, esqueceram um item.'], () => ({ active_journey: 'reservation', active_step: 'collect_time', pending_question: 'time', collected_facts: { party_size: 4 }, candidate_intents: ['occurrence.missing_item'] }), () => ({ pattern: 'switch_topic', journey_action: 'suspend', target_journey: 'missing_item' })));
  cases.push(...repeated(20, 'cancellations', ['Deixa pra lá.', 'Pode cancelar.', 'Não quero mais.', 'Cancela essa solicitação.'], () => ({ active_journey: 'reservation', active_step: 'collect_time', pending_question: 'time', collected_facts: { party_size: 4 } }), () => ({ pattern: 'cancel', journey_action: 'cancel', target_journey: 'reservation' })));
  cases.push(...repeated(20, 'reopenings', ['Voltei, quero reservar para quatro.', 'Quero retomar com uma nova reserva para cinco.', 'Olá de novo, preciso de mesa para seis.'], () => ({ candidate_intents: ['reservation.create'], last_assistant_act: 'close' }), () => ({ pattern: 'continue', journey_action: 'start', target_journey: 'reservation' })));
  cases.push(...repeated(20, 'two_journeys', ['Também faltou um item.', 'Além da reserva, não veio um item.', 'Outra coisa: esqueceram um item.'], () => ({ active_journey: 'reservation', active_step: 'collect_date', pending_question: 'date', collected_facts: { party_size: 4 }, candidate_intents: ['occurrence.missing_item'] }), () => ({ pattern: 'switch_topic', journey_action: 'suspend', target_journey: 'missing_item' })));
  return Object.freeze(cases);
}

function longConversation(index) {
  return Object.freeze({
    conversation_id: `SIM-PATTERN-LONG-${String(index + 1).padStart(3, '0')}`,
    category: 'long_conversations',
    turns: Object.freeze([
      Object.freeze({ message: 'Oi, quero reservar uma mesa para quatro.', candidate_intents: ['reservation.create'] }),
      Object.freeze({ message: 'amanhã' }),
      Object.freeze({ message: '20h' }),
      Object.freeze({ message: 'Antes, vocês têm valet?' }),
      Object.freeze({ message: 'Também faltou um item no pedido.', candidate_intents: ['occurrence.missing_item'] }),
      Object.freeze({ message: 'iFood' }),
      Object.freeze({ message: 'Não entendi, fala de outro jeito.' }),
      Object.freeze({ message: 'Voltando à reserva.' })
    ]),
    expected: Object.freeze({ minimum_turns: 8, final_active_journey: 'reservation', minimum_suspended_history: 0 })
  });
}

function executePatternCase(item) {
  const result = resolveConversationPattern(item.input);
  const mismatches = [];
  for (const [field, expected] of Object.entries(item.expected)) {
    const actual = field === 'reference_mode' ? result.reference_resolution.mode : result[field];
    if (actual !== expected) mismatches.push(`${field}:${JSON.stringify(actual)}!=${JSON.stringify(expected)}`);
  }
  return Object.freeze({ case_id: item.case_id, passed: mismatches.length === 0, mismatches: Object.freeze(mismatches), result });
}

function stateInput(message, state, overrides = {}) {
  return patternInput(message, {
    active_journey: state.active_journey,
    active_step: state.active_step,
    pending_question: state.pending_question,
    collected_facts: state.collected_facts,
    suspended_journeys: state.suspended_journeys,
    side_questions: state.side_questions,
    last_assistant_act: state.last_assistant_act,
    ...overrides
  });
}

function executeLongConversation(item) {
  let state = initialPatternJourneyState(item.conversation_id);
  const decisions = [];
  for (const turn of item.turns) {
    const decision = resolveConversationPattern(stateInput(turn.message, state, { candidate_intents: turn.candidate_intents || [] }));
    state = applyPatternDecision(state, decision);
    decisions.push(decision);
  }
  const passed = item.turns.length >= item.expected.minimum_turns && state.active_journey === item.expected.final_active_journey;
  return Object.freeze({ conversation_id: item.conversation_id, passed, state, decisions: Object.freeze(decisions) });
}

function buildPatternCorpus(seed = 'TATA-PATTERN-ENGINE-V1') {
  const cases = buildSingleTurnCases();
  const conversations = Object.freeze(Array.from({ length: 20 }, (_, index) => longConversation(index)));
  const base = {
    schema_version: 'deliveryos-pattern-corpus-v1',
    seed,
    counts: PATTERN_CORPUS_COUNTS,
    total_single_turn_cases: cases.length,
    total_long_conversations: conversations.length,
    cases,
    conversations
  };
  return Object.freeze({ ...base, canonical_hash: canonicalHash(base) });
}

module.exports = {
  PATTERN_CORPUS_COUNTS,
  patternInput,
  buildSingleTurnCases,
  buildPatternCorpus,
  executePatternCase,
  executeLongConversation
};
