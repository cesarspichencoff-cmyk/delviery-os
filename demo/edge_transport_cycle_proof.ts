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
        return {
          health: "HEALTHY",
          observed_at: "2026-09-25T00:00:00.000Z",
          profile_id: "profile-1",
        };
      },
      async collectStructured() {
        structuredCalls += 1;
        return [{
          capture_id: "cap-1",
          surface: "reviews",
          unit_id: "0001",
          observed_at: "2026-09-25T00:00:01.000Z",
          entity_id: "review-1",
          method: "GET",
          resource_fingerprint: "/reviews",
          payload: { score: 5 },
        }];
      },
      async collectDownloadMetadata() {
        downloadCalls += 1;
        return [{
          download_id: "d-1",
          surface: "financial",
          unit_id: "0001",
          observed_at: "2026-09-25T00:00:02.000Z",
          file_name: "f.csv",
        }];
      },
    };

    const printSource: PrintSnapshotSource = {
      async listJobs() {
        return [{
          queue_name: "Q",
          printer_name: "P",
          job_id: "1",
          observed_at: "2026-09-25T00:00:03.000Z",
          state: "QUEUED",
          unit_id: "0001",
        }];
      },
    };

    const pipeline = new EdgeAdmissionPipeline(new FileEdgeStore(file));

    const healthy = await runReadOnlyTransportCycle({
      pipeline,
      browser: healthyBrowser,
      printSource,
      unit_id: "0001",
    });
    assert.equal(healthy.session_status, "ok");
    assert.equal(healthy.structured_status, "ok");
    assert.equal(healthy.download_status, "ok");
    assert.equal(healthy.print_status, "ok");
    assert.equal(healthy.portal_observations, 1);
    assert.equal(healthy.print_observations, 1);

    const expiredBrowser: IfoodBrowserReadOnlyTransport = {
      async sessionHealth() {
        return {
          health: "EXPIRED",
          observed_at: "2026-09-25T00:01:00.000Z",
          profile_id: "profile-1",
        };
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

    const expired = await runReadOnlyTransportCycle({
      pipeline,
      browser: expiredBrowser,
      printSource,
      unit_id: "0001",
    });
    assert.equal(expired.structured_status, "skipped");
    assert.equal(expired.download_status, "skipped");
    assert.equal(expired.print_status, "ok");
    assert.equal(structuredCalls, 1);
    assert.equal(downloadCalls, 1);

    const brokenSessionBrowser: IfoodBrowserReadOnlyTransport = {
      async sessionHealth() {
        throw new Error("synthetic session probe failure");
      },
      async collectStructured() {
        throw new Error("must not run");
      },
      async collectDownloadMetadata() {
        throw new Error("must not run");
      },
    };

    const browserFailure = await runReadOnlyTransportCycle({
      pipeline,
      browser: brokenSessionBrowser,
      printSource,
      unit_id: "0001",
      now: () => new Date("2026-09-25T00:02:00.000Z"),
    });
    assert.equal(browserFailure.session_health, "UNKNOWN");
    assert.equal(browserFailure.session_status, "failed");
    assert.equal(browserFailure.structured_status, "skipped");
    assert.equal(browserFailure.download_status, "skipped");
    assert.equal(browserFailure.print_status, "ok");
    assert.equal(browserFailure.print_observations, 1);

    const brokenPrintSource: PrintSnapshotSource = {
      async listJobs() {
        throw new Error("synthetic print source failure");
      },
    };

    const printFailure = await runReadOnlyTransportCycle({
      pipeline,
      browser: healthyBrowser,
      printSource: brokenPrintSource,
      unit_id: "0001",
    });
    assert.equal(printFailure.session_status, "ok");
    assert.equal(printFailure.structured_status, "ok");
    assert.equal(printFailure.print_status, "failed");
    assert.equal(printFailure.portal_observations, 1);

    console.log(JSON.stringify({
      status: "PASS",
      expired_session_skips_portal_collection: true,
      browser_failure_does_not_block_print: true,
      print_failure_does_not_block_browser: true,
    }, null, 2));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
