import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EDGE_SHADOW_FIXTURES } from "../src/edge/fixtures";
import { FileEdgeStore } from "../src/edge/runtime/store";

const dir = mkdtempSync(join(tmpdir(), "edge-store-recovery-"));
const file = join(dir, "edge-state.json");

try {
  const store = new FileEdgeStore(file);
  store.ingest(EDGE_SHADOW_FIXTURES[0]);
  store.ingest(EDGE_SHADOW_FIXTURES[1]);

  writeFileSync(file, "{not-json", "utf8");

  const recovered = new FileEdgeStore(file);
  assert.equal(recovered.observations().length, 1);
  assert.equal(
    recovered.observations()[0].observation_id,
    EDGE_SHADOW_FIXTURES[0].observation_id,
  );

  writeFileSync(file, "{still-bad", "utf8");
  writeFileSync(file + ".bak", "{also-bad", "utf8");

  assert.throws(
    () => new FileEdgeStore(file),
    /edge_store_corrupt/,
  );

  console.log(JSON.stringify({
    status: "PASS",
    corrupt_primary_recovers_from_backup: true,
    corrupt_primary_and_backup_fail_closed: true,
  }, null, 2));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
