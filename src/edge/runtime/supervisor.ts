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
  error_code?: "adapter_failed";
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
      } catch {
        // Raw exception strings can contain URLs, credentials, tokens or PII.
        // Keep the supervisor receipt intentionally generic.
        results.push({
          adapter_id: adapter.adapter_id,
          collected: 0,
          duplicates: 0,
          status: "failed",
          error_code: "adapter_failed",
        });
      }
    }

    return results;
  }
}
