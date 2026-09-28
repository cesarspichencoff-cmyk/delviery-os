export type PassiveTailDecision =
  | "INITIAL_SNAPSHOT"
  | "NO_CHANGE"
  | "APPEND"
  | "ROTATED_OR_REPLACED"
  | "TRUNCATED"
  | "SOURCE_MISSING";

export interface PassiveFileIdentity {
  path: string;
  size: number;
  mtime_ms: number;
  file_id?: string | null;
}

export interface PassiveTailCheckpoint {
  source: PassiveFileIdentity;
  offset: number;
}

export interface PassiveTailPlan {
  schema: "deliveryos.shadow.passive-tail-plan.v1";
  decision: PassiveTailDecision;
  read_from: number | null;
  read_to: number | null;
  next_checkpoint: PassiveTailCheckpoint | null;
  blocking_reasons: string[];
  effects: {
    read_only: true;
    source_write: false;
    source_rename: false;
    source_truncate: false;
    print_call: false;
  };
}

function sameIdentity(a: PassiveFileIdentity, b: PassiveFileIdentity): boolean {
  if (a.file_id && b.file_id) return a.file_id === b.file_id;
  return a.path === b.path;
}

/**
 * Pure cursor planner. It never touches the filesystem.
 *
 * A real reader should first collect file metadata, call this function, then open
 * only the exact [read_from, read_to) range with non-exclusive read sharing.
 */
export function planPassiveTail(
  previous: PassiveTailCheckpoint | null,
  current: PassiveFileIdentity | null,
): PassiveTailPlan {
  const effects = {
    read_only: true as const,
    source_write: false as const,
    source_rename: false as const,
    source_truncate: false as const,
    print_call: false as const,
  };

  if (!current) {
    return {
      schema: "deliveryos.shadow.passive-tail-plan.v1",
      decision: "SOURCE_MISSING",
      read_from: null,
      read_to: null,
      next_checkpoint: null,
      blocking_reasons: ["SOURCE_UNAVAILABLE"],
      effects,
    };
  }

  if (!previous) {
    return {
      schema: "deliveryos.shadow.passive-tail-plan.v1",
      decision: "INITIAL_SNAPSHOT",
      read_from: null,
      read_to: null,
      next_checkpoint: { source: current, offset: current.size },
      blocking_reasons: ["INITIAL_BASELINE_ONLY_DO_NOT_REPLAY_HISTORY"],
      effects,
    };
  }

  if (!sameIdentity(previous.source, current)) {
    return {
      schema: "deliveryos.shadow.passive-tail-plan.v1",
      decision: "ROTATED_OR_REPLACED",
      read_from: null,
      read_to: null,
      next_checkpoint: { source: current, offset: current.size },
      blocking_reasons: ["SOURCE_ROTATED_BASELINE_RESET"],
      effects,
    };
  }

  if (current.size < previous.offset) {
    return {
      schema: "deliveryos.shadow.passive-tail-plan.v1",
      decision: "TRUNCATED",
      read_from: null,
      read_to: null,
      next_checkpoint: { source: current, offset: current.size },
      blocking_reasons: ["SOURCE_TRUNCATED_BASELINE_RESET"],
      effects,
    };
  }

  if (current.size === previous.offset) {
    return {
      schema: "deliveryos.shadow.passive-tail-plan.v1",
      decision: "NO_CHANGE",
      read_from: null,
      read_to: null,
      next_checkpoint: { source: current, offset: current.size },
      blocking_reasons: [],
      effects,
    };
  }

  return {
    schema: "deliveryos.shadow.passive-tail-plan.v1",
    decision: "APPEND",
    read_from: previous.offset,
    read_to: current.size,
    next_checkpoint: { source: current, offset: current.size },
    blocking_reasons: [],
    effects,
  };
}
