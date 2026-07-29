'use strict';


const { ALLOWED_DIALOGUE_TOOLS } = require('./tool-router');
const DIALOGUE_ACTS = Object.freeze([
  'greet', 'chitchat', 'start_journey', 'continue_journey', 'answer_side_question',
  'suspend_journey', 'resume_journey', 'switch_topic', 'correct_information',
  'clarify_reference', 'repeat', 'cancel', 'close', 'handoff'
]);
const SOCIAL_ACTS = Object.freeze(['none', 'greet', 'return_greeting', 'thank', 'acknowledge', 'apologize', 'farewell']);
const DIRECTOR_KEYS = Object.freeze([
  'dialogue_act', 'social_act', 'active_journey', 'topic_changed',
  'return_to_previous_topic', 'facts_added', 'facts_corrected',
  'references_resolved', 'customer_need', 'question_to_answer',
  'next_required_information', 'knowledge_queries', 'requested_action', 'confidence'
]);

function fail(reason) { return { accepted: false, reason }; }
function isObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function isNullableString(value) { return value === null || (typeof value === 'string' && value.length <= 500); }
function safeMap(value) {
  if (!isObject(value)) return false;
  return Object.entries(value).every(([key, item]) => (
    /^[A-Za-z0-9._:-]{1,80}$/u.test(key)
    && !/reasoning|chain_of_thought|cot/iu.test(key)
    && (item === null || ['string', 'number', 'boolean'].includes(typeof item))
    && (typeof item !== 'string' || item.length <= 500)
  ));
}

function validateDirectorOutput(value) {
  if (!isObject(value)) return fail('DIRECTOR_NOT_OBJECT');
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...DIRECTOR_KEYS].sort())) return fail('DIRECTOR_KEYS_INVALID');
  if (!DIALOGUE_ACTS.includes(value.dialogue_act)) return fail('DIRECTOR_DIALOGUE_ACT_INVALID');
  if (!SOCIAL_ACTS.includes(value.social_act)) return fail('DIRECTOR_SOCIAL_ACT_INVALID');
  if (!isNullableString(value.active_journey) || (value.active_journey && !/^[A-Za-z0-9._:-]+$/u.test(value.active_journey))) return fail('DIRECTOR_JOURNEY_INVALID');
  if (typeof value.topic_changed !== 'boolean' || typeof value.return_to_previous_topic !== 'boolean') return fail('DIRECTOR_BOOLEAN_INVALID');
  if (!safeMap(value.facts_added) || !safeMap(value.facts_corrected) || !safeMap(value.references_resolved)) return fail('DIRECTOR_FACTS_INVALID');
  if (typeof value.customer_need !== 'string' || value.customer_need.length > 500) return fail('DIRECTOR_CUSTOMER_NEED_INVALID');
  if (!isNullableString(value.question_to_answer) || !isNullableString(value.next_required_information)) return fail('DIRECTOR_QUESTION_INVALID');
  if (!Array.isArray(value.knowledge_queries) || value.knowledge_queries.length > 8 || value.knowledge_queries.some((query) => typeof query !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/u.test(query))) return fail('DIRECTOR_KNOWLEDGE_QUERY_INVALID');
  if (value.requested_action !== null) {
    if (!isObject(value.requested_action) || !ALLOWED_DIALOGUE_TOOLS.includes(value.requested_action.tool) || !isObject(value.requested_action.arguments || {})) return fail('DIRECTOR_ACTION_INVALID');
  }
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) return fail('DIRECTOR_CONFIDENCE_INVALID');
  return { accepted: true, reason: null, output: value };
}

function validateDirectorSemantics(value, input = {}) {
  const checked = validateDirectorOutput(value);
  if (!checked.accepted) return checked;
  const state = input.journey_state || {};
  const active = state.active_journey || null;
  const suspended = Array.isArray(state.suspended_journeys) ? state.suspended_journeys : [];
  const continuationActs = new Set(['continue_journey', 'answer_side_question', 'suspend_journey', 'correct_information', 'repeat']);
  if (active && continuationActs.has(value.dialogue_act) && value.active_journey !== active) return fail('DIRECTOR_JOURNEY_STATE_CONFLICT');
  if (value.dialogue_act === 'continue_journey' && !active) return fail('DIRECTOR_JOURNEY_MISSING');
  if (value.dialogue_act === 'resume_journey' && !suspended.some((journey) => journey?.journey_id === value.active_journey)) return fail('DIRECTOR_RESUME_TARGET_INVALID');
  if (value.dialogue_act === 'switch_topic' && (!active || !value.active_journey || value.active_journey === active)) return fail('DIRECTOR_TOPIC_SWITCH_INVALID');
  if (value.next_required_information && Object.hasOwn(state.collected_facts || {}, value.next_required_information)) return fail('DIRECTOR_INFORMATION_ALREADY_KNOWN');
  return checked;
}

const DIRECTOR_JSON_SCHEMA = Object.freeze({
  name: 'deliveryos_conversation_director_v1',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: DIRECTOR_KEYS,
    properties: {
      dialogue_act: { type: 'string', enum: DIALOGUE_ACTS },
      social_act: { type: 'string', enum: SOCIAL_ACTS },
      active_journey: { type: ['string', 'null'] },
      topic_changed: { type: 'boolean' },
      return_to_previous_topic: { type: 'boolean' },
      facts_added: { type: 'object' },
      facts_corrected: { type: 'object' },
      references_resolved: { type: 'object' },
      customer_need: { type: 'string' },
      question_to_answer: { type: ['string', 'null'] },
      next_required_information: { type: ['string', 'null'] },
      knowledge_queries: { type: 'array', items: { type: 'string' } },
      requested_action: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object',
            additionalProperties: false,
            required: ['tool', 'arguments'],
            properties: { tool: { type: 'string' }, arguments: { type: 'object' } }
          }
        ]
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 }
    }
  }
});

module.exports = { DIALOGUE_ACTS, SOCIAL_ACTS, DIRECTOR_KEYS, DIRECTOR_JSON_SCHEMA, validateDirectorOutput, validateDirectorSemantics };
