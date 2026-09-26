/**
 * "Precisa de mim?" projection.
 *
 * This projection never claims global absence of problems. A quiet result means
 * only that the currently loaded evidence contains no direct César requirement.
 */

import type { EdgeManagerSnapshot } from "../edge/managerSnapshot";
import type { CommitmentRecord } from "./commitments";
import type { InvestigatorDecision } from "./investigator";
import type { ModeDecision } from "./modeCompiler";

export type NeedsMeState =
  | "YES"
  | "NO_KNOWN_NEED"
  | "UNKNOWN";

export type NeedsMeReasonKind =
  | "EDGE_HARD_EXCEPTION"
  | "CESAR_EVIDENCE_CONTEXT_REQUIRED"
  | "CESAR_COMMITMENT_OVERDUE";

export interface NeedsMeReason {
  kind: NeedsMeReasonKind;
  ref: string;
}

export interface NeedsMeProjection {
  state: NeedsMeState;
  mode: ModeDecision["mode"];
  reasons: NeedsMeReason[];
  global_clearance_claimed: false;
}

export function projectNeedsMe(args: {
  now: string;
  mode: ModeDecision;
  edge?: EdgeManagerSnapshot;
  commitments: readonly CommitmentRecord[];
  investigations: readonly InvestigatorDecision[];
  cesar_assignee_ref: string;
}): NeedsMeProjection {
  if (!Number.isFinite(Date.parse(args.now))) {
    throw new Error("invalid_needs_me_now");
  }

  const reasons: NeedsMeReason[] = [];

  for (const candidate of args.edge?.attention_candidates ?? []) {
    reasons.push({
      kind: "EDGE_HARD_EXCEPTION",
      ref: candidate.attention_id,
    });
  }

  for (const investigation of args.investigations) {
    if (investigation.route === "CESAR") {
      reasons.push({
        kind: "CESAR_EVIDENCE_CONTEXT_REQUIRED",
        ref: investigation.debt_id,
      });
    }
  }

  for (const commitment of args.commitments) {
    if (
      commitment.assignee_ref === args.cesar_assignee_ref &&
      commitment.due_at !== undefined &&
      commitment.status !== "PROVEN_CLOSED" &&
      commitment.status !== "CANCELLED" &&
      Date.parse(commitment.due_at) < Date.parse(args.now)
    ) {
      reasons.push({
        kind: "CESAR_COMMITMENT_OVERDUE",
        ref: commitment.commitment_id,
      });
    }
  }

  const deduped = dedupeReasons(reasons);

  if (deduped.length > 0) {
    return {
      state: "YES",
      mode: args.mode.mode,
      reasons: deduped,
      global_clearance_claimed: false,
    };
  }

  if (
    args.mode.mode === "UNKNOWN" &&
    args.edge === undefined &&
    args.commitments.length === 0 &&
    args.investigations.length === 0
  ) {
    return {
      state: "UNKNOWN",
      mode: args.mode.mode,
      reasons: [],
      global_clearance_claimed: false,
    };
  }

  return {
    state: "NO_KNOWN_NEED",
    mode: args.mode.mode,
    reasons: [],
    global_clearance_claimed: false,
  };
}

function dedupeReasons(reasons: readonly NeedsMeReason[]): NeedsMeReason[] {
  const unique = new Map<string, NeedsMeReason>();
  for (const reason of reasons) {
    unique.set(`${reason.kind}|${reason.ref}`, reason);
  }
  return [...unique.values()].sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.ref.localeCompare(b.ref),
  );
}
