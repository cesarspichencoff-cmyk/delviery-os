export type ProductionShiftService = "LUNCH" | "DINNER";
export type ProductionShiftEvidence = "HUMAN_CONFIRMED_RULE" | "REAL_OBSERVED";

export interface ProductionServiceShiftState {
  schema: "deliveryos.production-service-shift-state.v2";
  store_id: string;
  operational_date: string;
  service: ProductionShiftService;
  evidence: ProductionShiftEvidence;
  source_ref: string;
  clock_inference_used: false;
  valid_until_local: string;
  updated_at: string;
}

export interface ProductionServiceShiftResolution {
  ready: boolean;
  blocking_reasons: string[];
  service_resolution: {
    service: ProductionShiftService | null;
    evidence: ProductionShiftEvidence | "UNKNOWN";
    source_ref: string | null;
  };
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function validOperationalDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function resolveProductionServiceShiftState(
  state: unknown,
  expected: { store_id: string; operational_date: string; order_opened_at: string },
): ProductionServiceShiftResolution {
  const blocking = new Set<string>();
  const raw = (state && typeof state === "object" ? state : {}) as Partial<ProductionServiceShiftState>;

  if (raw.schema !== "deliveryos.production-service-shift-state.v2") {
    blocking.add("SERVICE_STATE_SCHEMA_MISMATCH");
  }

  const expectedStore = clean(expected.store_id);
  const expectedDate = clean(expected.operational_date);
  if (!expectedStore) blocking.add("SERVICE_STATE_EXPECTED_STORE_REQUIRED");
  if (!validOperationalDate(expectedDate)) blocking.add("SERVICE_STATE_EXPECTED_OPERATIONAL_DATE_INVALID");

  const orderOpenedAt = clean(expected.order_opened_at).slice(0,19);
  const validUntilLocal = clean(raw.valid_until_local);
  const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
  if (!localDateTimePattern.test(orderOpenedAt)) blocking.add("SERVICE_STATE_ORDER_OPENED_AT_INVALID");
  if (!localDateTimePattern.test(validUntilLocal)) blocking.add("SERVICE_STATE_VALID_UNTIL_REQUIRED");
  if (
    localDateTimePattern.test(orderOpenedAt) &&
    localDateTimePattern.test(validUntilLocal) &&
    orderOpenedAt > validUntilLocal
  ) {
    blocking.add("SERVICE_STATE_EXPIRED_FOR_ORDER");
  }

  if (clean(raw.store_id) !== expectedStore) blocking.add("SERVICE_STATE_STORE_MISMATCH");
  if (clean(raw.operational_date) !== expectedDate) blocking.add("SERVICE_STATE_OPERATIONAL_DATE_MISMATCH");
  if (raw.clock_inference_used !== false) blocking.add("SERVICE_STATE_CLOCK_INFERENCE_FORBIDDEN");

  const service: ProductionShiftService | null =
    raw.service === "LUNCH" || raw.service === "DINNER" ? raw.service : null;
  if (!service) blocking.add("SERVICE_STATE_SERVICE_INVALID");

  const evidence: ProductionShiftEvidence | "UNKNOWN" =
    raw.evidence === "HUMAN_CONFIRMED_RULE" || raw.evidence === "REAL_OBSERVED"
      ? raw.evidence
      : "UNKNOWN";
  if (evidence === "UNKNOWN") blocking.add("SERVICE_STATE_EVIDENCE_REQUIRED");

  const sourceRef = clean(raw.source_ref) || null;
  if (!sourceRef) blocking.add("SERVICE_STATE_SOURCE_REF_REQUIRED");

  return {
    ready: blocking.size === 0,
    blocking_reasons: [...blocking].sort(),
    service_resolution: {
      service: blocking.size === 0 ? service : null,
      evidence: blocking.size === 0 ? evidence : "UNKNOWN",
      source_ref: blocking.size === 0 ? sourceRef : null,
    },
  };
}
