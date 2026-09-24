/**
 * Windows print observability contract.
 *
 * Observation only. There is intentionally no submit/cancel/reorder API.
 * A spooler state can prove software-path facts, never physical print success.
 */

import type { EdgeSourceObservation } from "../simulator";

export type PrintJobObservedState =
  | "QUEUED"
  | "PRINTING"
  | "PAUSED"
  | "ERROR"
  | "DELETING"
  | "NO_LONGER_LISTED";

export interface PrintJobSnapshot {
  queue_name: string;
  printer_name: string;
  job_id: string;
  document_name?: string;
  owner_pseudonym?: string;
  submitted_at?: string;
  observed_at: string;
  state: PrintJobObservedState;
  unit_id: string;
}

export interface PrintObservation {
  observation: EdgeSourceObservation;
  physical_effect: "UNKNOWN";
}

const SAFE_DOCUMENT_HINT = /^[A-Za-z0-9._:-]{1,80}$/;

export function safeDocumentHint(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed=value.trim();
  return SAFE_DOCUMENT_HINT.test(trimmed) ? trimmed : undefined;
}

export function printSnapshotToObservation(
  snapshot: PrintJobSnapshot,
): PrintObservation {
  const eventId = [
    "print",
    snapshot.queue_name,
    snapshot.job_id,
    snapshot.state,
    snapshot.observed_at,
  ].join(":");

  return {
    observation: {
      observation_id: eventId,
      kind: "print_job",
      source_ref: {
        source: "windows_print",
        kind: "spool_job",
        id: snapshot.job_id,
        unit_id: snapshot.unit_id,
      },
      observed_at: snapshot.observed_at,
      occurred_at: snapshot.submitted_at,
      payload: {
        queue_name: snapshot.queue_name,
        printer_name: snapshot.printer_name,
        document_hint: safeDocumentHint(snapshot.document_name),
        state: snapshot.state,
      },
    },
    physical_effect: "UNKNOWN",
  };
}

export interface PrintSnapshotSource {
  listJobs(): Promise<PrintJobSnapshot[]> | PrintJobSnapshot[];
}

/**
 * Reads a snapshot and returns observations. No mutation method is accepted by
 * the interface, which keeps shadow mode structurally observation-only.
 */
export async function observePrintJobs(
  source: PrintSnapshotSource,
): Promise<PrintObservation[]> {
  const jobs = await source.listJobs();
  return jobs.map(printSnapshotToObservation);
}

export const PRINT_OBSERVER_CAPABILITIES = Object.freeze([
  "list_jobs",
  "observe_job_state",
] as const);
