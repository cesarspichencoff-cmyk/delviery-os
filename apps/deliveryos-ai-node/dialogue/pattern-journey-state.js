'use strict';

const { MAX_JOURNEY_STACK_DEPTH, journeyGraph } = require('./journey-graph-catalog');
const { sanitizePatternFacts, validatePatternDecision } = require('./pattern-contract');

function initialPatternJourneyState(conversationId) {
  return Object.freeze({
    schema_version: 'deliveryos-pattern-journey-state-v1',
    conversation_id: String(conversationId || ''),
    version: 0,
    active_journey: null,
    active_step: null,
    pending_question: null,
    collected_facts: Object.freeze({}),
    suspended_journeys: Object.freeze([]),
    side_question_stack: Object.freeze([]),
    side_questions: Object.freeze([]),
    journey_history: Object.freeze([]),
    completed_steps: Object.freeze({}),
    corrections: Object.freeze([]),
    unresolved_references: Object.freeze([]),
    pattern_collisions: Object.freeze([]),
    last_assistant_act: '',
    last_pattern: null
  });
}

function questionForStep(journeyId, step) {
  return journeyGraph(journeyId)?.nodes.find((node) => node.node_id === step)?.question_key || null;
}

function journeySnapshot(state, reason) {
  return Object.freeze({
    journey_id: state.active_journey,
    active_step: state.active_step,
    pending_question: state.pending_question,
    collected_facts: Object.freeze({ ...state.collected_facts }),
    completed_steps: Object.freeze([...(state.completed_steps[state.active_journey] || [])]),
    suspended_at_version: state.version + 1,
    reason
  });
}

function completedWith(state, journeyId, step) {
  const output = Object.fromEntries(Object.entries(state.completed_steps).map(([id, values]) => [id, [...values]]));
  if (journeyId && step) output[journeyId] = [...new Set([...(output[journeyId] || []), step])];
  return Object.freeze(Object.fromEntries(Object.entries(output).map(([id, values]) => [id, Object.freeze(values)])));
}

