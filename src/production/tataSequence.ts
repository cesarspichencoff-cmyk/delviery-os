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
    policy.max_value >= policy.min_value
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

  const scopedBindings = state.bindings.filter((binding) => binding.scope_id === scopeId);
  const duplicateOrderBindings = scopedBindings.filter(
    (binding) => binding.teknisa_order_id === teknisaOrderId,
  );

  if (duplicateOrderBindings.length > 1) {
    const unique = new Set(duplicateOrderBindings.map((binding) => binding.tata_sequence));
    if (unique.size > 1) blocking.add("ORDER_BOUND_TO_MULTIPLE_TATA_SEQUENCES");
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
