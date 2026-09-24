/**
 * Teknisa shadow adapter.
 * API availability is optional. Structured read-only routes only.
 */
import type { EdgeSourceObservation, CorrelationProposal } from "../simulator";

export type TeknisaAccessRoute =
  | "official_api"
  | "structured_export"
  | "local_structured_observation"
  | "browser_observation";

export interface TeknisaStructuredRecord {
  record_id: string;
  record_type: "sale" | "order" | "command" | "payment";
  unit_id: string;
  observed_at: string;
  occurred_at?: string;
  route: TeknisaAccessRoute;
  external_order_id?: string;
  payment_mapping?: string;
  amount?: number;
  payload?: Record<string, unknown>;
}

const KNOWN_IFOOD_PAYMENT_MAPPINGS = new Set([
  "ONLINE_IFOOD",
  "OFFLINE_IFOOD",
  "VOUCHER_IFOOD",
]);

export function teknisaRecordToObservation(record: TeknisaStructuredRecord): EdgeSourceObservation {
  const proposals: CorrelationProposal[] = [];
  if (record.external_order_id) {
    proposals.push({
      target: { source: "ifood", kind: "order", id: record.external_order_id, unit_id: record.unit_id },
      evidence: [{
        evidence_id: "teknisa:" + record.record_id + ":external_order_id",
        dimension: "exact_external_id",
        detail: "Teknisa record explicitly exposes external order id",
      }],
    });
  } else if (record.payment_mapping && KNOWN_IFOOD_PAYMENT_MAPPINGS.has(record.payment_mapping)) {
    // Channel/payment mapping is useful context, but it does not identify one order.
    // Never create a fake "UNKNOWN" entity in the identity graph.
  }
  return {
    observation_id: ["teknisa", record.route, record.record_type, record.record_id].join(":"),
    kind: "teknisa_sale",
    source_ref: { source: "teknisa", kind: record.record_type, id: record.record_id, unit_id: record.unit_id },
    observed_at: record.observed_at,
    occurred_at: record.occurred_at,
    correlation_proposals: proposals,
    payload: { route: record.route, payment_mapping: record.payment_mapping, amount: record.amount, ...(record.payload ?? {}) },
  };
}

export const TEKNISA_KNOWN_RETAIL_FACTS = Object.freeze({
  integration_code: "002",
  integration_identifier: "IFO",
  integration_name: "iFood",
  enabled: true,
  units: [{ code: "0001", name: "TATA ITAIM" }, { code: "0004", name: "TATA PINHEIROS" }],
  receiving_mappings: ["VOUCHER_IFOOD", "OFFLINE_IFOOD", "ONLINE_IFOOD"],
} as const);