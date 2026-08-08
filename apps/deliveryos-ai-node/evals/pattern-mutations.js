'use strict';

const { patternInput } = require('./pattern-corpus');
const { resolveConversationPattern } = require('../dialogue/conversation-pattern-engine');
const { initialPatternJourneyState, applyPatternDecision } = require('../dialogue/pattern-journey-state');
const { validatePatternInput } = require('../dialogue/pattern-contract');
const { evaluateCostPolicy, ZERO_EXTERNAL_COST_POLICY } = require('../dialogue/product-context-contracts');
const { validateApprovedWriterOutput } = require('../dialogue/approved-response-envelope');

function mutationResult(id, category, killed, evidence) {
  return Object.freeze({ mutation_id: id, category, killed: Boolean(killed), evidence });
}

function baseEnvelope() {
  return {
    schema_version: 'deliveryos-approved-response-envelope-v1', social_acknowledgement: null,
    direct_answer: [], explanation: [], journey_context: null, customer_context_summary: null,
    menu_context_summary: null, recommendation_context: null,
    customer_goal: null, active_context: null, confirmed_facts: [], active_preferences: [], active_restrictions: [],
    candidate_options: [], candidate_reasons: [], candidate_tradeoffs: [], uncertainties_to_translate: [],
    questions_answerable_now: [], unresolved_reference: null, next_best_question: 'Qual é o número do pedido?',
    channel_policy_summary: { status: 'not_requested' }, cost_policy_summary: { status: 'free_verified' },
    facts: [], action_truth: null, question_to_ask: 'Qual é o número do pedido?', tone: 'tata_warm', gravity: 'sensitive',
    prohibited_claims: [], recent_phrases_to_avoid: [], authorized_links: [], authorized_numbers: [], maximum_length: 500
  };
}

function runPatternMutationCertification() {
  const results = [];
  const safety = resolveConversationPattern(patternInput('Oi, quero reservar, mas tive dificuldade para respirar.', { candidate_intents: ['reservation.create'] }));
  results.push(mutationResult('MUT-001', 'priority', safety.target_journey === 'food_safety' && safety.pattern === 'handoff', safety));

  const correction = resolveConversationPattern(patternInput('Na verdade, agora somos dez.', { active_journey: 'reservation', pending_question: 'time', collected_facts: { party_size: 7 } }));
  results.push(mutationResult('MUT-002', 'correction', correction.pattern === 'correction' && correction.facts_corrected.party_size === 10, correction));

  const cancel = resolveConversationPattern(patternInput('Voltando, deixa pra lá.', { active_journey: 'reservation', suspended_journeys: [{ journey_id: 'waitlist' }] }));
  results.push(mutationResult('MUT-003', 'cancel', cancel.pattern === 'cancel' && cancel.journey_action === 'cancel', cancel));

  const repeat = resolveConversationPattern(patternInput('Pode repetir?', { active_journey: 'reservation', pending_question: 'time' }));
  results.push(mutationResult('MUT-004', 'repeat', repeat.pattern === 'repeat' && Object.keys(repeat.facts_added).length === 0, repeat));

  const pending = resolveConversationPattern(patternInput('quatro', { active_journey: 'reservation', pending_question: 'party_size' }));
  results.push(mutationResult('MUT-005', 'pending_answer', pending.pattern === 'continue' && pending.facts_added.party_size === 4, pending));

  const ambiguous = resolveConversationPattern(patternInput('Pode ser esse.', { candidate_entities: [{ field: 'selected_option', value: 'retirada' }, { field: 'selected_option', value: 'delivery' }] }));
  results.push(mutationResult('MUT-006', 'reference', ambiguous.pattern === 'clarification' && ambiguous.reference_resolution.status === 'ambiguous', ambiguous));

  const side = resolveConversationPattern(patternInput('Antes, vocês têm valet?', { active_journey: 'reservation', active_step: 'collect_time', pending_question: 'time' }));
  results.push(mutationResult('MUT-007', 'side_question', side.pattern === 'side_question' && side.journey_action === 'none', side));

  const topic = resolveConversationPattern(patternInput('Também faltou um item.', { active_journey: 'reservation', candidate_intents: ['occurrence.missing_item'] }));
  results.push(mutationResult('MUT-008', 'topic_change', topic.journey_action === 'suspend' && topic.target_journey === 'missing_item', topic));

  const resume = resolveConversationPattern(patternInput('Voltando à reserva.', { active_journey: 'missing_item', suspended_journeys: [{ journey_id: 'reservation', active_step: 'collect_time', pending_question: 'time' }] }));
  results.push(mutationResult('MUT-009', 'resume', resume.journey_action === 'resume' && resume.target_journey === 'reservation', resume));

  const greeting = resolveConversationPattern(patternInput('Oi.'));
  results.push(mutationResult('MUT-010', 'greeting', greeting.pattern === 'greeting' && greeting.journey_action === 'none', greeting));

  const chitchat = resolveConversationPattern(patternInput('Obrigado.'));
  results.push(mutationResult('MUT-011', 'chitchat', chitchat.pattern === 'chitchat' && chitchat.target_journey === null, chitchat));

  const oracleInput = patternInput('Oi.', { scenario_id: 'TATA-SC-SYNTHETIC' });
  results.push(mutationResult('MUT-012', 'oracle_isolation', validatePatternInput(oracleInput).accepted === false, validatePatternInput(oracleInput)));

  const fullState = Object.freeze({
    ...initialPatternJourneyState('SIM-MUTATION-STACK'), active_journey: 'reservation',
    suspended_journeys: Object.freeze([
      { journey_id: 'waitlist', completed_steps: [], collected_facts: {} },
      { journey_id: 'quality', completed_steps: [], collected_facts: {} },
      { journey_id: 'delay', completed_steps: [], collected_facts: {} }
    ])
  });
  let stackRejected = false;
  try { applyPatternDecision(fullState, topic); } catch (error) { stackRejected = error.code === 'JOURNEY_STACK_LIMIT'; }
  results.push(mutationResult('MUT-013', 'stack_limit', stackRejected, { rejected: stackRejected }));

  const changedQuestion = validateApprovedWriterOutput({ text: 'Pode informar seu endereço?' }, baseEnvelope());
  results.push(mutationResult('MUT-014', 'writer_question', changedQuestion.reason === 'WRITER_QUESTION_CHANGED', changedQuestion));

  const unknownCost = evaluateCostPolicy({ ...ZERO_EXTERNAL_COST_POLICY, verification_status: 'unknown', evidence: [], unknowns: [] });
  results.push(mutationResult('MUT-015', 'financial_gate', unknownCost.allowed === false, unknownCost));

  const identity = resolveConversationPattern(patternInput('Quero meu pedido de sempre.', {
    customer_context: {
      schema_version: 'deliveryos-customer-context-v1', status: 'ambiguous', identity_status: 'ambiguous', customer_id: null,
      consent_status: 'unknown', confirmed_facts: [], inferred_facts: [], declared_restrictions: [], unknowns: ['identity'], provenance: ['synthetic']
    }
  }));
  results.push(mutationResult('MUT-016', 'identity', identity.pattern === 'clarification' && identity.requires_clarification, identity));

  return Object.freeze({
    schema_version: 'deliveryos-pattern-mutation-report-v1',
    total: results.length,
    killed: results.filter((item) => item.killed).length,
    survived: results.filter((item) => !item.killed).map((item) => item.mutation_id),
    results: Object.freeze(results)
  });
}

module.exports = { runPatternMutationCertification };
