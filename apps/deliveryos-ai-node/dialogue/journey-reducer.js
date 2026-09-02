'use strict';

function initialJourneyState(conversationId) {
  return Object.freeze({
    schema_version: 'deliveryos-journey-state-v1',
    conversation_id: conversationId,
    version: 0,
    social_state: 'none',
    active_journey: null,
    active_step: null,
    collected_facts: {},
    pending_question: null,
    suspended_journeys: [],
    side_questions: [],
    corrections: [],
    unresolved_references: [],
    last_successful_action: null,
    last_directive: null
  });
}

function suspendedFrom(state) {
  return {
    journey_id: state.active_journey,
    active_step: state.active_step,
    pending_question: state.pending_question,
    collected_facts: { ...state.collected_facts }
  };
}

function applyDirective(state, directive) {
  let activeJourney = state.active_journey;
  let activeStep = state.active_step;
  let pendingQuestion = directive.next_required_information ?? state.pending_question;
  let suspended = state.suspended_journeys.map((item) => ({ ...item, collected_facts: { ...item.collected_facts } }));
  const sideQuestions = [...state.side_questions];
  const corrections = [...state.corrections];
  let collectedFacts = { ...state.collected_facts, ...directive.facts_added, ...directive.facts_corrected };

  if (Object.keys(directive.facts_corrected).length) {
    corrections.push({ version: state.version + 1, fields: { ...directive.facts_corrected } });
  }

  if (['start_journey', 'switch_topic'].includes(directive.dialogue_act)) {
    if (state.active_journey && state.active_journey !== directive.active_journey) suspended.push(suspendedFrom(state));
    activeJourney = directive.active_journey;
    activeStep = directive.next_required_information;
  } else if (directive.dialogue_act === 'suspend_journey') {
    if (state.active_journey) suspended.push(suspendedFrom(state));
    activeJourney = null;
    activeStep = null;
    pendingQuestion = null;
  } else if (directive.dialogue_act === 'resume_journey') {
    const index = suspended.map((item) => item.journey_id).lastIndexOf(directive.active_journey);
    if (index >= 0) {
      const resumed = suspended[index];
      suspended = suspended.filter((_, itemIndex) => itemIndex !== index);
      activeJourney = resumed.journey_id;
      activeStep = resumed.active_step;
      pendingQuestion = directive.next_required_information || resumed.pending_question;
      collectedFacts = { ...resumed.collected_facts, ...collectedFacts };
    }
  } else if (directive.dialogue_act === 'answer_side_question') {
    sideQuestions.push({
      version: state.version + 1,
      question: directive.question_to_answer,
      knowledge_queries: [...directive.knowledge_queries],
      return_to_previous_topic: directive.return_to_previous_topic
    });
    pendingQuestion = directive.return_to_previous_topic ? (directive.next_required_information || state.pending_question) : directive.next_required_information;
  } else if (['cancel', 'close'].includes(directive.dialogue_act)) {
    activeJourney = null;
    activeStep = null;
    pendingQuestion = null;
  } else if (directive.active_journey) {
    activeJourney = directive.active_journey;
    activeStep = directive.next_required_information || activeStep;
  }

  return Object.freeze({
    ...state,
    version: state.version + 1,
    social_state: directive.social_act,
    active_journey: activeJourney,
    active_step: activeStep,
    collected_facts: Object.freeze(collectedFacts),
    pending_question: pendingQuestion,
    suspended_journeys: Object.freeze(suspended),
    side_questions: Object.freeze(sideQuestions),
    corrections: Object.freeze(corrections),
    unresolved_references: directive.dialogue_act === 'clarify_reference'
      ? Object.freeze([...state.unresolved_references, directive.customer_need])
      : state.unresolved_references,
    last_directive: directive.dialogue_act
  });
}

function applyActionResult(state, result = {}) {
  if (!result.confirmed) return state;
  return Object.freeze({ ...state, version: state.version + 1, last_successful_action: Object.freeze({ action: result.action, result_id: result.result_id }) });
}

module.exports = { initialJourneyState, suspendedFrom, applyDirective, applyActionResult };
