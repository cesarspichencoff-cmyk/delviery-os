'use strict';

const REQUIRED_EVIDENCE = Object.freeze([
  'no_scenario_before_vote',
  'blind_identity_hidden',
  'technical_closed_before_vote',
  'vote_persisted_after_reload',
  'pii_absent_from_export',
  'blind_order_stable',
  'advance_requires_vote',
  'feedback_case_aligned',
  'dashboard_uses_latest_revision',
  'export_has_head_and_hash',
  'errors_are_safe',
  'reset_separates_context'
]);

function verifyPanelEvidence(evidence) {
  const findings = REQUIRED_EVIDENCE.filter((key) => evidence[key] !== true);
  return Object.freeze({
    passed: findings.length === 0,
    findings: Object.freeze(findings),
    checked: REQUIRED_EVIDENCE.length
  });
}

module.exports = { REQUIRED_EVIDENCE, verifyPanelEvidence };
