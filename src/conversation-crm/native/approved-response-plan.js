'use strict';

const { deepFreeze } = require('./catalogs/operational');
const { independentQuestion } = require('./post-composition-validator');
const {
  validateApprovedResponseEnvelope,
  validateProductContexts,
  evaluateRecommendationSafety,
  evaluateCostPolicy,
  evaluateWhatsAppPolicy
} = require('../../../apps/deliveryos-ai-node');

const MAXIMUM_BY_LENGTH = Object.freeze({ short: 500, medium: 700, careful: 900 });

function requiredQuestion(plan = {}) {
  const questions = (plan.mandatory_questions || []).map(independentQuestion).filter(Boolean);
  return questions.length ? questions.join(' ') : null;
}

function journeyContextSummary(state = null) {
  if (!state) return null;
  return {
    version: Number(state.version || 0),
    active_journey: state.active_journey || null,
    active_step: state.active_step || null,
    pending_question: typeof state.pending_question === 'string' ? state.pending_question : state.pending_question?.field || null,
    suspended_count: Array.isArray(state.suspended_journeys) ? state.suspended_journeys.length : 0,
    last_pattern: state.last_pattern || null
  };
}

function customerContextSummary(context) {
  if (!context) return null;
  return {
    status: context.status,
    identity_status: context.identity_status,
    consent_status: context.consent_status,
    confirmed_fields: context.confirmed_facts.map((fact) => fact.field),
    inferred_fields: context.inferred_facts.map((fact) => fact.field),
    declared_restriction_types: context.declared_restrictions.map((item) => item.type).filter(Boolean),
    unknowns: [...context.unknowns]
  };
}

function menuContextSummary(context) {
  if (!context) return null;
  return {
    status: context.status,
    channel: context.channel,
    unit_id: context.unit_id || null,
    item_ids: context.items.map((item) => item.item_id),
    unknowns: [...context.unknowns],
    divergence_count: context.divergences.length
  };
}

function policySummary(input, contexts) {
  const cost = evaluateCostPolicy(contexts.cost_policy);
  const channel = input.channel_policy
    ? evaluateWhatsAppPolicy(contexts.channel_policy, contexts.cost_policy)
    : { allowed: false, status: 'not_requested', reasons: ['CHANNEL_POLICY_NOT_REQUESTED'] };
  return {
    cost: { status: cost.status, allowed: cost.allowed, reasons: [...cost.reasons] },
    channel: { status: channel.status, allowed: channel.allowed, reasons: [...channel.reasons] }
  };
}

function factsFromPlan(plan = {}) {
  return [...(plan.known_facts || []), ...(plan.new_facts || [])]
    .filter((fact) => fact && typeof fact.field === 'string' && ['string', 'number', 'boolean'].includes(typeof fact.value))
    .map((fact) => ({ field: fact.field, value: fact.value }));
}

function buildApprovedResponseEnvelope(input = {}) {
  const plan = input.plan || {};
  const checked = validateProductContexts(input);
  if (!checked.accepted) throw Object.assign(new Error(checked.reason), { code: checked.reason });
  const contexts = checked.contexts;
  const safety = evaluateRecommendationSafety(contexts);
  const policies = policySummary(input, contexts);
  let question = input.question_to_ask === undefined ? requiredQuestion(plan) : input.question_to_ask;
  let actionTruth = (plan.verified_actions || [])[0] || null;
  const prohibited = [...new Set([...(plan.prohibited_claims || []), ...(input.prohibited_claims || [])])];

  if (contexts.customer_context?.identity_status === 'ambiguous') {
    question = 'Pode confirmar qual cadastro deve ser usado antes de continuarmos?';
    actionTruth = null;
    prohibited.push('unificar_identidades_ambiguas');
  }
  if (safety.requires_allergen_guidance) {
    question = 'Você pode confirmar a restrição e o item antes de qualquer orientação?';
    actionTruth = null;
    prohibited.push('recomendar_sem_confirmar_alergenios');
  }
  if (!policies.cost.allowed && actionTruth && /(?:external|whatsapp|message|send|notify)/iu.test(actionTruth)) {
    actionTruth = null;
    prohibited.push('executar_acao_com_custo_externo');
  }

  const envelope = {
    schema_version: 'deliveryos-approved-response-envelope-v1',
    social_acknowledgement: input.social_acknowledgement || null,
    direct_answer: [...(plan.direct_answer || [])],
    explanation: [...(plan.explanation_needed || []), ...(plan.direction || [])],
    journey_context: journeyContextSummary(input.journey_state),
    customer_context_summary: customerContextSummary(contexts.customer_context),
    menu_context_summary: menuContextSummary(contexts.menu_context),
    recommendation_context: contexts.recommendation_context,
    channel_policy_summary: policies.channel,
    cost_policy_summary: policies.cost,
    facts: factsFromPlan(plan),
    action_truth: actionTruth,
    question_to_ask: question,
    tone: String(plan.tone_profile || 'tata_warm'),
    gravity: String(plan.gravity || 'informational'),
    prohibited_claims: prohibited,
    recent_phrases_to_avoid: [...(input.recent_phrases || [])],
    authorized_links: [...(plan.authorized_surface?.links || [])],
    authorized_numbers: [...(plan.authorized_surface?.numbers || [])],
    maximum_length: MAXIMUM_BY_LENGTH[plan.length] || 700
  };
  const validated = validateApprovedResponseEnvelope(envelope);
  if (!validated.accepted) throw Object.assign(new Error(validated.reason), { code: validated.reason });
  return deepFreeze(envelope);
}

module.exports = {
  MAXIMUM_BY_LENGTH,
  requiredQuestion,
  journeyContextSummary,
  customerContextSummary,
  menuContextSummary,
  factsFromPlan,
  buildApprovedResponseEnvelope
};
