/**
 * Technical promotion gate for Edge observation.
 *
 * This gate never authorizes installation or production. It only answers
 * whether the technical evidence is sufficient to PRESENT a live-observation
 * gate to the human authority.
 *
 * There is intentionally no control/write mode in this contract.
 */

export const REQUIRED_LIVE_OBSERVE_GATES = [
  "cloud_synthetic_suite_green",
  "host_binding_complete",
  "live_source_identity_proven",
  "least_privilege_verified",
  "windows_restart_recovery_proven",
  "resource_impact_verified",
  "disable_path_verified",
  "pii_review_verified",
] as const;

export type LiveObserveGate = (typeof REQUIRED_LIVE_OBSERVE_GATES)[number];

export interface PromotionEvidence {
  gate: LiveObserveGate;
  proven: boolean;
  proof_ref?: string;
}

export interface PromotionGateResult {
  technical_ceiling: "SHADOW_ONLY" | "LIVE_OBSERVE_ELIGIBLE";
  blockers: LiveObserveGate[];
  human_authorization_required: true;
  production_effects_authorized: false;
}

const SAFE_PROOF_REF = /^[A-Za-z0-9._:/-]{1,200}$/;

export function evaluateObservationPromotion(
  evidence: readonly PromotionEvidence[],
): PromotionGateResult {
  const byGate = new Map<LiveObserveGate, boolean>();

  for (const item of evidence) {
    if (item.proof_ref !== undefined && !SAFE_PROOF_REF.test(item.proof_ref)) {
      throw new Error("unsafe_promotion_proof_ref");
    }

    const existing = byGate.get(item.gate);
    if (existing !== undefined && existing !== item.proven) {
      throw new Error("promotion_gate_evidence_conflict");
    }
    byGate.set(item.gate, item.proven);
  }

  const blockers = REQUIRED_LIVE_OBSERVE_GATES.filter(
    (gate) => byGate.get(gate) !== true,
  );

  return {
    technical_ceiling:
      blockers.length === 0 ? "LIVE_OBSERVE_ELIGIBLE" : "SHADOW_ONLY",
    blockers,
    human_authorization_required: true,
    production_effects_authorized: false,
  };
}
