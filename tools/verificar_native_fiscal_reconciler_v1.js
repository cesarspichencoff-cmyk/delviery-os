"use strict";

const assert = require("node:assert/strict");
const {
  reconcileNativeFiscalState,
} = require("../dist/src/fiscal/nativeFiscalReconciler.js");

const base = {
  order_id: "0000348851",
  sale_exists: true,
  nfce_status: "A",
  protocol: "1".repeat(17),
  qr_present: true,
};

let decision = reconcileNativeFiscalState({
  order_id: "1",
  sale_exists: false,
  nfce_status: null,
  protocol: null,
  qr_present: false,
});
assert.equal(decision.state, "WAIT_NATIVE_SALE");
assert.equal(decision.effects.fiscal_action, false);

decision = reconcileNativeFiscalState(base);
assert.equal(decision.state, "AUTHORIZED_RECONCILED");
assert.equal(decision.next_action, "NO_FISCAL_ACTION");
assert.equal(decision.policy.authorized_is_not_danfe_printed, true);

decision = reconcileNativeFiscalState({ ...base, protocol: "1".repeat(15) });
assert.equal(decision.state, "AMBIGUOUS_RECONCILIATION_REQUIRED");
assert.ok(
  decision.blocking_reasons.includes(
    "AUTHORIZED_PROTOCOL_LENGTH_UNEXPECTED:15",
  ),
);

decision = reconcileNativeFiscalState({ ...base, qr_present: false });
assert.equal(decision.state, "AMBIGUOUS_RECONCILIATION_REQUIRED");
assert.ok(decision.blocking_reasons.includes("AUTHORIZED_QR_DATA_MISSING"));

decision = reconcileNativeFiscalState({
  ...base,
  nfce_status: "P",
  protocol: null,
  qr_present: false,
});
assert.equal(decision.state, "NATIVE_CONTINGENCY_REPORTED");
assert.equal(decision.next_action, "RECONCILE_BEFORE_ANY_EFFECT");

decision = reconcileNativeFiscalState({ ...base, nfce_status: "R" });
assert.equal(decision.state, "ERROR_REQUIRES_OPERATOR");

decision = reconcileNativeFiscalState({ ...base, native_error: "timeout" });
assert.equal(decision.state, "ERROR_REQUIRES_OPERATOR");

decision = reconcileNativeFiscalState({
  order_id: "1",
  sale_exists: false,
  nfce_status: "A",
  protocol: "1".repeat(17),
  qr_present: true,
});
assert.equal(decision.state, "AMBIGUOUS_RECONCILIATION_REQUIRED");

assert.throws(
  () => reconcileNativeFiscalState({ ...base, order_id: "" }),
  /ORDER_ID_REQUIRED/,
);

console.log("native-fiscal-reconciler: ok");
