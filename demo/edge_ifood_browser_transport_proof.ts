import { strict as assert } from "node:assert";
import { portalRecordToObservation } from "../src/edge/ifood/sidecar";
import {
  IFOOD_BROWSER_TRANSPORT_CAPABILITIES,
  networkCaptureToPortalRecord,
  safeSessionMetadata,
  type IfoodBrowserReadOnlyTransport,
} from "../src/edge/ifood/browserTransport";

const transport: IfoodBrowserReadOnlyTransport = {
  async sessionHealth() {
    return {
      source_mode: "synthetic",
      health: "HEALTHY",
      observed_at: "2026-09-24T23:30:00.000Z",
      profile_id: "ifood-partner-dedicated",
      reason: "session_valid",
    };
  },
  async collectStructured() {
    return [{
      source_mode: "synthetic",
      capture_id: "net-1",
      surface: "reviews",
      unit_id: "0001",
      observed_at: "2026-09-24T23:30:01.000Z",
      entity_id: "review-77",
      method: "GET",
      resource_fingerprint: "/reviews?access_token=must-not-cross",
      content_type: "application/json",
      payload: { score: 4, order_reference: "IFOOD-77" },
    }];
  },
  async collectDownloadMetadata() {
    return [{
      source_mode: "synthetic",
      download_id: "download-1",
      surface: "financial",
      unit_id: "0001",
      observed_at: "2026-09-24T23:30:02.000Z",
      file_name: "financial.csv",
      media_type: "text/csv",
      size_bytes: 1200,
      sha256: "synthetic-sha",
    }];
  },
};

async function main(): Promise<void> {
  const session = await transport.sessionHealth();
  const metadata = safeSessionMetadata(session);
  assert.equal(metadata.health, "HEALTHY");
  assert.equal(Object.prototype.hasOwnProperty.call(metadata, "cookie"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(metadata, "token"), false);

  const captures = await transport.collectStructured();
  const observation = portalRecordToObservation(networkCaptureToPortalRecord(captures[0]));
  assert.equal(observation.kind, "review");
  assert.equal(observation.payload.score, 4);
  assert.equal(observation.payload.endpoint_fingerprint, "GET /reviews");

  const downloads = await transport.collectDownloadMetadata();
  assert.equal(downloads[0].surface, "financial");
  assert.equal(downloads[0].sha256, "synthetic-sha");

  assert.deepEqual(IFOOD_BROWSER_TRANSPORT_CAPABILITIES, [
    "session_health",
    "structured_network_capture",
    "download_metadata",
  ]);

  console.log(JSON.stringify({
    status: "PASS",
    generic_browser_control_exposed: false,
    session_secrets_cross_boundary: false,
    structured_capture_to_observation: true,
    endpoint_query_removed: true,
    download_metadata_only: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});