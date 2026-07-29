'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  normalizeConversationText,
  resolveConversationPattern,
  initialPatternJourneyState,
  applyPatternDecision
} = require('../../apps/deliveryos-ai-node');
const {
  NativeEventStore,
  DeterministicClock,
  NativePatternStateStore,
  DeliveryOsStateHub,
  loadFeatureFlags,
  publishPatternState
} = require('../../src/conversation-crm/native');

function engineInput(message, state, overrides = {}) {
  return {
    current_message: message,
    normalized_message: normalizeConversationText(message),
    active_journey: state.active_journey,
    active_step: state.active_step,
    pending_question: state.pending_question,
    collected_facts: state.collected_facts,
    suspended_journeys: state.suspended_journeys,
    side_questions: state.side_questions,
    last_assistant_act: state.last_assistant_act,
    recent_turns: [],
    candidate_intents: [],
    candidate_entities: [],
    ...overrides
  };
}

function transition(state, message, overrides = {}) {
  return applyPatternDecision(state, resolveConversationPattern(engineInput(message, state, overrides)));
}

test('jornada inicia no primeiro fato ausente e avança sem repetir etapa', () => {
  let state = initialPatternJourneyState('SIM-CONV-PATTERN-001');
  state = transition(state, 'Quero reservar uma mesa.', { candidate_intents: ['reservation.create'] });
  assert.equal(state.active_journey, 'reservation');
  assert.equal(state.active_step, 'collect_party_size');
  assert.equal(state.pending_question, 'party_size');
  state = transition(state, 'quatro');
  assert.equal(state.collected_facts.party_size, 4);
  assert.equal(state.active_step, 'collect_date');
  assert.deepEqual(state.completed_steps.reservation, ['collect_party_size']);
});

test('correção preserva valor anterior no histórico e só troca projeção ativa', () => {
  let state = initialPatternJourneyState('SIM-CONV-PATTERN-002');
  state = transition(state, 'Quero reservar para sete.', { candidate_intents: ['reservation.create'] });
  state = transition(state, 'Na verdade, agora somos dez.');
  assert.equal(state.collected_facts.party_size, 10);
  assert.equal(state.corrections.at(-1).previous.party_size, 7);
  assert.equal(state.corrections.at(-1).current.party_size, 10);
});

test('pergunta lateral deixa pilha vazia após resposta e preserva jornada', () => {
  let state = initialPatternJourneyState('SIM-CONV-PATTERN-003');
  state = transition(state, 'Quero reservar para quatro.', { candidate_intents: ['reservation.create'] });
  const before = state;
  state = transition(state, 'Antes, vocês têm valet?', { candidate_intents: ['information.valet'] });
  assert.equal(state.active_journey, before.active_journey);
  assert.equal(state.active_step, before.active_step);
  assert.deepEqual(state.collected_facts, before.collected_facts);
  assert.equal(state.side_question_stack.length, 0);
  assert.equal(state.side_questions.at(-1).status, 'answered_and_resumed');
});

test('troca de assunto suspende e retomada restaura fatos e etapa', () => {
  let state = initialPatternJourneyState('SIM-CONV-PATTERN-004');
  state = transition(state, 'Quero reservar para quatro.', { candidate_intents: ['reservation.create'] });
  state = transition(state, 'Também faltou um item.', { candidate_intents: ['occurrence.missing_item'] });
  assert.equal(state.active_journey, 'missing_item');
  assert.equal(state.suspended_journeys.at(-1).journey_id, 'reservation');
  assert.equal(state.suspended_journeys.at(-1).collected_facts.party_size, 4);
  state = transition(state, 'Voltando à reserva.');
  assert.equal(state.active_journey, 'reservation');
  assert.equal(state.collected_facts.party_size, 4);
  assert.equal(state.suspended_journeys.length, 0);
});

