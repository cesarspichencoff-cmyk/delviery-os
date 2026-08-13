'use strict';

const { canonicalHash } = require('./contract');

const COMMITMENT_KINDS = Object.freeze([
  'GOAL',
  'CONSTRAINT',
  'REFERENCE',
  'REPAIR',
  'QUESTION'
]);

const STOP_WORDS = new Set([
  'a', 'ao', 'aos', 'as', 'com', 'como', 'da', 'das', 'de', 'depois', 'do', 'dos',
  'e', 'ela', 'ele', 'em', 'essa', 'esse', 'esta', 'este', 'eu', 'foi', 'já', 'mais',
  'mas', 'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'pela', 'pelo', 'por',
  'que', 'se', 'sem', 'ser', 'sua', 'seu', 'um', 'uma', 'você'
]);

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function semanticAnchors(content) {
  const anchors = normalize(content)
    .split(' ')
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
  return [...new Set(anchors)].slice(0, 12);
}

function commitment(value, source) {
  const content = String(value.content || '').trim();
  const kind = String(value.kind || '').trim().toUpperCase();
  const anchors = Array.isArray(value.anchors) && value.anchors.length
    ? value.anchors.map(normalize).filter(Boolean)
    : semanticAnchors(content);
  return Object.freeze({
    id: canonicalHash({ kind, content, source }).slice(0, 16),
    kind,
    content,
    anchors: Object.freeze([...new Set(anchors)]),
    source
  });
}

function cleanNeed(value) {
  return String(value || '')
    .replace(/(?:[,;:]\s*|\s+)(?:e\s*,?\s*)?(?:depois|ap[oó]s|ent[aã]o)\b[\s\S]*$/iu, '')
    .replace(/(?:[,;:]\s*|\s+)antes de\b[\s\S]*$/iu, '')
    .replace(/[.;,:\s]+$/gu, '')
    .trim();
}

function questionFromPlan(plan) {
  const step = String(plan.next_best_step || '').trim();
  const instruction = step.match(/^(?:pedir|solicitar|obter)\s+(.+)$/iu);
  if (instruction) {
    const need = cleanNeed(instruction[1]);
    if (need) return `Você pode informar ${need}?`;
  }
  const confirmation = step.match(/^confirmar\s+(.+)$/iu);
  if (confirmation) {
    const need = cleanNeed(confirmation[1]);
    if (need) return `Você pode confirmar ${need}?`;
  }
  const target = String(plan.reference?.target || '').trim();
  if (target) return `Você pode informar ${cleanNeed(target)}?`;
  return null;
}

function explicitCommitments(plan, context) {
  const fromPlan = Array.isArray(plan.required_response_commitments)
    ? plan.required_response_commitments.map((item) => commitment(item, 'conversation_plan'))
    : [];
  const fromAuthority = Array.isArray(context.required_response_commitments)
    ? context.required_response_commitments.map((item) => commitment(item, 'authority_context'))
    : [];
  return fromPlan.concat(fromAuthority);
}

function deriveRequiredQuestion(plan, context = {}) {
  const direct = context.required_question || context.clarification_question;
  if (direct) return String(direct).trim();
  const declared = explicitCommitments(plan, context).find((item) => item.kind === 'QUESTION');
  if (declared) return /\?$/u.test(declared.content) ? declared.content : `${declared.content}?`;
  if (plan.conversational_move === 'CLARIFY'
    || plan.reference?.status === 'NEEDS_CLARIFICATION') {
    return questionFromPlan(plan);
  }
  return null;
}

function buildRequiredResponseCommitments(plan, context = {}, requiredQuestion = null) {
  const items = explicitCommitments(plan, context);
  if (plan.reference?.required
    && plan.reference.status === 'NEEDS_CONTEXT_LOOKUP'
    && plan.reference.target) {
    const target = String(plan.reference.target);
    const naturalTarget = `${target.charAt(0).toLocaleLowerCase('pt-BR')}${target.slice(1)}`;
    items.push(commitment({ kind: 'REFERENCE', content: naturalTarget }, 'conversation_plan.reference'));
  }
  if (plan.repair?.required) {
    items.push(commitment({ kind: 'REPAIR', content: plan.repair.acknowledgement }, 'conversation_plan.repair'));
  }
  if (requiredQuestion) {
    items.push(commitment({ kind: 'QUESTION', content: requiredQuestion }, 'approved_response_plan.required_question'));
  }
  const seen = new Set();
  return Object.freeze(items.filter((item) => {
    const key = `${item.kind}:${normalize(item.content)}`;
    if (!item.content || seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
}

function commitmentSatisfied(text, item) {
  const value = normalize(text);
  if (!value) return false;
  if (item.kind === 'QUESTION' && !String(text).includes('?')) return false;
  if (item.kind === 'REPAIR' && /\b(?:desculp|perdao|sinto muito|voce tem razao|nao fui clar|nao deixei clar|errei)\b/iu.test(String(text))) {
    return true;
  }
  const anchors = Array.isArray(item.anchors) ? item.anchors.filter(Boolean) : [];
  const numericAnchors = normalize(item.content).split(' ').filter((token) => /^\d+$/u.test(token));
  if (numericAnchors.some((token) => !value.split(' ').includes(token))) return false;
  if (item.kind === 'CONSTRAINT' && /(?:^|\s)sem(?:\s|$)/u.test(normalize(item.content))
    && !/(?:^|\s)(?:sem|nao)(?:\s|$)/u.test(value)) return false;
  if (!anchors.length) return normalize(item.content) ? value.includes(normalize(item.content)) : true;
  const matches = anchors.filter((anchor) => value.includes(anchor)).length;
  const minimum = Math.min(anchors.length, Math.max(2, Math.ceil(anchors.length / 2)));
  return matches >= minimum;
}

function validateCommitments(text, commitments) {
  const missing = (commitments || []).filter((item) => !commitmentSatisfied(text, item));
  return missing.length
    ? { accepted: false, reason: 'B2_WRITER_DROPPED_REQUIRED_COMMITMENT', missing }
    : { accepted: true, reason: null, missing: [] };
}

function progressStateHash(responsePlan) {
  return canonicalHash({
    status: responsePlan.status,
    publication_outcome: responsePlan.publication_outcome,
    tool_requirement: responsePlan.tool_requirement,
    approved_facts: responsePlan.approved_facts,
    approved_tool_result: responsePlan.approved_tool_result,
    operation_fingerprint: responsePlan.operation_fingerprint,
    fact_boundary_reason: responsePlan.fact_boundary_reason,
    required_question: responsePlan.required_question,
    required_response_commitments: responsePlan.required_response_commitments,
    next_best_step: responsePlan.next_best_step,
    safety_priority: responsePlan.safety_priority,
    repair_required: Boolean(responsePlan.repair_acknowledgement),
    reference_status: responsePlan.reference?.status || null
  });
}

module.exports = {
  COMMITMENT_KINDS,
  normalize,
  semanticAnchors,
  questionFromPlan,
  deriveRequiredQuestion,
  buildRequiredResponseCommitments,
  commitmentSatisfied,
  validateCommitments,
  progressStateHash
};
