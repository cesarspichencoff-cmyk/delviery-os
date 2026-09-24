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
