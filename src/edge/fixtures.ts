import type { EdgeSourceObservation } from "./simulator";

export const EDGE_SHADOW_FIXTURES: EdgeSourceObservation[] = [
  {
    observation_id: "obs-ifood-1001",
    kind: "ifood_order",
    source_ref: { source: "ifood", kind: "order", id: "IFOOD-1001", unit_id: "0001" },
    observed_at: "2026-09-24T18:00:01.000Z",
    occurred_at: "2026-09-24T18:00:00.000Z",
    payload: { payment_mapping: "ONLINE_IFOOD", amount: 189.4 },
  },
  {
    observation_id: "obs-teknisa-7001",
    kind: "teknisa_sale",
    source_ref: { source: "teknisa", kind: "sale", id: "7001", unit_id: "0001" },
    observed_at: "2026-09-24T18:00:04.000Z",
    correlation_proposals: [
      {
        target: { source: "ifood", kind: "order", id: "IFOOD-1001", unit_id: "0001" },
        evidence: [
          {
            evidence_id: "ev-teknisa-ifood-external-id",
            dimension: "exact_external_id",
            detail: "teknisa_external_order_id_explicit",
          },
        ],
      },
    ],
    payload: { amount: 189.4, payment_mapping: "ONLINE_IFOOD" },
  },
  {
    observation_id: "obs-print-501",
    kind: "print_job",
    source_ref: { source: "windows_print", kind: "job", id: "501", unit_id: "0001" },
    observed_at: "2026-09-24T18:00:06.000Z",
    correlation_proposals: [
      {
        target: { source: "teknisa", kind: "sale", id: "7001", unit_id: "0001" },
        evidence: [
          {
            evidence_id: "ev-print-command-reference",
            dimension: "explicit_source_reference",
            detail: "print_metadata_teknisa_reference",
          },
        ],
      },
    ],
    payload: { printer: "COZINHA_A" },
  },
  {
    observation_id: "obs-trip-901",
    kind: "delivery_trip",
    source_ref: { source: "deliveryos", kind: "trip", id: "901", unit_id: "0001" },
    observed_at: "2026-09-24T18:27:00.000Z",
    correlation_proposals: [
      {
        target: { source: "ifood", kind: "order", id: "IFOOD-1001", unit_id: "0001" },
        evidence: [
          {
            evidence_id: "ev-trip-unit",
            dimension: "unit",
            detail: "same_unit",
          },
          {
            evidence_id: "ev-trip-amount",
            dimension: "amount",
            detail: "amount_match",
          },
          {
            evidence_id: "ev-trip-time",
            dimension: "timestamp_window",
            detail: "time_window_compatible",
          },
        ],
      },
    ],
    payload: { driver_id: "PSEUDONYM-01" },
  },
  {
    observation_id: "obs-review-301",
    kind: "review",
    source_ref: { source: "review", kind: "review", id: "301", unit_id: "0001" },
    observed_at: "2026-09-25T12:00:00.000Z",
    correlation_proposals: [
      {
        target: { source: "ifood", kind: "order", id: "IFOOD-1001", unit_id: "0001" },
        evidence: [
          {
            evidence_id: "ev-review-order-reference",
            dimension: "explicit_source_reference",
            detail: "review_order_reference_explicit",
          },
        ],
      },
    ],
    payload: { score: 2 },
  },
  {
    observation_id: "obs-time-only",
    kind: "print_job",
    source_ref: { source: "windows_print", kind: "job", id: "999", unit_id: "0001" },
    observed_at: "2026-09-24T18:00:02.000Z",
    correlation_proposals: [
      {
        target: { source: "ifood", kind: "order", id: "IFOOD-OTHER", unit_id: "0001" },
        evidence: [
          {
            evidence_id: "ev-only-time",
            dimension: "timestamp_window",
            detail: "timestamp_only",
          },
        ],
      },
    ],
    payload: {},
  },
];
