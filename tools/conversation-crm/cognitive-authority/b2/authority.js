'use strict';

const { validatePlan, canonicalHash } = require('./contract');
const {
  deriveRequiredQuestion,
  buildRequiredResponseCommitments,
  progressStateHash
} = require('./commitments');

const UNSUPPORTED_FACT_PATTERN = /\b(?:custa|pre[cç]o|dispon[ií]vel|cont[eé]m|leva|ingrediente|sem risco|seguro para alergia|reserva confirmada)\b/iu;
const INTERNAL_SURFACE_PATTERN = /\b(?:fixture|sint[eé]tic[oa]s?|fonte sint[eé]tica|prova|oracle|gold)\b/iu;

function factArray(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && typeof item.field === 'string') : [];
}

function writerSafeFact(fact) {
  const candidate = fact.public_value ?? fact.value;
  if (candidate === undefined || candidate === null) return null;
  const value = String(candidate).trim();
  if (!value || INTERNAL_SURFACE_PATTERN.test(value)) return null;
  return Object.freeze({ field: fact.field, value });
}

function usableToolResult(value, expectedOperationFingerprint = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (['unavailable', 'failed', 'error', 'blocked', 'prohibited'].includes(String(value.status || '').toLowerCase())) return null;
  if (expectedOperationFingerprint) {
    if (value.request_fingerprint !== expectedOperationFingerprint
      || value.result_fingerprint !== expectedOperationFingerprint) return null;
  }
  const hasFacts = factArray(value.facts).length > 0;
  const hasKnowledge = Array.isArray(value.knowledge) && value.knowledge.some((item) => typeof item === 'string' && item.trim());
  return hasFacts || hasKnowledge ? value : null;
}

function authorityStatus(plan, context) {
  if (plan.safety_priority === 'URGENT') return context.safety_directive ? 'APPROVED_URGENT' : 'BLOCKED';
  if (plan.reference.required && plan.reference.status === 'NEEDS_CLARIFICATION') return 'NEEDS_CLARIFICATION';
  if (plan.reference.required && plan.reference.status === 'NEEDS_CONTEXT_LOOKUP') {
    if (context.reference_lookup_result || usableToolResult(context.tool_results?.[plan.tool_requirement], context.operation_fingerprint)) return 'APPROVED';
    return plan.tool_requirement === 'NONE' ? 'NEEDS_CLARIFICATION' : 'NEEDS_TOOL';
  }
  if (plan.tool_requirement === 'NONE') return 'APPROVED';
  return usableToolResult(context.tool_results?.[plan.tool_requirement], context.operation_fingerprint) ? 'APPROVED' : 'NEEDS_TOOL';
}

function publicationOutcome(status, toolResult, requiredQuestion) {
  if (['APPROVED', 'APPROVED_URGENT'].includes(status)) return 'AUTHORIZED_RESULT';
  if (requiredQuestion) return 'CONCRETE_NEXT_STEP';
  if (status === 'NEEDS_TOOL' && !toolResult) return 'EXPLICIT_LIMITATION';
  if (status === 'NEEDS_CLARIFICATION') return 'BLOCKED';
  return 'EXPLICIT_LIMITATION';
}

function approvePlan(rawPlan, context = {}) {
  const checked = validatePlan(rawPlan);
  if (!checked.accepted) return { accepted: false, status: 'REJECTED', reason: checked.reason, response_plan: null };
  const plan = checked.plan;
  let status = authorityStatus(plan, context);
  const rawToolResult = context.tool_results?.[plan.tool_requirement];
  const toolResult = usableToolResult(rawToolResult, context.operation_fingerprint);
  const staleFactResult = Boolean(context.operation_fingerprint && rawToolResult && !toolResult);
  const authorityFacts = factArray(context.confirmed_facts).concat(factArray(toolResult?.facts));
  const approvedFacts = authorityFacts.map(writerSafeFact).filter(Boolean);
  const authorizedText = JSON.stringify({ authorityFacts, toolResult, safety: context.safety_directive || null });
  if (UNSUPPORTED_FACT_PATTERN.test(plan.next_best_step)
    && status === 'APPROVED'
    && !toolResult
    && authorityFacts.length === 0
    && !context.safety_directive) {
    return { accepted: false, status: 'BLOCKED', reason: 'B2_UNSUPPORTED_FACT_IN_PLAN', response_plan: null };
  }
  if (status === 'BLOCKED') return { accepted: false, status, reason: 'B2_SAFETY_DIRECTIVE_MISSING', response_plan: null };
  const requiredQuestion = deriveRequiredQuestion(plan, context);
  if ((plan.conversational_move === 'CLARIFY' || status === 'NEEDS_CLARIFICATION') && !requiredQuestion) {
    return { accepted: false, status: 'BLOCKED', reason: 'B2_SPECIFIC_CLARIFICATION_REQUIRED', response_plan: null };
  }
  if (requiredQuestion && status === 'NEEDS_TOOL' && !toolResult) status = 'NEEDS_CLARIFICATION';
  const requiredResponseCommitments = buildRequiredResponseCommitments(plan, context, requiredQuestion);
  const draftResponsePlan = {
    schema_version: 'deliveryos-approved-b2-response-plan-v1',
    status,
    publication_outcome: publicationOutcome(status, toolResult, requiredQuestion),
    tool_requirement: plan.tool_requirement,
    relation_to_history: plan.relation_to_history,
    conversational_move: plan.conversational_move,
    user_goal: plan.user_goal,
    what_changed: plan.what_changed,
    repair_acknowledgement: plan.repair.required ? plan.repair.acknowledgement : null,
    reference: plan.reference,
    safety_priority: plan.safety_priority,
    next_best_step: plan.next_best_step,
    required_question: requiredQuestion,
    required_response_commitments: requiredResponseCommitments,
    operation_fingerprint: context.operation_fingerprint || null,
    fact_boundary_reason: staleFactResult ? 'STALE_FACT_RESULT_REUSE' : null,
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
    authority_evidence_hash: canonicalHash({
      plan_hash: checked.hash,
      status,
      authorizedText,
      operation_fingerprint: context.operation_fingerprint || null,
      fact_boundary_reason: staleFactResult ? 'STALE_FACT_RESULT_REUSE' : null
    })
  };
  draftResponsePlan.progress_state_hash = progressStateHash(draftResponsePlan);
  const responsePlan = Object.freeze(draftResponsePlan);
  return { accepted: true, status, reason: null, response_plan: responsePlan };
}

module.exports = { approvePlan, usableToolResult, UNSUPPORTED_FACT_PATTERN };

