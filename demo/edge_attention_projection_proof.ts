import { strict as assert } from "node:assert";
import {
  projectAdapterFailureAttention,
  projectAttention,
  projectObservationAttention,
} from "../src/edge/attention";
import type { EdgeSourceObservation } from "../src/edge/simulator";

const healthyAuth: EdgeSourceObservation = {\n  source_mode: "synthetic",\n  observation_id: "auth-ok",
  kind: "auth_state",
  source_ref: { source: "ifood", kind: "auth_session", id: "profile-1", unit_id: "0001" },
  observed_at: "2026-09-24T20:00:00.000Z",
  payload: { health: "HEALTHY" },
};

const humanAuth: EdgeSourceObservation = {\n  source_mode: "synthetic",\n  observation_id: "auth-human",
  kind: "auth_state",
  source_ref: { source: "ifood", kind: "auth_session", id: "profile-1", unit_id: "0001" },
  observed_at: "2026-09-24T20:01:00.000Z",
  payload: { health: "HUMAN_REQUIRED", customer_name: "must-not-cross" },
};

const queuedPrint: EdgeSourceObservation = {\n  source_mode: "synthetic",\n  observation_id: "print-queued",
  kind: "print_job",
  source_ref: { source: "windows_print", kind: "spool_job", id: "10", unit_id: "0001" },
  observed_at: "2026-09-24T20:02:00.000Z",
  payload: { state: "QUEUED" },
};

const failedPrint: EdgeSourceObservation = {\n  source_mode: "synthetic",\n  observation_id: "print-error",
  kind: "print_job",
  source_ref: { source: "windows_print", kind: "spool_job", id: "11", unit_id: "0001" },
  observed_at: "2026-09-24T20:03:00.000Z",
  payload: { state: "ERROR", raw_message: "must-not-cross" },
};

const analytics: EdgeSourceObservation = {\n  source_mode: "synthetic",\n  observation_id: "analytics",
  kind: "ifood_portal",
  source_ref: { source: "ifood", kind: "analytics", id: "cap-1", unit_id: "0001" },
  observed_at: "2026-09-24T20:04:00.000Z",
  payload: { gross_sales: 1, cancellation_rate: 99 },
};

assert.equal(projectObservationAttention(healthyAuth), null);
assert.equal(projectObservationAttention(queuedPrint), null);
assert.equal(projectObservationAttention(analytics), null);

const projected = projectAttention([
  analytics,
  failedPrint,
  healthyAuth,
  humanAuth,
  queuedPrint,
]);

assert.equal(projected.length, 2);
assert.deepEqual(
  projected.map((item) => item.kind),
  ["IFOOD_AUTH_HUMAN_REQUIRED", "PRINT_SOFTWARE_ERROR"],
);
assert.equal(projected.every((item) => item.delivery_hint === "SHOW"), true);
assert.equal(projected.every((item) => item.fact_class === "FACT"), true);
assert.equal(projected.every((item) => item.unit_id === "0001"), true);

const adapterFailure = projectAdapterFailureAttention({
  result: {
    adapter_id: "ifood-sidecar",
    collected: 0,
    duplicates: 0,
    status: "failed",
    error_code: "adapter_failed",
  },
  observed_at: "2026-09-24T20:05:00.000Z",
  unit_id: "0001",
});
assert.ok(adapterFailure);
assert.equal(adapterFailure.kind, "SOURCE_ADAPTER_FAILED");
assert.equal(adapterFailure.delivery_hint, "SHOW");

const serialized = JSON.stringify([...projected, adapterFailure]);
assert.equal(serialized.includes("must-not-cross"), false);
assert.equal(serialized.includes("INTERRUPT"), false);
assert.equal(serialized.includes("cancellation_rate"), false);

console.log(JSON.stringify({
  status: "PASS",
  healthy_state_silent: true,
  analytics_thresholds_do_not_alert: true,
  explicit_auth_human_required_surfaces: true,
  explicit_print_error_surfaces: true,
  adapter_failure_surfaces: true,
  raw_payload_not_forwarded: true,
  interrupt_not_decided_at_edge: true,
}, null, 2));
