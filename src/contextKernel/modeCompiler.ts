/**
 * César Context Kernel — deterministic mode compiler.
 *
 * Modes are context, not identity. No mode changes authority or truth class.
 * Explicit human mode always outranks inferred context.
 */

export type ContextMode =
  | "TRABALHO"
  | "PESSOAL"
  | "MISTO"
  | "FOCO"
  | "REUNIAO"
  | "OFF"
  | "UNKNOWN";

export type ContextDomain = "WORK" | "PERSONAL" | "SYSTEM";

export type ContextSignalKind =
  | "explicit_mode"
  | "work_activity"
  | "personal_activity"
  | "meeting_active";

export interface ContextSignal {
  signal_id: string;
  source: string;
  domain: ContextDomain;
  kind: ContextSignalKind;
  observed_at: string;
  active: boolean;
  mode?: Exclude<ContextMode, "UNKNOWN">;
}

export interface ModeDecision {
  mode: ContextMode;
  basis:
    | "EXPLICIT"
    | "ACTIVE_MEETING"
    | "WORK_AND_PERSONAL"
    | "WORK_ONLY"
    | "PERSONAL_ONLY"
    | "INSUFFICIENT_CONTEXT"
    | "CONFLICT";
  evidence_signal_ids: string[];
}

export function compileContextMode(
  signals: readonly ContextSignal[],
): ModeDecision {
  const active = signals.filter((signal) => signal.active);

  const explicit = active
    .filter(
      (signal): signal is ContextSignal & { mode: Exclude<ContextMode, "UNKNOWN"> } =>
        signal.kind === "explicit_mode" && signal.mode !== undefined,
    )
    .sort(
      (a, b) =>
        b.observed_at.localeCompare(a.observed_at) ||
        b.signal_id.localeCompare(a.signal_id),
    );

  if (explicit.length > 0) {
    const newestAt = explicit[0].observed_at;
    const newest = explicit.filter((signal) => signal.observed_at === newestAt);
    const modes = new Set(newest.map((signal) => signal.mode));
    if (modes.size > 1) {
      return {
        mode: "UNKNOWN",
        basis: "CONFLICT",
        evidence_signal_ids: newest.map((signal) => signal.signal_id).sort(),
      };
    }
    return {
      mode: explicit[0].mode,
      basis: "EXPLICIT",
      evidence_signal_ids: [explicit[0].signal_id],
    };
  }

  const meetings = active.filter((signal) => signal.kind === "meeting_active");
  if (meetings.length > 0) {
    return {
      mode: "REUNIAO",
      basis: "ACTIVE_MEETING",
      evidence_signal_ids: meetings.map((signal) => signal.signal_id).sort(),
    };
  }

  const work = active.filter(
    (signal) =>
      signal.kind === "work_activity" ||
      (signal.domain === "WORK" && signal.kind !== "personal_activity"),
  );
  const personal = active.filter(
    (signal) =>
      signal.kind === "personal_activity" ||
      (signal.domain === "PERSONAL" && signal.kind !== "work_activity"),
  );

  if (work.length > 0 && personal.length > 0) {
    return {
      mode: "MISTO",
      basis: "WORK_AND_PERSONAL",
      evidence_signal_ids: [...work, ...personal]
        .map((signal) => signal.signal_id)
        .sort(),
    };
  }

  if (work.length > 0) {
    return {
      mode: "TRABALHO",
      basis: "WORK_ONLY",
      evidence_signal_ids: work.map((signal) => signal.signal_id).sort(),
    };
  }

  if (personal.length > 0) {
    return {
      mode: "PESSOAL",
      basis: "PERSONAL_ONLY",
      evidence_signal_ids: personal.map((signal) => signal.signal_id).sort(),
    };
  }

  return {
    mode: "UNKNOWN",
    basis: "INSUFFICIENT_CONTEXT",
    evidence_signal_ids: [],
  };
}
