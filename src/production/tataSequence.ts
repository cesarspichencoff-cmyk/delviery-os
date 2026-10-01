export interface TataSequencePolicy {
  width: number;
  min_value: number;
  max_value: number;
}

export interface TataSequenceBinding {
  scope_id: string;
  teknisa_order_id: string;
  tata_sequence: string;
}

export interface TataSequenceState {
  schema: "deliveryos.tata-sequence-state.v1";
  policy: TataSequencePolicy;
  next_value: number;
  bindings: TataSequenceBinding[];
}

export interface TataSequencePlan {
  schema: "deliveryos.tata-sequence-plan.v1";
  ready: boolean;
  blocking_reasons: string[];
  assignment: TataSequenceBinding | null;
  next_state: TataSequenceState | null;
  reused_existing: boolean;
  effects: {
    persistence_write: false;
    print: false;
    odhen_write: false;
  };
}

export interface TataSequenceScopeResolution {
  scope_id: string | null;
  evidence: "HUMAN_CONFIRMED_RULE" | "REAL_OBSERVED" | "UNKNOWN";
  source_ref: string | null;
}

export interface DailyStoreTataSequenceContext {
  store_id: string;
  operational_date: string;
}

export const DAILY_STORE_TATA_SEQUENCE_RULE = {
  policy: "RESET_EACH_STORE_LOCAL_CALENDAR_DAY",
  evidence: "HUMAN_CONFIRMED_RULE" as const,
  source_ref: "human:cesar:2026-10-01:daily-store-tata-sequence",
} as const;

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function validPolicy(policy: TataSequencePolicy): boolean {
  return (
    Number.isInteger(policy.width) &&
    policy.width >= 1 &&
    policy.width <= 9 &&
    Number.isInteger(policy.min_value) &&
    Number.isInteger(policy.max_value) &&
    policy.min_value >= 0 &&
    policy.max_value >= policy.min_value &&
    policy.max_value <= Math.pow(10, policy.width) - 1
  );
}

