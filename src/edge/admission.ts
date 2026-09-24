/**
 * Edge admission pipeline.
 * Durable journal is source truth for Edge observations.
 * Identity graph is rebuilt as a projection from that journal.
 */
import type { EdgeSourceObservation } from "./simulator";
import { rebuildIdentityGraph } from "./projection";
import type { FileEdgeStore, IngestReceipt } from "./runtime/store";

export class EdgeAdmissionPipeline {
  constructor(private readonly store: FileEdgeStore) {}

  admit(observation: EdgeSourceObservation): IngestReceipt {
    return this.store.ingest(observation);
  }

  admitMany(observations: readonly EdgeSourceObservation[]): IngestReceipt[] {
    return observations.map((observation) => this.admit(observation));
  }

  currentIdentitySnapshot(): string {
    return rebuildIdentityGraph(this.store.observations()).snapshot();
  }

  journalSize(): number {
    return this.store.observations().length;
  }
}