test('cancelamento preserva snapshot histórico e limpa aptidão ativa', () => {
  let state = initialPatternJourneyState('SIM-CONV-PATTERN-005');
  state = transition(state, 'Quero reservar para quatro.', { candidate_intents: ['reservation.create'] });
  state = transition(state, 'Deixa pra lá, pode cancelar.');
  assert.equal(state.active_journey, null);
  assert.deepEqual(state.collected_facts, {});
  assert.equal(state.journey_history.at(-1).status, 'cancelled');
  assert.equal(state.journey_history.at(-1).collected_facts.party_size, 4);
});

test('pilha limitada falha fechada sem remover jornada anterior', () => {
  const state = Object.freeze({
    ...initialPatternJourneyState('SIM-CONV-PATTERN-006'),
    active_journey: 'reservation',
    active_step: 'collect_date',
    pending_question: 'date',
    collected_facts: Object.freeze({ party_size: 4 }),
    suspended_journeys: Object.freeze([
      { journey_id: 'waitlist', active_step: 'collect_party_size', pending_question: 'party_size', collected_facts: {}, completed_steps: [] },
      { journey_id: 'quality', active_step: 'collect_order_reference', pending_question: 'order_reference', collected_facts: {}, completed_steps: [] },
      { journey_id: 'delay', active_step: 'collect_order_channel', pending_question: 'order_channel', collected_facts: {}, completed_steps: [] }
    ])
  });
  const movement = resolveConversationPattern(engineInput('Também faltou um item.', state, { candidate_intents: ['occurrence.missing_item'] }));
  assert.throws(() => applyPatternDecision(state, movement), { code: 'JOURNEY_STACK_LIMIT' });
  assert.equal(state.active_journey, 'reservation');
  assert.equal(state.suspended_journeys.length, 3);
});

test('store nativo deduplica turno e reconstrói estado após reinício', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-pattern-state-'));
  const clock = new DeterministicClock('2026-07-29T12:00:00-03:00');
  const eventStore = new NativeEventStore({ runtimeRoot: root, clock });
  const first = new NativePatternStateStore({ store: eventStore, clock });
  let state = first.reconstruct('SIM-CONV-PATTERN-007');
  const start = resolveConversationPattern(engineInput('Quero reservar para quatro.', state, { candidate_intents: ['reservation.create'] }));
  assert.equal(first.apply({ conversation_id: state.conversation_id, turn_id: 'SIM-TURN-001', decision: start }).status, 'accepted');
  assert.equal(first.apply({ conversation_id: state.conversation_id, turn_id: 'SIM-TURN-001', decision: start }).status, 'duplicate');
  const restoredEvents = new NativeEventStore({ runtimeRoot: root, clock });
  const restored = new NativePatternStateStore({ store: restoredEvents, clock }).reconstruct('SIM-CONV-PATTERN-007');
  assert.equal(restored.active_journey, 'reservation');
  assert.equal(restored.collected_facts.party_size, 4);
  assert.equal(restoredEvents.eventsOfType('conversation.pattern_decision_applied').length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

test('State Hub recebe somente projeção sintética reconstruível', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deliveryos-pattern-hub-'));
  const projectRoot = path.resolve(__dirname, '../..');
  const clock = new DeterministicClock('2026-07-29T12:00:00-03:00');
  const store = new NativeEventStore({ runtimeRoot: root, clock });
  const flags = loadFeatureFlags({ projectRoot, file: 'config/conversation-crm/native-flags.simulator.json' });
  const hub = new DeliveryOsStateHub({ store, flags, clock });
  let state = initialPatternJourneyState('SIM-CONV-PATTERN-008');
  state = transition(state, 'Quero reservar para quatro.', { candidate_intents: ['reservation.create'] });
  publishPatternState(hub, state, { observed_at: clock.iso(), confidence: 0.97 });
  const projection = hub.project('conversation', state.conversation_id);
  assert.equal(projection.fields['conversation.pattern_state'].state, 'confirmed');
  assert.equal(projection.fields['conversation.pattern_state'].value.active_journey, 'reservation');
  assert.equal(JSON.stringify(store.events).includes('Quero reservar'), false);
  fs.rmSync(root, { recursive: true, force: true });
});
