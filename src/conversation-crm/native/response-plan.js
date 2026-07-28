'use strict';

const { deepFreeze } = require('./catalogs/operational');
const { selectStrategyId, strategyFor } = require('./response-strategy-catalog');

const RESPONSE_GOALS = Object.freeze(['inform', 'clarify', 'acknowledge', 'guide', 'handoff', 'protect', 'close']);
const CONVERSATION_STAGES = Object.freeze(['opening', 'continuation', 'clarification', 'resolution', 'reopening']);
const CUSTOMER_STATES = Object.freeze(['neutral', 'interested', 'confused', 'frustrated', 'urgent', 'sensitive']);
const GRAVITIES = Object.freeze(['informational', 'operational', 'sensitive', 'critical']);
const LENGTHS = Object.freeze(['short', 'medium', 'careful']);
const EMOJI_POLICIES = Object.freeze(['none', 'optional_one', 'celebratory_two']);
const SAFE_ENTITY_FIELDS = new Set([
  'party_size',
  'arrival_estimate',
  'pickup_time',
  'requested_items',
  'order_channel',
  'item_name',
  'evidence_available',
  'people_affected'
]);
const STANDARD_PROHIBITED = Object.freeze([
  'inventar_confirmacao',
  'inventar_fato',
  'oferecer_compensacao_automatica',
  'diagnosticar',
  'atribuir_causalidade',
  'expor_informacao_tecnica'
]);

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function conversationStage(conversation = {}, result = {}, classification = {}) {
  if (conversation.reopening === true) return 'reopening';
  if (result.status === 'confirmed' && classification.closure?.expected_state === 'resolved') return 'resolution';
  if (Number(conversation.turn_order) > 1) return 'continuation';
  if (classification.intent === 'conversation.ambiguous') return 'clarification';
  return 'opening';
}

function customerState(classification = {}, sourceText = '') {
  const text = normalizeText(sourceText);
  if (classification.policies?.food_safety || classification.severity === 'critical') return 'sensitive';
  if (/\b(?:dificuldade para respirar|desmaio|urgente|socorro)\b/u.test(text)) return 'urgent';
  if (/\b(?:frustrad|irritad|absurdo|decepcionad|chatead)\b/u.test(text)) return 'frustrated';
  if (classification.intent === 'conversation.ambiguous') return 'confused';
  if (/\b(?:quero conhecer|gostei|adorei|como funciona|pode me explicar)\b/u.test(text)) return 'interested';
  return 'neutral';
}

function gravityFor(classification = {}) {
  if (classification.policies?.food_safety || classification.severity === 'critical') return 'critical';
  if (['sensitive', 'high'].includes(classification.severity) || ['E3', 'E4'].includes(classification.escalation)) return 'sensitive';
  if (classification.severity === 'operational' || ['E1', 'E2'].includes(classification.escalation)) return 'operational';
  return 'informational';
}

function fallbackReason(classification = {}, result = {}, strategyId) {
  const entities = Object.values(classification.entities || {});
  if (entities.some((entity) => entity?.state === 'conflict') || result.status === 'conflict') return 'context_conflict';
  if (classification.intent === 'conversation.ambiguous') return 'intent_ambiguous';
  if (result.status === 'degraded') return 'stale_operational_information';
  if (result.status === 'unavailable') return 'action_unavailable';
  if (result.status === 'failed') return 'safe_internal_error';
  if (result.status === 'processing') return 'integration_not_observable';
  if (classification.intent?.startsWith('information.') && !classification.information_source) return 'public_fact_unconfirmed';
  if (strategyId === 'capability_limit' && classification.intent?.startsWith('information.')) return 'public_fact_unconfirmed';
  if (strategyId === 'handoff' || (classification.escalation !== 'E0' && result.status !== 'confirmed')) return 'human_assistance_needed';
  return null;
}

function safeEntityFacts(classification = {}) {
  const facts = [];
  for (const [field, entity] of Object.entries(classification.entities || {})) {
    if (!SAFE_ENTITY_FIELDS.has(field) || entity == null || typeof entity !== 'object') continue;
    if (['missing', 'conflict'].includes(entity.state) || entity.value == null || typeof entity.value === 'object') continue;
    facts.push({ field, value: entity.value, source: entity.provenance || 'conversation', certainty: entity.state || 'provided' });
  }
  return facts;
}

