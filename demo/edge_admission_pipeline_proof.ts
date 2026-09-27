import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EdgeAdmissionPipeline } from "../src/edge/admission";
import { portalRecordToObservation } from "../src/edge/ifood/sidecar";
import { printSnapshotToObservation } from "../src/edge/print/observer";
import { FileEdgeStore } from "../src/edge/runtime/store";
import { tataOsReceiptToObservation } from "../src/edge/tataos/bridge";
import { teknisaRecordToObservation } from "../src/edge/teknisa/adapter";

const dir = mkdtempSync(join(tmpdir(), "edge-admission-"));
const file = join(dir, "state.json");
try {
  const pipeline1 = new EdgeAdmissionPipeline(new FileEdgeStore(file));

  const ifood = portalRecordToObservation({
    source_mode: "synthetic",
    capture_id: "order-cap-1",
    surface: "orders",
    unit_id: "0001",
    observed_at: "2026-09-24T23:00:00.000Z",
    entity_id: "IFOOD-777",
    payload: { amount: 88.5 },
  });
  const teknisa = teknisaRecordToObservation({
    source_mode: "synthetic",
    record_id: "sale-777",
    record_type: "sale",
    unit_id: "0001",
    observed_at: "2026-09-24T23:00:05.000Z",
    route: "local_structured_observation",
    external_order_id: "IFOOD-777",
    payment_mapping: "ONLINE_IFOOD",
    amount: 88.5,
  });
  const print = printSnapshotToObservation({
    source_mode: "synthetic",
    queue_name: "TEKNISA-KITCHEN",
    printer_name: "Kitchen Printer",
    job_id: "501",
    document_name: "SALE-777",
    observed_at: "2026-09-24T23:00:07.000Z",
    state: "QUEUED",
    unit_id: "0001",
  }).observation;
  const tata = tataOsReceiptToObservation({
    source_mode: "synthetic",
    receipt_id: "receipt-1",
    type: "software_print_status",
    unit_id: "0001",
    observed_at: "2026-09-24T23:00:08.000Z",
    job_id: "tata-job-1",
    software_state: "submitted",
  }).observation;

  const receipts = pipeline1.admitMany([ifood, teknisa, print, tata]);
  assert.equal(receipts.filter((receipt) => receipt.duplicate).length, 0);
  assert.equal(pipeline1.journalSize(), 4);

  const snapshotBefore = pipeline1.currentIdentitySnapshot();
  const pipeline2 = new EdgeAdmissionPipeline(new FileEdgeStore(file));
  assert.equal(pipeline2.journalSize(), 4);
  assert.equal(pipeline2.currentIdentitySnapshot(), snapshotBefore);

  const replayReceipt = pipeline2.admit(teknisa);
  assert.equal(replayReceipt.duplicate, true);
  assert.equal(pipeline2.journalSize(), 4);

  const links = JSON.parse(pipeline2.currentIdentitySnapshot()) as Array<{ confidence: string }>;
  assert.equal(links.some((link) => link.confidence === "PROVEN"), true);

  console.log(JSON.stringify({
    status: "PASS",
    cross_source_admission: true,
    restart_projection_rebuild: true,
    replay_duplicate_created: false,
    proven_link_present: true,
  }, null, 2));
} finally {
  rmSync(dir, { recursive: true, force: true });
}