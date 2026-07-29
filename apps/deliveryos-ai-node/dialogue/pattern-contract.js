'use strict';

const PATTERNS = Object.freeze([
  'greeting', 'chitchat', 'continue', 'correction', 'clarification',
  'side_question', 'interrupt', 'resume', 'switch_topic', 'repeat',
  'cancel', 'close', 'handoff'
]);
const JOURNEY_ACTIONS = Object.freeze(['none', 'start', 'advance', 'suspend', 'resume', 'backtrack', 'complete', 'cancel']);
const PATTERN_INPUT_KEYS = Object.freeze([
  'current_message', 'normalized_message', 'active_journey', 'active_step',
  'pending_question', 'collected_facts', 'suspended_journeys',
  'side_questions', 'last_assistant_act', 'recent_turns',
  'candidate_intents', 'candidate_entities'
]);
const PATTERN_DECISION_KEYS = Object.freeze([
  'schema_version', 'pattern', 'confidence', 'journey_action',
  'target_journey', 'target_step', 'facts_added', 'facts_corrected',
  'reference_resolution', 'question_to_answer', 'question_to_resume',
  'requires_clarification', 'clarification_question', 'collision_log'
]);
const FORBIDDEN_KEY = /(?:phone|telefone|email|cpf|document|address|endereco|customer_name|nome|token|cookie|credential|password|senha|raw_message|full_order)/iu;
const FORBIDDEN_VALUE = /(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}\b|\b(?:bearer|token|cookie|password|senha)\s*[:=]\s*\S+)/iu;

function isScalar(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function sanitizePatternFacts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => (
    !FORBIDDEN_KEY.test(key)
    && isScalar(item)
    && (typeof item !== 'string' || (item.length <= 300 && !FORBIDDEN_VALUE.test(item)))
  )));
}

function validatePatternInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { accepted: false, reason: 'PATTERN_INPUT_NOT_OBJECT' };
  const missing = PATTERN_INPUT_KEYS.filter((key) => !Object.hasOwn(value, key));
  if (missing.length) return { accepted: false, reason: 'PATTERN_INPUT_KEYS_INVALID', missing };
  if (typeof value.current_message !== 'string' || typeof value.normalized_message !== 'string') return { accepted: false, reason: 'PATTERN_MESSAGE_INVALID' };
  if (![value.active_journey, value.active_step].every((item) => item === null || typeof item === 'string')) return { accepted: false, reason: 'PATTERN_JOURNEY_INVALID' };
  if (!(value.pending_question === null || typeof value.pending_question === 'string' || (typeof value.pending_question === 'object' && !Array.isArray(value.pending_question)))) return { accepted: false, reason: 'PATTERN_PENDING_QUESTION_INVALID' };
  if (!value.collected_facts || typeof value.collected_facts !== 'object' || Array.isArray(value.collected_facts)) return { accepted: false, reason: 'PATTERN_FACTS_INVALID' };
  if (![value.suspended_journeys, value.side_questions, value.recent_turns, value.candidate_intents, value.candidate_entities].every(Array.isArray)) return { accepted: false, reason: 'PATTERN_ARRAY_INVALID' };
  if (typeof value.last_assistant_act !== 'string') return { accepted: false, reason: 'PATTERN_ASSISTANT_ACT_INVALID' };
  return { accepted: true, reason: null, input: Object.freeze({ ...value, collected_facts: Object.freeze(sanitizePatternFacts(value.collected_facts)) }) };
}

function validatePatternDecision(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { accepted: false, reason: 'PATTERN_DECISION_NOT_OBJECT' };
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...PATTERN_DECISION_KEYS].sort())) return { accepted: false, reason: 'PATTERN_DECISION_KEYS_INVALID' };
  if (value.schema_version !== 'deliveryos-conversation-pattern-decision-v1') return { accepted: false, reason: 'PATTERN_DECISION_VERSION_INVALID' };
  if (!PATTERNS.includes(value.pattern) || !JOURNEY_ACTIONS.includes(value.journey_action)) return { accepted: false, reason: 'PATTERN_DECISION_ENUM_INVALID' };
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) return { accepted: false, reason: 'PATTERN_DECISION_CONFIDENCE_INVALID' };
  if (![value.target_journey, value.target_step, value.question_to_answer, value.question_to_resume, value.clarification_question].every((item) => item === null || typeof item === 'string')) return { accepted: false, reason: 'PATTERN_DECISION_SCALAR_INVALID' };
  if (typeof value.requires_clarification !== 'boolean' || !Array.isArray(value.collision_log)) return { accepted: false, reason: 'PATTERN_DECISION_METADATA_INVALID' };
  if (![value.facts_added, value.facts_corrected, value.reference_resolution].every((item) => item && typeof item === 'object' && !Array.isArray(item))) return { accepted: false, reason: 'PATTERN_DECISION_MAP_INVALID' };
  if (JSON.stringify(sanitizePatternFacts(value.facts_added)) !== JSON.stringify(value.facts_added) || JSON.stringify(sanitizePatternFacts(value.facts_corrected)) !== JSON.stringify(value.facts_corrected)) return { accepted: false, reason: 'PATTERN_DECISION_FACTS_UNSAFE' };
  return { accepted: true, reason: null, output: Object.freeze(value) };
}

module.exports = {
  PATTERNS,
  JOURNEY_ACTIONS,
  PATTERN_INPUT_KEYS,
  PATTERN_DECISION_KEYS,
  FORBIDDEN_KEY,
  FORBIDDEN_VALUE,
  sanitizePatternFacts,
  validatePatternInput,
  validatePatternDecision
};
