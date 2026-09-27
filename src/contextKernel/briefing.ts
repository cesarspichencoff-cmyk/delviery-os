/**
 * Structured briefing projection.
 *
 * No prose generation and no hidden prioritization score.
 */

import type { CommitmentRecord } from "./commitments";
import type { ContextKernelSnapshot } from "./kernel";
import type { ScheduleSnapshot } from "./schedule";

export interface BriefingSnapshot {
  generated_at: string;
  mode: ContextKernelSnapshot["mode"]["mode"];
  needs_me: ContextKernelSnapshot["needs_me"];
  active_schedule_event_ref?: string;
  next_schedule_event_ref?: string;
  open_commitments: number;
  waiting_commitments: number;
  done_unverified_commitments: number;
  proven_closed_commitments: number;
}

export function buildBriefingSnapshot(args: {
  kernel: ContextKernelSnapshot;
  schedule: ScheduleSnapshot;
}): BriefingSnapshot {
  return {
    generated_at: args.kernel.generated_at,
    mode: args.kernel.mode.mode,
    needs_me: args.kernel.needs_me,
    active_schedule_event_ref: args.schedule.active_event?.event_id,
    next_schedule_event_ref: args.schedule.next_event?.event_id,
    open_commitments: count(args.kernel.commitments, "OPEN"),
    waiting_commitments: count(args.kernel.commitments, "WAITING"),
    done_unverified_commitments: count(
      args.kernel.commitments,
      "DONE_UNVERIFIED",
    ),
    proven_closed_commitments: count(
      args.kernel.commitments,
      "PROVEN_CLOSED",
    ),
  };
}

function count(
  commitments: readonly CommitmentRecord[],
  status: CommitmentRecord["status"],
): number {
  return commitments.filter((item) => item.status === status).length;
}