function extractSurfaceFacts(authorizedText = '') {
  const text = String(authorizedText || '');
  const links = [...text.matchAll(/https?:\/\/[^\s)\]}>,]+/giu)].map((match) => match[0].replace(/[.!?]+$/u, ''));
  const numbers = [...text.replace(/https?:\/\/\S+/giu, ' ').matchAll(/(?:R\$\s*)?\d+(?:[.,]\d+)?/giu)].map((match) => match[0].replace(/\s+/gu, ' ').trim());
  return { text, links: [...new Set(links)], numbers: [...new Set(numbers)] };
}

function buildResponsePlan(input = {}) {
  const classification = input.classification || {};
  const result = input.result || { status: 'unknown' };
  const conversation = input.conversation || {};
  const stage = conversationStage(conversation, result, classification);
  const strategyId = selectStrategyId({ classification, conversation_stage: stage, result_status: result.status });
  const strategy = strategyFor(strategyId);
  const asked = new Set(conversation.asked_fields || []);
  const mandatoryQuestions = [...new Set(classification.fields_missing || [])].filter((field) => !asked.has(field));
  const newFacts = safeEntityFacts(classification);
  const knownFacts = Array.isArray(conversation.known_facts) ? conversation.known_facts.filter((fact) => fact && typeof fact === 'object') : [];
  const authorizedSurface = extractSurfaceFacts(input.authorized_text);
  const verifiedActions = result.status === 'confirmed' && classification.action ? [classification.action] : [];
  const pendingActions = result.status === 'confirmed' || !classification.action ? [] : [classification.action];
  const gravity = gravityFor(classification);
  const plan = {
    version: '1.0.0',
    response_goal: strategy.response_goal,
    conversation_stage: stage,
    customer_state: customerState(classification, conversation.source_text),
    gravity,
    known_facts: knownFacts,
    new_facts: newFacts,
    verified_actions: verifiedActions,
    pending_actions: pendingActions,
    mandatory_questions: mandatoryQuestions,
    optional_information: [],
    prohibited_claims: [...new Set([...STANDARD_PROHIBITED, ...(classification.prohibited_responses || []), ...strategy.prohibited_claims])],
    length: strategy.length,
    emoji_policy: gravity === 'critical' || gravity === 'sensitive' ? 'none' : strategy.emoji_policy,
    tone_profile: 'tata_warm',
    strategy_id: strategyId,
    fallback_reason: fallbackReason(classification, result, strategyId),
    intent: classification.intent || 'conversation.ambiguous',
    subintent: classification.subintent || null,
    result_status: result.status || 'unknown',
    handoff_status: input.handoff?.status || null,
    authorized_surface: authorizedSurface,
    strategy_contract: strategy
  };
  validateResponsePlan(plan);
  return deepFreeze(plan);
}

function validateResponsePlan(plan) {
  const required = [
    'version', 'response_goal', 'conversation_stage', 'customer_state', 'gravity',
    'known_facts', 'new_facts', 'verified_actions', 'pending_actions',
    'mandatory_questions', 'optional_information', 'prohibited_claims', 'length',
    'emoji_policy', 'tone_profile', 'strategy_id'
  ];
  const missing = required.filter((field) => plan?.[field] == null);
  const invalid = [
    !RESPONSE_GOALS.includes(plan?.response_goal),
    !CONVERSATION_STAGES.includes(plan?.conversation_stage),
    !CUSTOMER_STATES.includes(plan?.customer_state),
    !GRAVITIES.includes(plan?.gravity),
    !LENGTHS.includes(plan?.length),
    !EMOJI_POLICIES.includes(plan?.emoji_policy),
    plan?.tone_profile !== 'tata_warm',
    new Set(plan?.mandatory_questions || []).size !== (plan?.mandatory_questions || []).length,
    (plan?.verified_actions || []).some((action) => (plan?.pending_actions || []).includes(action))
  ].some(Boolean);
  if (missing.length || invalid) {
    const error = new Error('RESPONSE_PLAN_INVALID');
    error.code = 'RESPONSE_PLAN_INVALID';
    error.missing = missing;
    throw error;
  }
  return plan;
}

module.exports = {
  RESPONSE_GOALS,
  CONVERSATION_STAGES,
  CUSTOMER_STATES,
  GRAVITIES,
  LENGTHS,
  EMOJI_POLICIES,
  SAFE_ENTITY_FIELDS,
  STANDARD_PROHIBITED,
  conversationStage,
  customerState,
  gravityFor,
  fallbackReason,
  safeEntityFacts,
  extractSurfaceFacts,
  buildResponsePlan,
  validateResponsePlan
};
