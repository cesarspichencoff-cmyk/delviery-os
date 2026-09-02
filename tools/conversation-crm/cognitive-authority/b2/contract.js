'use strict';

const crypto = require('node:crypto');

const RELATIONS = Object.freeze(['CONTINUE', 'REFINE', 'CORRECT', 'SWITCH', 'INTERRUPT', 'RESUME', 'OPEN']);
const MOVES = Object.freeze(['ANSWER', 'EXPAND', 'EXPLAIN', 'COMPARE', 'CLARIFY', 'REPAIR', 'DISCOVER', 'SWITCH_FLOW', 'RESUME_FLOW']);
const TOOLS = Object.freeze(['NONE', 'CATALOG_SEARCH', 'DETAIL_LOOKUP', 'PRICE_LOOKUP', 'RESTAURANT_INFO', 'RESERVATION_INFO', 'SAFETY_GATE', 'OTHER_ALLOWED_TOOL']);
const SAFETY = Object.freeze(['NONE', 'PREVENTIVE', 'URGENT']);
const REFERENCE_STATUS = Object.freeze(['NOT_REQUIRED', 'RESOLVED', 'NEEDS_CLARIFICATION', 'NEEDS_CONTEXT_LOOKUP']);
const COMMITMENT_KINDS = Object.freeze(['GOAL', 'CONSTRAINT', 'REFERENCE', 'REPAIR', 'QUESTION']);

const PLAN_KEYS = Object.freeze([
  'relation_to_history', 'conversational_move', 'tool_requirement', 'user_goal',
  'what_changed', 'repair', 'reference', 'safety_priority', 'next_best_step'
]);

const PLAN_OPTIONAL_KEYS = Object.freeze(['required_response_commitments']);

const PLAN_SCHEMA = Object.freeze({
  name: 'deliveryos_b2_cognitive_plan_v2',
  strict: true,
  required: PLAN_KEYS,
  properties: {
    relation_to_history: RELATIONS,
    conversational_move: MOVES,
    tool_requirement: TOOLS,
    safety_priority: SAFETY,
    reference_status: REFERENCE_STATUS
  }
});

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function canonicalHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function shortText(value, maximum = 500) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= maximum;
}

function validatePlan(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { accepted: false, reason: 'B2_PLAN_NOT_OBJECT' };
  const keys = Object.keys(value);
  if (PLAN_KEYS.some((key) => !keys.includes(key)) || keys.some((key) => !PLAN_KEYS.includes(key) && !PLAN_OPTIONAL_KEYS.includes(key))) {
    return { accepted: false, reason: 'B2_PLAN_KEYS_INVALID' };
  }
  if (!RELATIONS.includes(value.relation_to_history)) return { accepted: false, reason: 'B2_RELATION_INVALID' };
  if (!MOVES.includes(value.conversational_move)) return { accepted: false, reason: 'B2_MOVE_INVALID' };
  if (!TOOLS.includes(value.tool_requirement)) return { accepted: false, reason: 'B2_TOOL_INVALID' };
  if (!SAFETY.includes(value.safety_priority)) return { accepted: false, reason: 'B2_SAFETY_INVALID' };
  if (!shortText(value.user_goal) || !shortText(value.what_changed) || !shortText(value.next_best_step, 700)) {
    return { accepted: false, reason: 'B2_PLAN_TEXT_INVALID' };
  }
  if (!value.repair || typeof value.repair !== 'object' || Array.isArray(value.repair)
    || JSON.stringify(Object.keys(value.repair).sort()) !== JSON.stringify(['acknowledgement', 'required'].sort())
    || typeof value.repair.required !== 'boolean'
    || (value.repair.required ? !shortText(value.repair.acknowledgement) : value.repair.acknowledgement !== null)) {
    return { accepted: false, reason: 'B2_REPAIR_INVALID' };
  }
  if (!value.reference || typeof value.reference !== 'object' || Array.isArray(value.reference)
    || JSON.stringify(Object.keys(value.reference).sort()) !== JSON.stringify(['required', 'status', 'target'].sort())
    || typeof value.reference.required !== 'boolean'
    || !REFERENCE_STATUS.includes(value.reference.status)
    || (value.reference.required && value.reference.status === 'RESOLVED' && !shortText(value.reference.target))
    || (!value.reference.required && (value.reference.status !== 'NOT_REQUIRED' || value.reference.target !== null))) {
    return { accepted: false, reason: 'B2_REFERENCE_INVALID' };
  }
  if (value.safety_priority === 'URGENT' && value.conversational_move !== 'ANSWER') {
    return { accepted: false, reason: 'B2_URGENT_MOVE_INVALID' };
  }
  if (value.required_response_commitments !== undefined) {
    if (!Array.isArray(value.required_response_commitments) || value.required_response_commitments.length > 20) {
      return { accepted: false, reason: 'B2_COMMITMENTS_INVALID' };
    }
    for (const item of value.required_response_commitments) {
      if (!item || typeof item !== 'object' || Array.isArray(item)
        || JSON.stringify(Object.keys(item).sort()) !== JSON.stringify(['content', 'kind'].sort())
        || !COMMITMENT_KINDS.includes(item.kind)
        || !shortText(item.content, 500)) {
        return { accepted: false, reason: 'B2_COMMITMENTS_INVALID' };
      }
    }
  }
  return { accepted: true, reason: null, plan: Object.freeze(structuredClone(value)), hash: canonicalHash(value) };
}

function buildBlindPlannerPacket(input = {}) {
  return Object.freeze({
    schema_version: 'deliveryos-b2-planner-input-v1',
    transcript: Array.isArray(input.transcript) ? input.transcript : [],
    compact_state: input.compact_state || null,
    references: input.references || {},
    confirmed_facts: Array.isArray(input.confirmed_facts)
      ? input.confirmed_facts
      : (Array.isArray(input.established_facts) ? input.established_facts : []),
    available_capabilities: Array.isArray(input.available_capabilities) ? input.available_capabilities : [],
    limits: Array.isArray(input.limits) ? input.limits : [],
    safety_state: input.safety_state || 'NONE',
    current_message: String(input.current_message || '')
  });
}

module.exports = {
  RELATIONS, MOVES, TOOLS, SAFETY, REFERENCE_STATUS, COMMITMENT_KINDS,
  PLAN_SCHEMA, validatePlan, buildBlindPlannerPacket, canonicalHash
};

