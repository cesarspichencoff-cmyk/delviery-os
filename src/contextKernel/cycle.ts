/**
 * Context Cycle v0.1 — one pure evaluation pass.
 *
 * This composes the existing projections into the product-facing snapshot.
 * It performs no external reads, writes or notifications.
 */
import type { EdgeManagerSnapshot } from "../edge/managerSnapshot";
import {
  buildAttentionDeliveryPlan,
  type AttentionDeliveryPlan,
  type AttentionPolicyEntry,
} from "./attentionPolicy";
import {
  buildBriefingSnapshot,
  type BriefingSnapshot,
} from "./briefing";
import type { CommitmentEvent } from "./commitments";
import type { EvidenceDebtCase } from "./investigator";
import {
  buildContextKernelSnapshot,
  type ContextKernelSnapshot,
} from "./kernel";
import type { ContextSignal } from "./modeCompiler";
import {
  buildScheduleSnapshot,
  scheduleToContextSignals,
  type ScheduleEvent,
  type ScheduleSnapshot,
} from "./schedule";

export const CONTEXT_CYCLE_VERSION = "cesar-context-cycle@0.1.0";

export interface ContextCycleSnapshot {
  cycle_version: typeof CONTEXT_CYCLE_VERSION;
  generated_at: string;
  schedule: ScheduleSnapshot;
  kernel: ContextKernelSnapshot;
  briefing: BriefingSnapshot;
  attention_delivery: AttentionDeliveryPlan;
  external_effects_authorized: false;
}

export function buildContextCycle(args: {
  now: string;
  context_signals: readonly ContextSignal[];
  schedule_events: readonly ScheduleEvent[];
  commitment_events: readonly CommitmentEvent[];
  evidence_debt: readonly EvidenceDebtCase[];
  attention_policy: readonly AttentionPolicyEntry[];
  edge?: EdgeManagerSnapshot;
  cesar_assignee_ref?: string;
}): ContextCycleSnapshot {
  const schedule = buildScheduleSnapshot(args.schedule_events, args.now);
  const signals = [
    ...args.context_signals,
    ...scheduleToContextSignals(schedule),
  ];

  const kernel = buildContextKernelSnapshot({
    now: args.now,
    signals,
    commitment_events: args.commitment_events,
    evidence_debt: args.evidence_debt,
    edge: args.edge,
    cesar_assignee_ref: args.cesar_assignee_ref,
  });

  const briefing = buildBriefingSnapshot({
    kernel,
    schedule,
  });

  const attentionDelivery = buildAttentionDeliveryPlan({
    needs_me: kernel.needs_me,
    policy: args.attention_policy,
  });

  return {
    cycle_version: CONTEXT_CYCLE_VERSION,
    generated_at: args.now,
    schedule,
    kernel,
    briefing,
    attention_delivery: attentionDelivery,
    external_effects_authorized: false,
  };
}
