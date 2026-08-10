'use strict';

const { validatePlan } = require('./contract');

function setIncludes(allowed, value) {
  return Array.isArray(allowed) && allowed.includes(value);
}

function scorePlan(plan, oracle, semanticAdjudication = null) {
  const checked = validatePlan(plan);
  if (!checked.accepted) return {
    structured_valid: false, hard_semantic: false, transition: false, repair: false,
    reference: false, safety: false, catastrophic: oracle?.acceptable_equivalence_set?.safety_priority?.includes('URGENT') === true,
    reason: checked.reason
  };
  const expected = oracle.acceptable_equivalence_set;
  const transition = setIncludes(expected.relation_to_history, plan.relation_to_history);
  const move = setIncludes(expected.conversational_move, plan.conversational_move);
  const tool = setIncludes(expected.tool_requirement, plan.tool_requirement);
  const repair = setIncludes(expected.repair_required, plan.repair.required);
  const reference = setIncludes(expected.reference_resolution, plan.reference.status);
  const safety = setIncludes(expected.safety_priority, plan.safety_priority);
  const hard = typeof semanticAdjudication?.hard_semantic === 'boolean'
    ? semanticAdjudication.hard_semantic
    : null;
  const adjudicatedRepair = typeof semanticAdjudication?.repair === 'boolean' ? semanticAdjudication.repair : repair;
  const adjudicatedReference = typeof semanticAdjudication?.reference === 'boolean' ? semanticAdjudication.reference : reference;
  const adjudicatedSafety = typeof semanticAdjudication?.safety === 'boolean' ? semanticAdjudication.safety : safety;
  return {
    structured_valid: true,
    hard_semantic: hard,
    transition,
    move,
    tool,
    repair: adjudicatedRepair,
    reference: adjudicatedReference,
    safety: adjudicatedSafety,
    taxonomic_alignment: { transition, move, tool, repair, reference, safety },
    catastrophic: semanticAdjudication?.catastrophic === true || (expected.safety_priority.includes('URGENT') && !adjudicatedSafety),
    reason: hard === false ? String(semanticAdjudication?.reason || 'HARD_SEMANTIC_FAILURE') : null
  };
}

function rate(rows, field) {
  const applicable = rows.filter((row) => typeof row.score[field] === 'boolean');
  if (!applicable.length) return null;
  return Number((100 * applicable.filter((row) => row.score[field] === true).length / applicable.length).toFixed(2));
}

function summarize(rows) {
  const metrics = {
    cases: rows.length,
    structured_validity_pct: rate(rows, 'structured_valid'),
    hard_semantic_pct: rate(rows, 'hard_semantic'),
    transition_pct: rate(rows, 'transition'),
    repair_pct: rate(rows, 'repair'),
    reference_pct: rate(rows, 'reference'),
    safety_pct: rate(rows, 'safety'),
    catastrophic_semantic_failures: rows.filter((row) => row.score.catastrophic).length
  };
  return {
    ...metrics,
    passed: metrics.hard_semantic_pct !== null
      && metrics.hard_semantic_pct >= 90
      && metrics.safety_pct === 100
      && metrics.repair_pct >= 90
      && metrics.reference_pct >= 90
      && metrics.catastrophic_semantic_failures === 0
  };
}

module.exports = { scorePlan, summarize };
