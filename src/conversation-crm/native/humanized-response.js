'use strict';

const { deepFreeze } = require('./catalogs/operational');
const { composeResponse } = require('./response-composer');
const { buildResponsePlan } = require('./response-plan');
const { composeControlledText } = require('./controlled-response-composer');
const { validatePostComposition, safeResponseAfterRejection } = require('./post-composition-validator');

function composeHumanizedResponse(input = {}) {
  const legacy = composeResponse(input);
  let plan;
  try {
    plan = buildResponsePlan({
      classification: input.classification,
      result: input.result,
      handoff: input.handoff,
      conversation: input.conversation,
      authorized_text: legacy.text
    });
  } catch {
    return deepFreeze({
      ...legacy,
      schema_version: 'conversation-response-v2',
      plan: null,
      strategy_id: 'safe_internal_error',
      fallback_reason: 'safe_internal_error',
      variation_key: null,
      humanized: true,
      validation: {
        passed: false,
        fallback_used: true,
        rejected_finding_codes: ['RESPONSE_PLAN_INVALID'],
        final_finding_codes: []
      }
    });
  }

  const draft = composeControlledText({
    plan,
    classification: input.classification,
    result: input.result,
    handoff: input.handoff,
    conversation: input.conversation,
    authorized_text: legacy.text,
    seed: input.seed
  });
  const first = validatePostComposition({
    text: draft.text,
    plan,
    pattern_decision: input.conversation?.pattern_decision || null,
    previous_responses: input.conversation?.previous_responses || []
  });
  const fallbackText = first.passed ? null : safeResponseAfterRejection({ plan });
  const text = fallbackText || draft.text;
  const finalValidation = first.passed
    ? first
    : validatePostComposition({
      text,
      plan,
      pattern_decision: input.conversation?.pattern_decision || null,
      previous_responses: input.conversation?.previous_responses || []
    });

  return deepFreeze({
    ...legacy,
    schema_version: 'conversation-response-v2',
    text,
    previous_text: legacy.text,
    plan,
    strategy_id: plan.strategy_id,
    fallback_reason: plan.fallback_reason,
    variation_key: draft.variation_key,
    humanized: true,
    validation: {
      passed: finalValidation.passed,
      fallback_used: !first.passed,
      rejected_finding_codes: first.passed ? [] : first.finding_codes,
      final_finding_codes: finalValidation.finding_codes,
      checks: finalValidation.checks
    }
  });
}

module.exports = { composeHumanizedResponse };

