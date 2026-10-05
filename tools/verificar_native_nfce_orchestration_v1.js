"use strict";

const assert = require("node:assert/strict");
const {
  planNativeNfceAfterProduction,
} = require("../dist/src/fiscal/nativeNfceOrchestration.js");

const proven = (value, source) => ({
  value,
  evidence: value ? "REAL_OBSERVED" : "UNKNOWN",
  source_ref: value ? source : null,
});

const baseReadiness = {
  native_teknisa_nfce_path: proven(true, "synthetic:teknisa-native"),
  sales_channel_eligible_for_native_nfce: proven(
    true,
    "synthetic:channel-eligibility",
  ),
  fiscal_trigger_ready: proven(true, "synthetic:paid-order-trigger"),
  fiscal_timing_compatible_with_after_production_dispatch: proven(
    true,
    "synthetic:timing-proof",
  ),
  nfce_cash_register_configured: proven(true, "synthetic:nfce-cash"),
  nfce_cash_register_open: proven(true, "synthetic:cash-open"),
  interface_api_ready: proven(true, "synthetic:interface-api"),
  fiscal_printer_mapping_observed: proven(true, "synthetic:fiscal-printer"),
  nfce_qrcode_v3_compatible: proven(true, "synthetic:qrcode-v3"),
  sp_authorization_protocol_17_compatible: proven(
    true,
    "synthetic:protocol-17",
  ),
};

const ready = planNativeNfceAfterProduction({
  teknisa_sequence: "18452",
  ifood_sequence: "A1B2C3",
  tata_sequence: "037",
  production: [
    {
      intent_fingerprint: "a".repeat(64),
      printer_code: "00003",
      state: "SPOOLER_OBSERVED",
    },
    {
      intent_fingerprint: "b".repeat(64),
      printer_code: "00004",
      state: "PHYSICALLY_CONFIRMED",
    },
  ],
  readiness: baseReadiness,
});

assert.equal(ready.ready_for_native_nfce_request_candidate, false);
assert.ok(
  ready.blocking_reasons.includes("LEGACY_AFTER_PRODUCTION_POLICY_SUPERSEDED"),
);
assert.equal(
  ready.ordering.production_dispatch_barrier,
  "PRODUCTION_DISPATCH_OBSERVED",
);
assert.equal(ready.ordering.correlation_key, "037");
assert.equal(ready.ordering.tata_sequence_is_operational_not_fiscal_number, true);
assert.equal(ready.ordering.physical_print_confirmation_required, false);
assert.equal(ready.provider_policy.preferred_provider, "TEKNISA_ODHEN_NATIVE_NFCE");
assert.equal(ready.provider_policy.custom_sefaz_emitter_selected, false);
assert.deepEqual(ready.effect_boundary, {
  fiscal_action: false,
  sefaz_submission: false,
  danfe_print: false,
  odhen_write: false,
});

const uncertainProduction = planNativeNfceAfterProduction({
  teknisa_sequence: "18452",
  ifood_sequence: "A1B2C3",
  tata_sequence: "037",
  production: [
    {
      intent_fingerprint: "a".repeat(64),
      printer_code: "00003",
      state: "SUBMISSION_RETURNED_UNOBSERVED",
    },
  ],
  readiness: baseReadiness,
});
assert.equal(uncertainProduction.ready_for_native_nfce_request_candidate, false);
assert.ok(
  uncertainProduction.blocking_reasons.includes(
    "PRODUCTION_DISPATCH_NOT_OBSERVED:00003",
  ),
);

const timingUnknown = planNativeNfceAfterProduction({
  teknisa_sequence: "18452",
  ifood_sequence: "A1B2C3",
  tata_sequence: "037",
  production: [],
  readiness: {
    ...baseReadiness,
    fiscal_timing_compatible_with_after_production_dispatch: {
      value: false,
      evidence: "UNKNOWN",
      source_ref: null,
    },
  },
});
assert.equal(timingUnknown.ready_for_native_nfce_request_candidate, false);
assert.equal(
  timingUnknown.ordering.production_dispatch_barrier,
  "NO_PRODUCTION_TICKETS",
);
assert.ok(
  timingUnknown.blocking_reasons.includes(
    "FISCAL_TIMING_COMPATIBILITY_NOT_PROVEN",
  ),
);

const channelUnknown = planNativeNfceAfterProduction({
  teknisa_sequence: "18452",
  ifood_sequence: "A1B2C3",
  tata_sequence: "037",
  production: [],
  readiness: {
    ...baseReadiness,
    sales_channel_eligible_for_native_nfce: {
      value: false,
      evidence: "UNKNOWN",
      source_ref: null,
    },
  },
});
assert.equal(channelUnknown.ready_for_native_nfce_request_candidate, false);
assert.ok(
  channelUnknown.blocking_reasons.includes(
    "SALES_CHANNEL_NATIVE_NFCE_ELIGIBILITY_NOT_PROVEN",
  ),
);

const protocolUnknown = planNativeNfceAfterProduction({
  teknisa_sequence: "18452",
  ifood_sequence: "A1B2C3",
  tata_sequence: "037",
  production: [],
  readiness: {
    ...baseReadiness,
    sp_authorization_protocol_17_compatible: {
      value: false,
      evidence: "UNKNOWN",
      source_ref: null,
    },
  },
});
assert.equal(protocolUnknown.ready_for_native_nfce_request_candidate, false);
assert.ok(
  protocolUnknown.blocking_reasons.includes(
    "SP_AUTHORIZATION_PROTOCOL_17_COMPATIBILITY_NOT_PROVEN",
  ),
);

console.log("native-nfce-orchestration-v1: ok");
