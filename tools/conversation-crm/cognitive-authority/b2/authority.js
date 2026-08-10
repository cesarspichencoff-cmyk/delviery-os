'use strict';

const { validatePlan, canonicalHash } = require('./contract');

const UNSUPPORTED_FACT_PATTERN = /\b(?:custa|pre[cç]o|dispon[ií]vel|cont[eé]m|leva|ingrediente|sem risco|seguro para alergia|reserva confirmada)\b/iu;

function factArray(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && typeof item.field === 'string') : [];
}

function authorityStatus(plan, context) {
  if (plan.safety_priority === 'URGENT') return context.safety_directive ? 'APPROVED_URGENT' : 'BLOCKED';
  if (plan.reference.required && plan.reference.status === 'NEEDS_CLARIFICATION') return 'NEEDS_CLARIFICATION';
  if (plan.reference.required && plan.reference.status === 'NEEDS_CONTEXT_LOOKUP') {
    if (context.reference_lookup_result) return 'APPROVED';
    return plan.tool_requirement === 'NONE' ? 'NEEDS_CLARIFICATION' : 'NEEDS_TOOL';
  }
  if (plan.tool_requirement === 'NONE') return 'APPROVED';
  return context.tool_results?.[plan.tool_requirement] ? 'APPROVED' : 'NEEDS_TOOL';
}

function approvePlan(rawPlan, context = {}) {
  const checked = validatePlan(rawPlan);
  if (!checked.accepted) return { accepted: false, status: 'REJECTED', reason: checked.reason, response_plan: null };
  const plan = checked.plan;
  const status = authorityStatus(plan, context);
  const toolResult = context.tool_results?.[plan.tool_requirement] || null;
  const approvedFacts = factArray(context.confirmed_facts).concat(factArray(toolResult?.facts));
  const authorizedText = JSON.stringify({ approvedFacts, toolResult, safety: context.safety_directive || null });
  if (UNSUPPORTED_FACT_PATTERN.test(plan.next_best_step) && approvedFacts.length === 0 && !context.safety_directive) {
    return { accepted: false, status: 'BLOCKED', reason: 'B2_UNSUPPORTED_FACT_IN_PLAN', response_plan: null };
  }
  if (status === 'BLOCKED') return { accepted: false, status, reason: 'B2_SAFETY_DIRECTIVE_MISSING', response_plan: null };
  const responsePlan = Object.freeze({
    schema_version: 'deliveryos-approved-b2-response-plan-v1',
    status,
    relation_to_history: plan.relation_to_history,
    conversational_move: plan.conversational_move,
    user_goal: plan.user_goal,
    what_changed: plan.what_changed,
    repair_acknowledgement: plan.repair.required ? plan.repair.acknowledgement : null,
    reference: plan.reference,
    safety_priority: plan.safety_priority,
    next_best_step: plan.next_best_step,
    required_question: context.required_question
      ? String(context.required_question)
      : (status === 'NEEDS_CLARIFICATION' ? String(context.clarification_question || 'Você pode esclarecer a referência?') : null),
    approved_facts: approvedFacts,
    approved_tool_result: toolResult,
    safety_directive: plan.safety_priority === 'URGENT' ? context.safety_directive : null,
    prohibited_claims: Array.isArray(context.prohibited_claims) ? context.prohibited_claims : [],
    writer_surface: Object.freeze({
      authorized_links: Array.isArray(context.authorized_links) ? context.authorized_links : [],
      authorized_numbers: Array.isArray(context.authorized_numbers) ? context.authorized_numbers : [],
      recent_phrases: Array.isArray(context.recent_phrases) ? context.recent_phrases : [],
      tone: String(context.tone || 'calmo, direto e acolhedor'),
      gravity: plan.safety_priority === 'URGENT' ? 'critical' : (plan.safety_priority === 'PREVENTIVE' ? 'sensitive' : 'informational')
    }),
    authority_evidence_hash: canonicalHash({ plan_hash: checked.hash, status, authorizedText })
  });
  return { accepted: true, status, reason: null, response_plan: responsePlan };
}

module.exports = { approvePlan, UNSUPPORTED_FACT_PATTERN };