function applyPatternDecision(state, rawDecision) {
  const checked = validatePatternDecision(rawDecision);
  if (!checked.accepted) throw Object.assign(new Error(checked.reason), { code: checked.reason });
  const decision = checked.output;
  let activeJourney = state.active_journey;
  let activeStep = state.active_step;
  let pendingQuestion = state.pending_question;
  let collectedFacts = { ...state.collected_facts };
  let suspended = state.suspended_journeys.map((item) => ({ ...item, collected_facts: { ...item.collected_facts }, completed_steps: [...(item.completed_steps || [])] }));
  let sideStack = [...state.side_question_stack];
  const sideQuestions = [...state.side_questions];
  const history = [...state.journey_history];
  const corrections = [...state.corrections];
  const unresolved = [...state.unresolved_references];
  let completed = state.completed_steps;

  if (decision.pattern === 'clarification' && decision.reference_resolution.status === 'ambiguous') {
    unresolved.push(Object.freeze({ version: state.version + 1, candidates: decision.reference_resolution.candidates || 0 }));
  }
  if (Object.keys(decision.facts_corrected).length) {
    const previous = Object.fromEntries(Object.keys(decision.facts_corrected).map((field) => [field, collectedFacts[field] ?? null]));
    corrections.push(Object.freeze({ version: state.version + 1, previous: Object.freeze(previous), current: Object.freeze({ ...decision.facts_corrected }) }));
  }

  if (decision.journey_action === 'suspend' && decision.target_journey !== state.active_journey) {
    if (state.active_journey) {
      if (suspended.length >= MAX_JOURNEY_STACK_DEPTH) throw Object.assign(new Error('JOURNEY_STACK_LIMIT'), { code: 'JOURNEY_STACK_LIMIT' });
      suspended.push(journeySnapshot(state, decision.pattern));
    }
    activeJourney = decision.target_journey;
    activeStep = decision.target_step;
    pendingQuestion = questionForStep(activeJourney, activeStep);
    collectedFacts = { ...decision.facts_added, ...decision.facts_corrected };
  } else if (decision.journey_action === 'start') {
    activeJourney = decision.target_journey;
    activeStep = decision.target_step;
    pendingQuestion = questionForStep(activeJourney, activeStep);
    collectedFacts = { ...decision.facts_added, ...decision.facts_corrected };
  } else if (decision.journey_action === 'resume') {
    const index = suspended.map((item) => item.journey_id).lastIndexOf(decision.target_journey);
    if (index >= 0) {
      const selected = suspended[index];
      suspended = suspended.filter((_, itemIndex) => itemIndex !== index);
      if (state.active_journey && state.active_journey !== selected.journey_id) {
        history.push(Object.freeze({ ...journeySnapshot(state, 'resume_previous'), status: 'interrupted' }));
      }
      activeJourney = selected.journey_id;
      activeStep = decision.target_step || selected.active_step;
      pendingQuestion = questionForStep(activeJourney, activeStep) || selected.pending_question;
      collectedFacts = { ...selected.collected_facts, ...decision.facts_added, ...decision.facts_corrected };
      completed = Object.freeze({ ...completed, [activeJourney]: Object.freeze([...(selected.completed_steps || [])]) });
    }
  } else if (['complete', 'cancel'].includes(decision.journey_action)) {
    if (state.active_journey) history.push(Object.freeze({ ...journeySnapshot(state, decision.pattern), status: decision.journey_action === 'cancel' ? 'cancelled' : 'completed' }));
    activeJourney = null;
    activeStep = null;
    pendingQuestion = null;
    collectedFacts = {};
  } else {
    const merged = { ...collectedFacts, ...decision.facts_added, ...decision.facts_corrected };
    if (decision.journey_action === 'advance' && state.active_journey && state.active_step && decision.target_step !== state.active_step) {
      completed = completedWith(state, state.active_journey, state.active_step);
    }
    activeJourney = decision.target_journey || activeJourney;
    activeStep = decision.target_step || activeStep;
    pendingQuestion = questionForStep(activeJourney, activeStep) || pendingQuestion;
    collectedFacts = merged;
  }

  if (decision.pattern === 'side_question') {
    const item = Object.freeze({
      version: state.version + 1,
      question: decision.question_to_answer,
      journey_id: state.active_journey,
      step: state.active_step,
      pending_question: state.pending_question,
      status: 'answered_and_resumed'
    });
    sideStack.push(item);
    sideQuestions.push(item);
    sideStack = sideStack.slice(0, -1);
    activeJourney = state.active_journey;
    activeStep = state.active_step;
    pendingQuestion = state.pending_question;
    collectedFacts = { ...state.collected_facts };
  }

  return Object.freeze({
    ...state,
    version: state.version + 1,
    active_journey: activeJourney,
    active_step: activeStep,
    pending_question: pendingQuestion,
    collected_facts: Object.freeze(sanitizePatternFacts(collectedFacts)),
    suspended_journeys: Object.freeze(suspended.map((item) => Object.freeze({ ...item, collected_facts: Object.freeze({ ...item.collected_facts }), completed_steps: Object.freeze([...(item.completed_steps || [])]) }))),
    side_question_stack: Object.freeze(sideStack),
    side_questions: Object.freeze(sideQuestions),
    journey_history: Object.freeze(history),
    completed_steps: completed,
    corrections: Object.freeze(corrections),
    unresolved_references: Object.freeze(unresolved),
    pattern_collisions: Object.freeze([...state.pattern_collisions, ...decision.collision_log.map((item) => Object.freeze({ version: state.version + 1, ...item }))]),
    last_assistant_act: decision.pattern,
    last_pattern: decision.pattern
  });
}

module.exports = {
  initialPatternJourneyState,
  questionForStep,
  journeySnapshot,
  applyPatternDecision
};
