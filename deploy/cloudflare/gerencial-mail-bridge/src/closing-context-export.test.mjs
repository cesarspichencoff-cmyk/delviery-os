import assert from "node:assert/strict";
import test from "node:test";
import {
  closingRowToContextEvent,
  compareClosings,
} from "./closing-context-export.js";

const latest = {
  mailbox_uid: 710,
  business_date: "2026-09-23",
  message_sent_at: "2026-09-24T02:34:45.000Z",
  report_gross_total: 71113.14,
  lunch_gross: 17162.29,
  dinner_gross: 53950.85,
  ifood_orders_total: 212,
  ifood_value_total: 41447.38,
  app_orders_total: 3,
  app_value_total: 1191,
  tel_orders_total: 0,
  tel_value_total: 0,
  salao_value_total: 28474.76,
  discounts_value_total: 910.96,
  report_bordero_diff: 0,
  totals_match: 1,
  period_label_mismatch: 1,
  readonly_verified: 1,
  quality_flags_json: JSON.stringify([
    "bordero_lunch_period_label_mismatch",
    "bordero_dinner_period_label_mismatch",
  ]),
  created_at: "2026-09-24T03:00:38.109Z",
  updated_at: "2026-09-24T03:00:38.109Z",
};

const previous = {
  ...latest,
  mailbox_uid: 709,
  business_date: "2026-09-22",
  message_sent_at: "2026-09-23T02:08:28.000Z",
  report_gross_total: 58309.57,
  lunch_gross: 11914.41,
  dinner_gross: 46395.16,
  ifood_orders_total: 215,
  ifood_value_total: 42147.28,
  app_orders_total: 4,
  app_value_total: 843,
  salao_value_total: 15319.29,
  discounts_value_total: 152.59,
  updated_at: "2026-09-23T06:00:41.221Z",
};

test("maps a real observed closing row into a deterministic Context Event", () => {
  const event = closingRowToContextEvent(latest);
  assert.equal(event.event_id, "mail:atendimento:closing:710");
  assert.equal(event.payload.business_date, "2026-09-23");
  assert.equal(event.payload.gross_total, 71113.14);
  assert.equal(event.source.read_only_verified, true);
});

test("period-label mismatch is evidence debt, not financial mismatch", () => {
  const event = closingRowToContextEvent(latest);
  assert.equal(event.payload.totals_match, true);
  assert.equal(event.payload.report_bordero_diff, 0);
  assert.ok(event.payload.missing_fields.includes("PERIOD_LABEL_MAPPING"));
  assert.ok(!event.payload.missing_fields.includes("FINANCIAL_RECONCILIATION"));
});

test("closing metrics never imply operational cause", () => {
  const event = closingRowToContextEvent(latest);
  assert.equal(event.epistemic.causal_status, "UNPROVEN");
  assert.equal(event.permissions.causal_assignment_allowed, false);
  assert.equal(event.permissions.financial_write_allowed, false);
});

test("comparison is descriptive and preserves causal uncertainty", () => {
  const a = closingRowToContextEvent(latest);
  const b = closingRowToContextEvent(previous);
  const comparison = compareClosings(a, b);
  assert.equal(comparison.descriptive_only, true);
  assert.equal(comparison.causal_status, "UNPROVEN");
  assert.equal(comparison.ifood_orders_delta, -3);
  assert.ok(comparison.gross_delta > 0);
});

test("invalid source identity fails closed", () => {
  assert.throws(
    () => closingRowToContextEvent({ ...latest, mailbox_uid: 0 }),
    /INVALID_MAILBOX_UID/,
  );
  assert.throws(
    () => closingRowToContextEvent({ ...latest, business_date: "23/09/2026" }),
    /INVALID_BUSINESS_DATE/,
  );
});

test("missing read-only proof stays explicit", () => {
  const event = closingRowToContextEvent({ ...latest, readonly_verified: 0 });
  assert.ok(event.payload.missing_fields.includes("READ_ONLY_PROOF"));
});
