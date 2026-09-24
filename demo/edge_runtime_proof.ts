import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EDGE_SHADOW_FIXTURES } from "../src/edge/fixtures";
import { EdgeAdapterSupervisor } from "../src/edge/runtime/supervisor";
import { FileEdgeStore } from "../src/edge/runtime/store";

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "tata-edge-"));
  const file = join(dir, "edge-state.json");

  try {
    const store1 = new FileEdgeStore(file, () => new Date("2026-09-24T18:30:00.000Z"));
    for (const observation of EDGE_SHADOW_FIXTURES) {
      const receipt = store1.ingest(observation);
      assert.equal(receipt.duplicate, false);
    }
    assert.equal(store1.observations().length, EDGE_SHADOW_FIXTURES.length);

    const store2 = new FileEdgeStore(file, () => new Date("2026-09-24T18:31:00.000Z"));
    assert.equal(store2.observations().length, EDGE_SHADOW_FIXTURES.length);
    assert.equal(store2.pending().length, EDGE_SHADOW_FIXTURES.length);

    const duplicate = store2.ingest(EDGE_SHADOW_FIXTURES[0]);
    assert.equal(duplicate.duplicate, true);
    assert.equal(store2.observations().length, EDGE_SHADOW_FIXTURES.length);

    store2.markFailed(EDGE_SHADOW_FIXTURES[0].observation_id, "network_unavailable");
    const store3 = new FileEdgeStore(file, () => new Date("2026-09-24T18:32:00.000Z"));
    const failed = store3.pending().find(
      (item) => item.observation_id === EDGE_SHADOW_FIXTURES[0].observation_id,
    );
    assert.ok(failed);
    assert.equal(failed.status, "failed");
    assert.equal(failed.last_error, "network_unavailable");

    store3.markSent(EDGE_SHADOW_FIXTURES[0].observation_id);
    const store4 = new FileEdgeStore(file);
    assert.equal(
      store4.pending().some(
        (item) => item.observation_id === EDGE_SHADOW_FIXTURES[0].observation_id,
      ),
      false,
    );

    assert.throws(
      () =>
        store4.ingest({
          observation_id: "secret-must-not-persist",
          kind: "auth_state",
          source_ref: { source: "ifood", kind: "auth", id: "session" },
          observed_at: "2026-09-24T18:33:00.000Z",
          payload: { otp: "123456" },
        }),
      /forbidden persisted secret field/,
    );

    const supervisor = new EdgeAdapterSupervisor(store4);
    const freshObservation = {
      ...EDGE_SHADOW_FIXTURES[0],
      observation_id: "obs-good-adapter-new",
      source_ref: { ...EDGE_SHADOW_FIXTURES[0].source_ref, id: "IFOOD-NEW" },
    };
    const cycle = await supervisor.runOnce([
      {
        adapter_id: "broken",
        collect() {
          throw new Error("adapter_crashed");
        },
      },
      {
        adapter_id: "healthy",
        collect() {
          return [freshObservation];
        },
      },
    ]);

    assert.equal(cycle[0].status, "failed");
    assert.equal(cycle[1].status, "ok");
    assert.equal(cycle[1].collected, 1);
    assert.equal(
      store4.observations().some((item) => item.observation_id === "obs-good-adapter-new"),
      true,
    );

    console.log(
      JSON.stringify(
        {
          status: "PASS",
          restart_survival: true,
          duplicate_after_restart: true,
          failed_outbox_survives_restart: true,
          secret_persistence_blocked: true,
          adapter_failure_isolated: true,
        },
        null,
        2,
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