function formatSequence(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function cloneState(state: TataSequenceState): TataSequenceState {
  return {
    schema: state.schema,
    policy: { ...state.policy },
    next_value: state.next_value,
    bindings: state.bindings.map((binding) => ({ ...binding })),
  };
}

/**
 * Pure assignment planner.
 *
 * It deliberately does NOT decide what "scope" means (day, service, store, etc.).
 * The caller must provide an explicit scope_id and an already-loaded state.
 * Persistence/reset policy is a separate operational decision.
 */
export function planTataSequence(
  state: TataSequenceState,
  scopeIdRaw: string,
  teknisaOrderIdRaw: string,
): TataSequencePlan {
  const blocking = new Set<string>();
  const scopeId = clean(scopeIdRaw);
  const teknisaOrderId = clean(teknisaOrderIdRaw);

  if (!scopeId) blocking.add("MISSING_SEQUENCE_SCOPE");
  if (!teknisaOrderId) blocking.add("MISSING_TEKNISA_ORDER_ID");
  if (!validPolicy(state.policy)) blocking.add("INVALID_SEQUENCE_POLICY");
  if (!Number.isInteger(state.next_value)) blocking.add("INVALID_NEXT_SEQUENCE_VALUE");

  const bindingBySequence = new Map<string, string>();
  const bindingByOrder = new Map<string, string>();

  for (const binding of state.bindings) {
    const bindingScope = clean(binding.scope_id);
    const bindingOrder = clean(binding.teknisa_order_id);
    const bindingSequence = clean(binding.tata_sequence);

    if (!bindingScope || !bindingOrder || !bindingSequence) {
      blocking.add("INVALID_EXISTING_SEQUENCE_BINDING");
      continue;
    }

    if (bindingScope !== scopeId) continue;

    const priorOrder = bindingBySequence.get(bindingSequence);
    if (priorOrder && priorOrder !== bindingOrder) {
      blocking.add(`EXISTING_TATA_SEQUENCE_COLLISION:${bindingSequence}`);
    } else {
      bindingBySequence.set(bindingSequence, bindingOrder);
    }

    const priorSequence = bindingByOrder.get(bindingOrder);
    if (priorSequence && priorSequence !== bindingSequence) {
      blocking.add(`ORDER_BOUND_TO_MULTIPLE_TATA_SEQUENCES:${bindingOrder}`);
    } else {
      bindingByOrder.set(bindingOrder, bindingSequence);
    }
  }

  const scopedBindings = state.bindings.filter((binding) => binding.scope_id === scopeId);
  const duplicateOrderBindings = scopedBindings.filter(
    (binding) => binding.teknisa_order_id === teknisaOrderId,
  );

  if (duplicateOrderBindings.length > 1) {
    const unique = new Set(duplicateOrderBindings.map((binding) => binding.tata_sequence));
    if (unique.size > 1) {
      blocking.add(`ORDER_BOUND_TO_MULTIPLE_TATA_SEQUENCES:${teknisaOrderId}`);
    }
  }

  const existing = duplicateOrderBindings[0] ?? null;
  if (existing && blocking.size === 0) {
    return {
      schema: "deliveryos.tata-sequence-plan.v1",
      ready: true,
      blocking_reasons: [],
      assignment: { ...existing },
      next_state: cloneState(state),
      reused_existing: true,
      effects: {
        persistence_write: false,
        print: false,
        odhen_write: false,
      },
    };
  }

  const candidate = formatSequence(state.next_value, state.policy.width);
  const sequenceCollision = scopedBindings.some(
    (binding) =>
      binding.tata_sequence === candidate &&
      binding.teknisa_order_id !== teknisaOrderId,
  );
  if (sequenceCollision) blocking.add("TATA_SEQUENCE_COLLISION");

  if (
    state.next_value < state.policy.min_value ||
    state.next_value > state.policy.max_value
  ) {
    blocking.add("TATA_SEQUENCE_OUT_OF_RANGE");
  }

  if (blocking.size > 0) {
    return {
      schema: "deliveryos.tata-sequence-plan.v1",
      ready: false,
      blocking_reasons: [...blocking].sort(),
      assignment: null,
      next_state: null,
      reused_existing: false,
      effects: {
        persistence_write: false,
        print: false,
        odhen_write: false,
      },
    };
  }

  const assignment: TataSequenceBinding = {
    scope_id: scopeId,
    teknisa_order_id: teknisaOrderId,
    tata_sequence: candidate,
  };

  const nextState = cloneState(state);
  nextState.bindings.push(assignment);
  nextState.next_value = state.next_value + 1;

  return {
    schema: "deliveryos.tata-sequence-plan.v1",
    ready: true,
    blocking_reasons: [],
    assignment,
    next_state: nextState,
    reused_existing: false,
    effects: {
      persistence_write: false,
      print: false,
      odhen_write: false,
    },
  };
}

/**
 * Gate above the low-level sequence planner.
 *
 * It does not decide whether a sequence resets by day, service or another
 * operational boundary. That policy must be externally resolved and evidenced.
 */
export function planTataSequenceWithResolvedScope(
  state: TataSequenceState,
  scope: TataSequenceScopeResolution,
  teknisaOrderIdRaw: string,
): TataSequencePlan {
  const blocking = new Set<string>();
  const scopeId = clean(scope.scope_id);
  const sourceRef = clean(scope.source_ref);

  if (!scopeId) blocking.add("TATA_SEQUENCE_SCOPE_REQUIRED");
  if (
    scope.evidence !== "HUMAN_CONFIRMED_RULE" &&
    scope.evidence !== "REAL_OBSERVED"
  ) {
    blocking.add("TATA_SEQUENCE_SCOPE_EVIDENCE_REQUIRED");
  }
  if (!sourceRef) blocking.add("TATA_SEQUENCE_SCOPE_SOURCE_REF_REQUIRED");

  if (blocking.size > 0) {
    return {
      schema: "deliveryos.tata-sequence-plan.v1",
      ready: false,
      blocking_reasons: [...blocking].sort(),
      assignment: null,
      next_state: null,
      reused_existing: false,
      effects: {
        persistence_write: false,
        print: false,
        odhen_write: false,
      },
    };
  }

  return planTataSequence(state, scopeId, teknisaOrderIdRaw);
}


function validIsoLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

export function buildDailyStoreTataSequenceScope(
  context: DailyStoreTataSequenceContext,
): TataSequenceScopeResolution {
  const storeId = clean(context.store_id);
  const date = clean(context.operational_date);

  if (!storeId || !validIsoLocalDate(date)) {
    return {
      scope_id: null,
      evidence: "UNKNOWN",
      source_ref: null,
    };
  }

  return {
    scope_id: `STORE:${storeId}|DATE:${date}`,
    evidence: DAILY_STORE_TATA_SEQUENCE_RULE.evidence,
    source_ref: DAILY_STORE_TATA_SEQUENCE_RULE.source_ref,
  };
}

/**
 * Human-confirmed operational policy:
 * - numbering is scoped by store + store-local calendar date;
 * - every new local calendar date starts again at policy.min_value;
 * - the same Teknisa order reuses its original number inside that day;
 * - reprints therefore keep the same TATA sequence;
 * - no cross-day carry-over of the numeric counter.
 *
 * The caller supplies the already-resolved store-local YYYY-MM-DD. This pure
 * function does not infer timezone from the machine clock.
 */
export function planDailyStoreTataSequence(
  state: TataSequenceState,
  context: DailyStoreTataSequenceContext,
  teknisaOrderIdRaw: string,
): TataSequencePlan {
  const scope = buildDailyStoreTataSequenceScope(context);
  const scopeId = clean(scope.scope_id);

  if (!scopeId) {
    return planTataSequenceWithResolvedScope(
      state,
      scope,
      teknisaOrderIdRaw,
    );
  }

  const scopedBindings = state.bindings.filter(
    (binding) => clean(binding.scope_id) === scopeId,
  );

  let scopedNextValue = state.policy.min_value;
  if (scopedBindings.length > 0) {
    const numericValues = scopedBindings
      .map((binding) => Number(binding.tata_sequence))
      .filter((value) => Number.isInteger(value));
    if (numericValues.length > 0) {
      scopedNextValue = Math.max(...numericValues) + 1;
    }
  }

  const scopedState: TataSequenceState = {
    schema: state.schema,
    policy: { ...state.policy },
    next_value: scopedNextValue,
    bindings: state.bindings.map((binding) => ({ ...binding })),
  };

  return planTataSequenceWithResolvedScope(
    scopedState,
    scope,
    teknisaOrderIdRaw,
  );
}

export function validateSharedTataSequence(
  expected: TataSequenceBinding,
  stationSequences: Array<{ station: string; tata_sequence: string }>,
): { ready: boolean; blocking_reasons: string[] } {
  const blocking = new Set<string>();
  const expectedSequence = clean(expected.tata_sequence);

  if (!expectedSequence) blocking.add("MISSING_EXPECTED_TATA_SEQUENCE");
  if (!stationSequences.length) blocking.add("NO_STATION_SEQUENCES");

  for (const station of stationSequences) {
    if (!clean(station.station)) blocking.add("MISSING_STATION_NAME");
    if (clean(station.tata_sequence) !== expectedSequence) {
      blocking.add(`STATION_SEQUENCE_MISMATCH:${clean(station.station) || "UNKNOWN"}`);
    }
  }

  return {
    ready: blocking.size === 0,
    blocking_reasons: [...blocking].sort(),
  };
}
