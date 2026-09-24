import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EdgeAdmissionPipeline } from "../src/edge/admission";
import { runReadOnlyTransportCycle } from "../src/edge/transportCycle";
import { FileEdgeStore } from "../src/edge/runtime/store";
import type { IfoodBrowserReadOnlyTransport } from "../src/edge/ifood/browserTransport";
import type { PrintSnapshotSource } from "../src/edge/print/observer";

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "edge-transport-cycle-"));
  const file = join(dir, "state.json");
  try {
    let structuredCalls = 0;
    let downloadCalls = 0;
    const healthyBrowser: IfoodBrowserReadOnlyTransport = {
      async sessionHealth() {
        return { health: "HEALTHY", observed_at: "2026-09-25T00:00:00.000Z", profile_id: "profile-1" };
      },
      async collectStructured() {
        structuredCalls += 1;
        return [{
          capture_id: "cap-1", surface: "reviews", unit_id: "0001",
          observed_at: "2026-09-25T00:00:01.000Z", entity_id: "review-1",
          method: "GET", resource_fingerprint: "/reviews", payload: { score: 5 },
        }];
      },
      async collectDownloadMetadata() {
        downloadCalls += 1;
        return [{
          download_id: "d-1", surface: "financial", unit_id: "0001",
          observed_at: "2026-09-25T00:00:02.000Z", file_name: "f.csv",
        }];
      },
    };
    const printSource: PrintSnapshotSource = {
      async listJobs() {
        return [{
          queue_name: "Q", printer_name: "P", job_id: "1",
          observed_at: "2026-09-25T00:00:03.000Z", state: "QUEUED", unit_id: "0001",
        }];
      },
    };

    const pipeline = new EdgeAdmissionPipeline(new FileEdgeStore(file));
    const healthy = await runReadOnlyTransportCycle({ pipeline, browser: healthyBrowser, printSource, unit_id: "0001" });
    assert.equal(healthy.portal_observations, 1);
    assert.equal(healthy.print_observations, 1);
    assert.equal(structuredCalls, 1);
    assert.equal(downloadCalls, 1);
    assert.equal(pipeline.journalSize(), 3);

    const expiredBrowser: IfoodBrowserReadOnlyTransport = {
      async sessionHealth() {
        return { health: "EXPIRED", observed_at: "2026-09-25T00:01:00.000Z", profile_id: "profile-1" };
      },
      async collectStructured() {
        structuredCalls += 1;
        return [];
      },
      async collectDownloadMetadata() {
        downloadCalls += 1;
        return [];
      },
    };
    const expired = await runReadOnlyTransportCycle({ pipeline, browser: expiredBrowser, printSource, unit_id: "0001" });
    assert.equal(expired.portal_observations, 0);
    assert.equal(expired.print_observations, 1);
    assert.equal(structuredCalls, 1);
    assert.equal(downloadCalls, 1);

    console.log(JSON.stringify({
      status: "PASS",
      expired_session_blocks_portal_collection: true,
      print_observation_independent_of_ifood_auth: true,
      auth_state_admitted_as_safe_metadata: true,
    }, null, 2));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});