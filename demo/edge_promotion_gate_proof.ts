import { strict as assert } from "node:assert";
import {
  evaluateObservationPromotion,
  REQUIRED_LIVE_OBSERVE_GATES,
  type PromotionEvidence,
} from "../src/edge/promotionGate";

const cloudOnly: PromotionEvidence[] = [{
  gate: "cloud_synthetic_suite_green",
  proven: true,
  proof_ref: "github-actions/run-33",
}];

const current = evaluateObservationPromotion(cloudOnly);
assert.equal(current.technical_ceiling, "SHADOW_ONLY");
assert.equal(current.human_authorization_required, true);
assert.equal(current.production_effects_authorized, false);
assert.equal(current.blockers.includes("host_binding_complete"), true);
assert.equal(current.blockers.includes("resource_impact_verified"), true);

const allTechnical = evaluateObservationPromotion(
  REQUIRED_LIVE_OBSERVE_GATES.map((gate) => ({
    gate,
    proven: true,
    proof_ref: "synthetic-proof",
  })),
);
assert.equal(allTechnical.technical_ceiling, "LIVE_OBSERVE_ELIGIBLE");
assert.equal(allTechnical.human_authorization_required, true);
assert.equal(allTechnical.production_effects_authorized, false);
assert.equal(allTechnical.blockers.length, 0);

assert.throws(
  () =>
    evaluateObservationPromotion([
      { gate: "host_binding_complete", proven: true },
      { gate: "host_binding_complete", proven: false },
    ]),
  /promotion_gate_evidence_conflict/,
);

const serialized = JSON.stringify(allTechnical);
assert.equal(serialized.includes("CONTROL"), false);
assert.equal(serialized.includes("WRITE"), false);
assert.equal(serialized.includes("AUTHORIZED"), false);

console.log(JSON.stringify({
  status: "PASS",
  cloud_only_remains_shadow: true,
  physical_host_evidence_required: true,
  live_observe_eligibility_still_requires_human_authorization: true,
  control_mode_absent: true,
}, null, 2));
