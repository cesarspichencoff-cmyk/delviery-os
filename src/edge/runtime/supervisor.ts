import type { EdgeSourceObservation } from "../simulator";
import type { FileEdgeStore } from "./store";

export interface EdgeAdapter {
  adapter_id: string;
  collect(): Promise<EdgeSourceObservation[]> | EdgeSourceObservation[];
}

export interface AdapterCycleResult {
  adapter_id: string;
  collected: number;
  duplicates: number;
  status: "ok" | "failed";
  error?: string;
}

export class EdgeAdapterSupervisor {
  constructor(private readonly store: FileEdgeStore) {}

  async runOnce(adapters: readonly EdgeAdapter[]): Promise<AdapterCycleResult[]> {
    const results: AdapterCycleResult[] = [];

    for (const adapter of adapters) {
      try {
        const observations = await adapter.collect();
        let duplicates = 0;
        for (const observation of observations) {
          const receipt = this.store.ingest(observation);
          if (receipt.duplicate) duplicates += 1;
        }
        results.push({
          adapter_id: adapter.adapter_id,
          collected: observations.length,
          duplicates,
          status: "ok",
        });
      } catch (error) {
        results.push({
          adapter_id: adapter.adapter_id,
          collected: 0,
          duplicates: 0,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }
}
