/**
 * César Context Kernel v0.1 — pure projection layer.
 *
 * No external I/O, no personal source persistence and no notification effects.
 */

import type { EdgeManagerSnapshot } from "../edge/managerSnapshot";
import {
  replayCommitments,
  type CommitmentEvent,
  type CommitmentRecord,
} from "./commitments";
import {
  routeEvidenceDebt,
  type EvidenceDebtCase,
  type InvestigatorDecision,
} from "./investigator";
import {
  compileContextMode,
  type ContextSignal,
  type ModeDecision,
} from "./modeCompiler";
import {
  projectNeedsMe,
  type NeedsMeProjection,
} from "./needsMe";

export const CONTEXT_KERNEL_VERSION = "cesar-context-kernel@0.1.0";

export interface ContextKernelSnapshot {
  kernel_version: typeof CONTEXT_KERNEL_VERSION;
  generated_at: string;
  mode: ModeDecision;
  commitments: CommitmentRecord[];
  investigations: InvestigatorDecision[];
  needs_me: NeedsMeProjection;
  edge_fact_class?: EdgeManagerSnapshot["fact_class"];
}

export function buildContextKernelSnapshot(args: {
  now: string;
  signals: readonly ContextSignal[];
  commitment_events: readonly CommitmentEvent[];
  evidence_debt: readonly EvidenceDebtCase[];
  edge?: EdgeManagerSnapshot;
  cesar_assignee_ref?: string;
}): ContextKernelSnapshot {
  const mode = compileContextMode(args.signals);
  const commitments = replayCommitments(args.commitment_events);
  const investigations = args.evidence_debt.map(routeEvidenceDebt);

  return {
    kernel_version: CONTEXT_KERNEL_VERSION,
    generated_at: args.now,
    mode,
    commitments,
    investigations,
    needs_me: projectNeedsMe({
      now: args.now,
      mode,
      edge: args.edge,
      commitments,
      investigations,
      cesar_assignee_ref: args.cesar_assignee_ref ?? "cesar",
    }),
    edge_fact_class: args.edge?.fact_class,
  };
}
