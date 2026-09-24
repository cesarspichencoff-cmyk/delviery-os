/**
 * Edge admission pipeline.
 * Durable journal is source truth for Edge observations.
 * Identity and attention are rebuildable projections from that journal.
 */
import type { EdgeSourceObservation } from "./simulator";
import { rebuildIdentityGraph } from "./projection";
import { projectAttention, type AttentionCandidate } from "./attention";
import {
  assertJournalSourceModeCompatibility,
  type EdgeJournalIngestReceipt,
  type EdgeJournalPort,
} from "./runtime/storePort";

export class EdgeAdmissionPipeline {
  constructor(private readonly store: EdgeJournalPort) {}

  admit(observation: EdgeSourceObservation): EdgeJournalIngestReceipt {
    assertJournalSourceModeCompatibility(this.store.observations(), observation);
    return this.store.ingest(observation);
  }

  admitMany(
    observations: readonly EdgeSourceObservation[],
  ): EdgeJournalIngestReceipt[] {
    return observations.map((observation) => this.admit(observation));
  }

  currentIdentitySnapshot(): string {
    return rebuildIdentityGraph(this.store.observations()).snapshot();
  }

  currentAttentionCandidates(): AttentionCandidate[] {
    return projectAttention(this.store.observations());
  }

  journalSize(): number {
    return this.store.observations().length;
  }
}
