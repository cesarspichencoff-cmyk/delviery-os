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
  valid_from_local: string;
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T12:00:00.000Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** A clock-local timestamp, optionally with up to seven fractional ticks.
 * Reject offsets and extra suffixes instead of silently truncating them. */
function exactLocalTicks(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?$/.exec(value);
  if (!m || !validOperationalDate(m[1].slice(0, 10))) return null;
  const [hour, minute, second] = m[1].slice(11).split(":").map(Number);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return m[1] + "." + (m[2] || "").padEnd(7, "0");
}

/** Structural, fail-closed source consistency only. A self-declared evidence
 * field does NOT authenticate a human or authorize state writes or printing.
 * Alignment with the installed Windows V2 watcher is required for any future
 * separately approved operational activation. */
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

  const orderOpenedAt = exactLocalTicks(expected.order_opened_at);
  const validFrom = exactLocalTicks(raw.valid_from_local);
  const validUntil = exactLocalTicks(raw.valid_until_local);
  if (!orderOpenedAt) blocking.add("SERVICE_STATE_ORDER_OPENED_AT_INVALID");
  if (!validFrom) blocking.add("SERVICE_STATE_VALID_FROM_REQUIRED");
  if (!validUntil) blocking.add("SERVICE_STATE_VALID_UNTIL_REQUIRED");
  if (orderOpenedAt && validFrom && orderOpenedAt < validFrom)
    blocking.add("SERVICE_STATE_NOT_YET_ACTIVE_FOR_ORDER");
  // The installed Windows V2 watcher rejects equality at the end boundary.
  if (orderOpenedAt && validUntil && orderOpenedAt >= validUntil)
    blocking.add("SERVICE_STATE_EXPIRED_FOR_ORDER");
  if (orderOpenedAt && validOperationalDate(expectedDate) &&
      orderOpenedAt.slice(0, 10) !== expectedDate)
    blocking.add("SERVICE_STATE_ORDER_OPENED_DATE_MISMATCH");
  if (validFrom && validUntil &&
      (validFrom >= validUntil ||
       validFrom.slice(0, 10) !== clean(raw.operational_date) ||
       validUntil.slice(0, 10) !== clean(raw.operational_date)))
    blocking.add("SERVICE_STATE_WINDOW_INVALID");

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
