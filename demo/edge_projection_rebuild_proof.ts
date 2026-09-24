import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EDGE_SHADOW_FIXTURES } from "../src/edge/fixtures";
import { rebuildIdentityGraph } from "../src/edge/projection";
import { FileEdgeStore } from "../src/edge/runtime/store";
import { teknisaRecordToObservation } from "../src/edge/teknisa/adapter";

const dir = mkdtempSync(join(tmpdir(), "edge-projection-"));
const file = join(dir, "state.json");
try {
  const store = new FileEdgeStore(file);
  for (const observation of EDGE_SHADOW_FIXTURES) store.ingest(observation);
  store.ingest(teknisaRecordToObservation({
    source_mode: "synthetic",
    record_id: "sale-mapped-only",
    record_type: "sale",
    unit_id: "0001",
    observed_at: "2026-09-24T22:00:00.000Z",
    route: "structured_export",
    payment_mapping: "ONLINE_IFOOD",
  }));

  const before = rebuildIdentityGraph(store.observations()).snapshot();
  const restarted = new FileEdgeStore(file);
  const after = rebuildIdentityGraph(restarted.observations()).snapshot();
  assert.equal(after, before);

  const parsed = JSON.parse(after) as Array<{ right: { id: string } }>;
  assert.equal(parsed.some((link) => link.right.id === "UNKNOWN"), false);

  console.log(JSON.stringify({
    status: "PASS",
    identity_graph_rebuild_after_restart: true,
    identity_graph_is_projection: true,
    fake_unknown_identity_created: false,
  }, null, 2));
} finally {
  rmSync(dir, { recursive: true, force: true });
}