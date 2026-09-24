import { strict as assert } from "node:assert";
import { EdgeAdmissionPipeline } from "../src/edge/admission";
import { EdgeAdapterSupervisor } from "../src/edge/runtime/supervisor";
import type {
  EdgeJournalIngestReceipt,
  EdgeJournalPort,
} from "../src/edge/runtime/storePort";
import type { EdgeSourceObservation } from "../src/edge/simulator";

class MemoryJournal implements EdgeJournalPort {
  private readonly rows: EdgeSourceObservation[] = [];

  ingest(observation: EdgeSourceObservation): EdgeJournalIngestReceipt {
    if (this.rows.some((row) => row.observation_id === observation.observation_id)) {
      return {
        accepted: true,
        duplicate: true,
        observation_id: observation.observation_id,
      };
    }
    this.rows.push(structuredClone(observation));
    return {
      accepted: true,
      duplicate: false,
      observation_id: observation.observation_id,
    };
  }

  observations(): EdgeSourceObservation[] {
    return structuredClone(this.rows);
  }
}

async function main(): Promise<void> {
  const journal = new MemoryJournal();
  const pipeline = new EdgeAdmissionPipeline(journal);

  pipeline.admit({
    observation_id: "auth-human",
    kind: "auth_state",
    source_ref: {
      source: "ifood",
      kind: "auth_session",
      id: "profile-1",
      unit_id: "0001",
    },
    observed_at: "2026-09-24T21:00:00.000Z",
    payload: { health: "HUMAN_REQUIRED" },
  });

  const attention = pipeline.currentAttentionCandidates();
  assert.equal(attention.length, 1);
  assert.equal(attention[0].kind, "IFOOD_AUTH_HUMAN_REQUIRED");
  assert.equal(attention[0].delivery_hint, "SHOW");

  const supervisor = new EdgeAdapterSupervisor(journal);
  const results = await supervisor.runOnce([
    {
      adapter_id: "broken",
      collect() {
        throw new Error("synthetic");
      },
    },
    {
      adapter_id: "healthy",
      collect() {
        return [{
          observation_id: "print-ok",
          kind: "print_job" as const,
          source_ref: {
            source: "windows_print" as const,
            kind: "spool_job",
            id: "1",
            unit_id: "0001",
          },
          observed_at: "2026-09-24T21:01:00.000Z",
          payload: { state: "QUEUED" },
        }];
      },
    },
  ]);

  assert.equal(results[0].status, "failed");
  assert.equal(results[1].status, "ok");
  assert.equal(pipeline.journalSize(), 2);
  assert.equal(pipeline.currentAttentionCandidates().length, 1);

  console.log(JSON.stringify({
    status: "PASS",
    admission_uses_storage_port: true,
    supervisor_uses_storage_port: true,
    in_memory_backend_works: true,
    attention_rebuilds_from_journal: true,
    file_store_not_required_by_core: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
