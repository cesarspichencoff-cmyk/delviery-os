/**
 * Context Source Runtime v0.1.
 *
 * Refreshes safe context source batches independently, then builds one
 * Context Cycle snapshot. A failed source cannot erase successful sources.
 * Raw exception text never crosses the runtime boundary.
 */

import type { EdgeManagerSnapshot } from "../edge/managerSnapshot";
import type { AttentionPolicyEntry } from "./attentionPolicy";
import type { CommitmentEvent } from "./commitments";
import { buildContextCycle, type ContextCycleSnapshot } from "./cycle";
import type { EvidenceDebtCase } from "./investigator";
import type { ContextSignal } from "./modeCompiler";
import type { ScheduleEvent } from "./schedule";

export type ContextSourceMode = "synthetic" | "live_observed";

export interface ContextSourceBatch {
  source_mode: ContextSourceMode;
  context_signals?: ContextSignal[];
  schedule_events?: ScheduleEvent[];
  commitment_events?: CommitmentEvent[];
  evidence_debt?: EvidenceDebtCase[];
}

export interface ContextSourceAdapter {
  adapter_id: string;
  collect(): Promise<ContextSourceBatch> | ContextSourceBatch;
}

export interface ContextSourceReceipt {
  adapter_id: string;
  status: "ok" | "failed";
  error_code?: "source_failed" | "source_mode_conflict";
  collected: {
    context_signals: number;
    schedule_events: number;
    commitment_events: number;
    evidence_debt: number;
  };
}

export interface ContextRefreshResult {
  source_mode: ContextSourceMode | "empty";
  receipts: ContextSourceReceipt[];
  coverage_complete: boolean;
  cycle: ContextCycleSnapshot;
}

export async function runContextRefresh(args: {
  now: string;
  adapters: readonly ContextSourceAdapter[];
  attention_policy: readonly AttentionPolicyEntry[];
  edge?: EdgeManagerSnapshot;
  cesar_assignee_ref?: string;
}): Promise<ContextRefreshResult> {
  const receipts: ContextSourceReceipt[] = [];
  const accepted: ContextSourceBatch[] = [];
  let mode: ContextSourceMode | undefined;

  for (const adapter of args.adapters) {
    try {
      const batch = await adapter.collect();

      if (mode !== undefined && batch.source_mode !== mode) {
        receipts.push(failedReceipt(adapter.adapter_id, "source_mode_conflict"));
        continue;
      }

      if (!compatibleWithEdge(batch.source_mode, args.edge)) {
        receipts.push(failedReceipt(adapter.adapter_id, "source_mode_conflict"));
        continue;
      }

      mode ??= batch.source_mode;
      accepted.push(batch);
      receipts.push({
        adapter_id: safeAdapterId(adapter.adapter_id),
        status: "ok",
        collected: countBatch(batch),
      });
    } catch {
      receipts.push(failedReceipt(adapter.adapter_id, "source_failed"));
    }
  }

  const aggregate = aggregateBatches(accepted);

  return {
    source_mode: mode ?? "empty",
    receipts,
    coverage_complete: receipts.every((receipt) => receipt.status === "ok"),
    cycle: buildContextCycle({
      now: args.now,
      context_signals: aggregate.context_signals,
      schedule_events: aggregate.schedule_events,
      commitment_events: aggregate.commitment_events,
      evidence_debt: aggregate.evidence_debt,
      attention_policy: args.attention_policy,
      edge: args.edge,
      cesar_assignee_ref: args.cesar_assignee_ref,
    }),
  };
}

function aggregateBatches(batches: readonly ContextSourceBatch[]): {
  context_signals: ContextSignal[];
  schedule_events: ScheduleEvent[];
  commitment_events: CommitmentEvent[];
  evidence_debt: EvidenceDebtCase[];
} {
  return {
    context_signals: batches.flatMap((batch) => batch.context_signals ?? []),
    schedule_events: batches.flatMap((batch) => batch.schedule_events ?? []),
    commitment_events: batches.flatMap(
      (batch) => batch.commitment_events ?? [],
    ),
    evidence_debt: batches.flatMap((batch) => batch.evidence_debt ?? []),
  };
}

function compatibleWithEdge(
  sourceMode: ContextSourceMode,
  edge?: EdgeManagerSnapshot,
): boolean {
  if (!edge || edge.fact_class === "EMPTY") return true;
  if (edge.fact_class === "SIMULATION") return sourceMode === "synthetic";
  if (edge.fact_class === "FACT") return sourceMode === "live_observed";
  return false;
}

function countBatch(batch: ContextSourceBatch): ContextSourceReceipt["collected"] {
  return {
    context_signals: batch.context_signals?.length ?? 0,
    schedule_events: batch.schedule_events?.length ?? 0,
    commitment_events: batch.commitment_events?.length ?? 0,
    evidence_debt: batch.evidence_debt?.length ?? 0,
  };
}

function failedReceipt(
  adapterId: string,
  errorCode: "source_failed" | "source_mode_conflict",
): ContextSourceReceipt {
  return {
    adapter_id: safeAdapterId(adapterId),
    status: "failed",
    error_code: errorCode,
    collected: {
      context_signals: 0,
      schedule_events: 0,
      commitment_events: 0,
      evidence_debt: 0,
    },
  };
}

const SAFE_ADAPTER = /^[A-Za-z0-9._:-]{1,160}$/;

function safeAdapterId(value: string): string {
  return SAFE_ADAPTER.test(value) ? value : "redacted-adapter";
}
