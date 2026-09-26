import type { EdgeSourceObservation } from "../simulator";

export interface EdgeJournalIngestReceipt {
  accepted: boolean;
  duplicate: boolean;
  observation_id: string;
}

/**
 * Minimal durable-observation boundary consumed by admission/supervision.
 *
 * FileEdgeStore is the current synthetic implementation. A future production
 * backend (for example SQLite) can implement this port without changing source
 * adapters, identity projection or attention projection.
 */
export interface EdgeJournalPort {
  ingest(observation: EdgeSourceObservation): EdgeJournalIngestReceipt;
  observations(): EdgeSourceObservation[];
}

export function assertJournalSourceModeCompatibility(
  existing: readonly EdgeSourceObservation[],
  incoming: EdgeSourceObservation,
): void {
  const modes = new Set(existing.map((row) => row.source_mode));
  if (modes.size > 1) {
    throw new Error("mixed_observation_source_modes");
  }

  const currentMode = existing[0]?.source_mode;
  if (currentMode !== undefined && currentMode !== incoming.source_mode) {
    throw new Error("edge_source_mode_conflict");
  }
}
