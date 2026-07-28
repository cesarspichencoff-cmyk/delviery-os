'use strict';

const { deepFreeze } = require('./catalogs/operational');
const { selectStrategyId, strategyFor } = require('./response-strategy-catalog');
const { searchServiceKnowledge } = require('./service-knowledge-bank');

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

function answeredFieldsFromSource(sourceText = '') {
  const text = normalizeText(sourceText);
  const fields = new Set();
  if (/\b(?:gostei|adorei|amei|parabens)\b/u.test(text)) fields.add('intent');
  if (/\b(?:hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|\d{1,2}\/\d{1,2})\b/u.test(text)) fields.add('date');
  if (/\b(?:as|a)\s+\d{1,2}(?:h|:\d{2})\b/u.test(text)) fields.add('time');
  if (/\b(?:somos|estamos em|mesa para|grupo de)\s+(?:\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\b/u.test(text)) fields.add('party_size');
  if (/^(?:\d{1,2}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)[.!]?$/u.test(text)) fields.add('party_size');
  return fields;
}

function isInformationalReservationQuery(sourceText = '') {
  const text = normalizeText(sourceText);
  const asksToAct = /\b(?:quero fazer|quero reservar|reservar para|confirmar minha|entrar na fila)\b/u.test(text);
  const asksInformation = /^(?:qual|como|quanto|recebi|quando)\b/u.test(text)
    || /\b(?:tolerancia|funciona|quanto tempo)\b/u.test(text);
  return asksInformation && !asksToAct;
}

function questionPriority(strategyId, fields) {
  const priorities = {
    reservation: ['party_size', 'date', 'time', 'customer_name'],
    waitlist: ['party_size', 'customer_name', 'arrival_estimate'],
    large_group: ['customer_name', 'arrival_estimate'],
    missing_item: ['order_reference', 'order_channel', 'item_name'],
    food_safety: ['symptoms', 'onset', 'people_affected', 'order_reference', 'item_name'],
    quality: ['order_reference', 'item_name', 'evidence_available', 'quality_signal']
  }[strategyId] || [];
  return [...fields].sort((left, right) => {
    const a = priorities.includes(left) ? priorities.indexOf(left) : priorities.length;
    const b = priorities.includes(right) ? priorities.indexOf(right) : priorities.length;
    return a - b;
  });
}

function buildResponsePlan(input = {}) {
  const classification = input.classification || {};
  const result = input.result || { status: 'unknown' };
  const conversation = input.conversation || {};
  const stage = conversationStage(conversation, result, classification);
  const strategyId = selectStrategyId({ classification, conversation_stage: stage, result_status: result.status });
  const strategy = strategyFor(strategyId);
  const asked = new Set(conversation.asked_fields || []);
  const answeredNow = answeredFieldsFromSource(conversation.source_text);
  let pendingQuestions = questionPriority(
    strategyId,
    [...new Set(classification.fields_missing || [])].filter((field) => !asked.has(field) && !answeredNow.has(field))
  );
  if (['reservation', 'waitlist'].includes(strategyId) && isInformationalReservationQuery(conversation.source_text)) {
    pendingQuestions = [];
  }
  const questionLimit = {
    reservation: 1,
    waitlist: 1,
    large_group: 2,
    missing_item: 2,
    wrong_item: 2,
    wrong_quantity: 2,
    personalization_ignored: 2,
    quality: 2,
    food_safety: 2,
    ambiguity: 1,
    continuation: 1
  }[strategyId] || 2;
  let mandatoryQuestions = pendingQuestions.slice(0, questionLimit);
  const newFacts = safeEntityFacts(classification);
  const suppliedKnownFacts = Array.isArray(conversation.known_facts) ? conversation.known_facts.filter((fact) => fact && typeof fact === 'object') : [];
  const contextualFacts = Object.entries(conversation.context || {})
    .filter(([field, value]) => SAFE_ENTITY_FIELDS.has(field) && value != null && ['string', 'number', 'boolean'].includes(typeof value))
    .map(([field, value]) => ({ field, value, source: 'conversation_context', certainty: 'provided' }));
  const knownFacts = [...suppliedKnownFacts, ...contextualFacts].filter((fact, index, values) => (
    values.findIndex((candidate) => candidate.field === fact.field && candidate.value === fact.value) === index
  ));
  const authorizedSurface = extractSurfaceFacts(input.authorized_text);
  const knowledge = searchServiceKnowledge({
    classification,
    conversation,
    authorized_text: input.authorized_text
  });
  const hasReservationSelfService = ['reservation', 'waitlist'].includes(strategyId)
    && knowledge.direct_answer.some((message) => /https:\/\/reservation\.getin\.app\//iu.test(message));
  if (hasReservationSelfService) {
    mandatoryQuestions = [];
  }
  if (classification.intent === 'conversation.ambiguous' && knowledge.direct_answer.length) {
    mandatoryQuestions = [];
  }
  const knowledgeSurface = extractSurfaceFacts(
    knowledge.selected.map((item) => item.customer_message).filter(Boolean).join(' ')
  );
  authorizedSurface.text = [authorizedSurface.text, knowledgeSurface.text].filter(Boolean).join(' ');
  authorizedSurface.links = [...new Set([...authorizedSurface.links, ...knowledgeSurface.links])];
  authorizedSurface.numbers = [...new Set([...authorizedSurface.numbers, ...knowledgeSurface.numbers])];
  const verifiedActions = result.status === 'confirmed' && classification.action ? [classification.action] : [];
  const pendingActions = result.status === 'confirmed' || !classification.action ? [] : [classification.action];
  const handoffConfirmed = input.handoff?.status === 'confirmed';
  const actionSelected = verifiedActions[0] || (handoffConfirmed ? 'human.queue.create' : null);
  const actionMode = actionSelected
    ? 'executed'
    : (knowledge.directions.length ? 'orientation' : (pendingActions.length ? 'handoff_required' : 'unavailable'));
  const gravity = gravityFor(classification);
  const plan = {
    version: '2.0.0',
    customer_need: knowledge.customer_need,
    direct_answer: [...knowledge.direct_answer],
    knowledge_candidates: knowledge.candidates.map((item) => ({
      knowledge_id: item.knowledge_id,
      playbook: item.playbook,
      purpose: item.purpose,
      priority: item.priority,
      sources: [...item.sources]
    })),
    knowledge_selected: knowledge.selected.map((item) => item.knowledge_id),
    knowledge_sources_used: [...knowledge.knowledge_sources_used],
    knowledge_rejected: knowledge.rejected.map((item) => item.knowledge_id),
    rejection_reason: Object.fromEntries(knowledge.rejected.map((item) => [item.knowledge_id, item.rejection_reason])),
    action_playbook: knowledge.playbook.id,
    action_available: Boolean(actionSelected),
    action_selected: actionSelected,
    action_mode: actionMode,
    channel_guidance: [...knowledge.playbook.channel_guidance],
    explanation_needed: [...knowledge.explanations],
    direction: [...knowledge.directions],
    optional_enrichment: knowledge.selected
      .filter((item) => item.purpose !== 'direct_answer')
      .map((item) => item.knowledge_id),
    humanity_requirements: [
      'specific_understanding',
      'direct_answer_before_question',
      'proportional_tone',
      ...(gravityFor(classification) === 'critical' ? ['serious_without_emoji'] : [])
    ],
    response_goal: strategy.response_goal,
    conversation_stage: stage,
    customer_state: customerState(classification, conversation.source_text),
    gravity,
    known_facts: knownFacts,
    new_facts: newFacts,
    verified_actions: verifiedActions,
    pending_actions: pendingActions,
    mandatory_questions: mandatoryQuestions,
    deferred_questions: pendingQuestions.slice(questionLimit),
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
    'emoji_policy', 'tone_profile', 'strategy_id', 'customer_need',
    'direct_answer', 'knowledge_candidates', 'knowledge_selected',
    'knowledge_sources_used', 'knowledge_rejected', 'rejection_reason',
    'action_playbook', 'action_available', 'action_mode',
    'channel_guidance', 'explanation_needed', 'direction', 'optional_enrichment',
    'humanity_requirements'
  ];
  const missing = required.filter((field) => plan?.[field] == null);
  const invalid = [
    !RESPONSE_GOALS.includes(plan?.response_goal),
    !CONVERSATION_STAGES.includes(plan?.conversation_stage),
    !CUSTOMER_STATES.includes(plan?.customer_state),
    !GRAVITIES.includes(plan?.gravity),
    !LENGTHS.includes(plan?.length),
    !EMOJI_POLICIES.includes(plan?.emoji_policy),
    plan?.version !== '2.0.0',
    !Object.hasOwn(plan || {}, 'action_selected'),
    plan?.tone_profile !== 'tata_warm',
    !['executed', 'prepared', 'orientation', 'handoff_required', 'unavailable'].includes(plan?.action_mode),
    !Array.isArray(plan?.direct_answer),
    !Array.isArray(plan?.knowledge_candidates),
    !Array.isArray(plan?.knowledge_selected),
    !Array.isArray(plan?.knowledge_sources_used),
    !Array.isArray(plan?.humanity_requirements),
    !Array.isArray(plan?.direction),
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
  answeredFieldsFromSource,
  isInformationalReservationQuery,
  questionPriority,
  buildResponsePlan,
  validateResponsePlan
};
