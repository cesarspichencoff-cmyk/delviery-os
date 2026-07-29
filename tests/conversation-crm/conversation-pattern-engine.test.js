'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const {
  PATTERN_INPUT_KEYS,
  PATTERN_DECISION_KEYS,
  normalizeConversationText,
  resolveConversationPattern,
  validatePatternDecision
} = require('../../apps/deliveryos-ai-node');

function input(message, overrides = {}) {
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

test('contrato do Pattern Engine é completo e versionado', () => {
  const value = input('Oi');
  assert.deepEqual(Object.keys(value).sort(), [...PATTERN_INPUT_KEYS].sort());
  const result = resolveConversationPattern(value);
  assert.deepEqual(Object.keys(result).sort(), [...PATTERN_DECISION_KEYS].sort());
  assert.equal(validatePatternDecision(result).accepted, true);
  assert.equal(result.schema_version, 'deliveryos-conversation-pattern-decision-v1');
});

test('saudação isolada não inicia jornada', () => {
  const result = resolveConversationPattern(input('Oi, tudo bem?'));
  assert.equal(result.pattern, 'greeting');
  assert.equal(result.journey_action, 'none');
  assert.equal(result.target_journey, null);
});

test('saudação com tarefa inicia reserva e aproveita quantidade', () => {
  const result = resolveConversationPattern(input('Boa noite, quero reservar uma mesa para quatro.', {
    candidate_intents: ['reservation.create']
  }));
  assert.equal(result.pattern, 'continue');
  assert.equal(result.journey_action, 'start');
  assert.equal(result.target_journey, 'reservation');
  assert.equal(result.facts_added.party_size, 4);
  assert.ok(result.collision_log.length > 0);
});

test('saudação durante jornada preserva a pergunta pendente', () => {
  const result = resolveConversationPattern(input('Oi de novo', {
    active_journey: 'reservation', active_step: 'reservation_time', pending_question: 'reservation_time'
  }));
  assert.equal(result.pattern, 'greeting');
  assert.equal(result.target_journey, 'reservation');
  assert.equal(result.question_to_resume, 'Qual horário você prefere?');
});

test('resposta curta usa tipo da pergunta pendente', () => {
  const result = resolveConversationPattern(input('quatro', {
    active_journey: 'reservation', active_step: 'party_size', pending_question: 'party_size'
  }));
  assert.equal(result.pattern, 'continue');
  assert.equal(result.journey_action, 'advance');
  assert.deepEqual(result.facts_added, { party_size: 4 });
});

test('número curto inválido não é aceito silenciosamente', () => {
  const result = resolveConversationPattern(input('cento e cinquenta', {
    active_journey: 'reservation', active_step: 'party_size', pending_question: 'party_size'
  }));
  assert.equal(result.pattern, 'clarification');
  assert.equal(result.requires_clarification, true);
});

test('correção explícita altera somente o campo identificado', () => {
  const result = resolveConversationPattern(input('Éramos sete, agora somos dez.', {
    active_journey: 'reservation', active_step: 'reservation_time', pending_question: 'reservation_time',
    collected_facts: { party_size: 7, reservation_day: 'amanhã' }
  }));
  assert.equal(result.pattern, 'correction');
  assert.deepEqual(result.facts_corrected, { party_size: 10 });
  assert.equal(Object.hasOwn(result.facts_corrected, 'reservation_day'), false);
});

test('correção ambígua pede o campo exato em vez de escolher', () => {
  const result = resolveConversationPattern(input('Na verdade, quero corrigir isso.', {
    active_journey: 'reservation', pending_question: 'reservation_time', collected_facts: { party_size: 4 }
  }));
  assert.equal(result.pattern, 'clarification');
  assert.match(result.clarification_question, /quantidade, data, horário, canal ou item/u);
});

test('segurança alimentar prevalece sobre saudação e reserva', () => {
  const result = resolveConversationPattern(input('Oi, quero reservar, mas tive dificuldade para respirar.', {
    candidate_intents: ['reservation.create', 'occurrence.health_symptom']
  }));
  assert.equal(result.pattern, 'handoff');
  assert.equal(result.target_journey, 'food_safety');
  assert.equal(result.confidence, 0.99);
});

test('pedido explícito de humano não depende do modelo', () => {
  const result = resolveConversationPattern(input('Quero falar com uma pessoa.'));
  assert.equal(result.pattern, 'handoff');
  assert.equal(result.target_journey, 'handoff');
});

test('cancelamento vence retomada e não apaga histórico por decisão', () => {
  const result = resolveConversationPattern(input('Voltando: deixa pra lá, pode cancelar.', {
    active_journey: 'reservation', collected_facts: { party_size: 4 }
  }));
  assert.equal(result.pattern, 'cancel');
  assert.equal(result.journey_action, 'cancel');
  assert.deepEqual(result.facts_corrected, {});
});

test('repetição e reformulação são distinguidas sem novos fatos', () => {
  const repeat = resolveConversationPattern(input('Pode repetir?', { active_journey: 'reservation', pending_question: 'reservation_time' }));
  const reformulate = resolveConversationPattern(input('Não entendi, fala de outro jeito.', { active_journey: 'reservation', pending_question: 'reservation_time' }));
  assert.equal(repeat.reference_resolution.mode, 'repeat');
  assert.equal(reformulate.reference_resolution.mode, 'reformulate');
  assert.deepEqual(reformulate.facts_added, {});
});

test('referência ordinal resolve candidato explícito', () => {
  const result = resolveConversationPattern(input('O segundo.', {
    active_journey: 'own_delivery', pending_question: 'selected_option',
    candidate_entities: [{ field: 'selected_option', value: 'retirada' }, { field: 'selected_option', value: 'delivery' }]
  }));
  assert.equal(result.pattern, 'continue');
  assert.equal(result.reference_resolution.value, 'delivery');
});

test('referência vaga com mais de um candidato pede esclarecimento', () => {
  const result = resolveConversationPattern(input('Pode ser esse.', {
    active_journey: 'own_delivery',
    candidate_entities: [{ field: 'selected_option', value: 'retirada' }, { field: 'selected_option', value: 'delivery' }]
  }));
  assert.equal(result.pattern, 'clarification');
  assert.equal(result.reference_resolution.status, 'ambiguous');
});

test('pergunta lateral preserva jornada e pergunta de retorno', () => {
  const result = resolveConversationPattern(input('Antes, vocês têm valet?', {
    active_journey: 'reservation', active_step: 'reservation_time', pending_question: 'reservation_time',
    collected_facts: { party_size: 4, reservation_day: 'amanhã' }, candidate_intents: ['information.valet']
  }));
  assert.equal(result.pattern, 'side_question');
  assert.equal(result.target_journey, 'reservation');
  assert.equal(result.question_to_answer, 'valet_information');
  assert.equal(result.question_to_resume, 'Qual horário você prefere?');
  assert.deepEqual(result.facts_added, {});
});

test('nova jornada suspende a anterior em vez de sobrescrever', () => {
  const result = resolveConversationPattern(input('Também faltou um item no pedido.', {
    active_journey: 'reservation', active_step: 'reservation_time', pending_question: 'reservation_time',
    candidate_intents: ['occurrence.missing_item']
  }));
  assert.equal(result.pattern, 'switch_topic');
  assert.equal(result.journey_action, 'suspend');
  assert.equal(result.target_journey, 'missing_item');
});

test('retomada escolhe a última jornada suspensa', () => {
  const result = resolveConversationPattern(input('Voltando à reserva.', {
    active_journey: 'missing_item',
    suspended_journeys: [{ journey_id: 'reservation', active_step: 'reservation_time', pending_question: 'reservation_time', collected_facts: { party_size: 4 } }]
  }));
  assert.equal(result.pattern, 'resume');
  assert.equal(result.journey_action, 'resume');
  assert.equal(result.target_journey, 'reservation');
  assert.equal(result.question_to_resume, 'Qual horário você prefere?');
});

test('resolução independe de scenario_id e não aceita a chave no contrato', () => {
  assert.throws(() => resolveConversationPattern({ ...input('Oi'), scenario_id: 'TATA-SC-001', current_message: undefined }), { code: 'PATTERN_MESSAGE_INVALID' });
  const first = resolveConversationPattern(input('Quatro', { active_journey: 'reservation', pending_question: 'party_size' }));
  const second = resolveConversationPattern(input('Quatro', { active_journey: 'reservation', pending_question: 'party_size' }));
  assert.deepEqual(first, second);
});

test('latência p95 local fica abaixo de 50 ms', () => {
  const durations = [];
  for (let index = 0; index < 1000; index += 1) {
    const started = performance.now();
    resolveConversationPattern(input(index % 2 ? 'Boa noite, quero reservar para quatro.' : 'Antes, vocês têm valet?', {
      active_journey: index % 2 ? null : 'reservation',
      active_step: index % 2 ? null : 'reservation_time',
      pending_question: index % 2 ? null : 'reservation_time',
      candidate_intents: index % 2 ? ['reservation.create'] : ['information.valet']
    }));
    durations.push(performance.now() - started);
  }
  durations.sort((left, right) => left - right);
  assert.ok(durations[Math.floor(durations.length * 0.95)] < 50);
});
