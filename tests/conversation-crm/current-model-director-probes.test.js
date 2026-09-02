'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PROBES,
  percentile,
  reservationState
} = require('../../tools/conversation-crm/local-ai-bakeoff/run-director-probes');

test('probes do Director preservam oito identidades e seeds fixas', () => {
  assert.equal(PROBES.length, 8);
  assert.equal(new Set(PROBES.map((probe) => probe.probe_id)).size, 8);
  assert.equal(new Set(PROBES.map((probe) => probe.seed)).size, 8);
  assert.deepEqual(PROBES.map((probe) => probe.probe_id), [
    'DIR-001', 'DIR-002', 'DIR-003', 'DIR-004',
    'DIR-005', 'DIR-006', 'DIR-007', 'DIR-008'
  ]);
});

test('estado de reserva dos probes é sintético e explícito', () => {
  const state = reservationState();
  assert.equal(state.active_journey, 'reservation');
  assert.equal(state.pending_question, 'reservation_time');
  assert.deepEqual(state.collected_facts, { party_size: 4 });
});

test('predicados dos probes aceitam somente as decisões operacionais esperadas', () => {
  const fixtures = [
    { dialogue_act: 'greet', active_journey: null },
    { dialogue_act: 'start_journey', active_journey: 'reservation', facts_added: { party_size: 4 } },
    { dialogue_act: 'continue_journey', active_journey: 'reservation' },
    { dialogue_act: 'correct_information', active_journey: 'reservation', facts_corrected: { party_size: 10 } },
    { dialogue_act: 'answer_side_question', active_journey: 'reservation', return_to_previous_topic: true, knowledge_queries: ['valet_information'] },
    { dialogue_act: 'clarify_reference', next_required_information: 'reference_clarification' },
    { dialogue_act: 'resume_journey', active_journey: 'reservation', return_to_previous_topic: true },
    { dialogue_act: 'switch_topic', active_journey: 'delivery_occurrence' }
  ];
  PROBES.forEach((probe, index) => assert.equal(probe.expected(fixtures[index]), true, probe.probe_id));
  PROBES.forEach((probe) => assert.equal(probe.expected({ dialogue_act: 'chitchat', active_journey: null }), false, probe.probe_id));
});

test('percentis do executor seguem a mesma regra conservadora do consolidador', () => {
  assert.equal(percentile([4, 1, 3, 2], 0.5), 2);
  assert.equal(percentile([4, 1, 3, 2], 0.95), 4);
});
