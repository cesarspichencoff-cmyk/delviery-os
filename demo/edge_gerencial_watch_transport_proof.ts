import { strict as assert } from "node:assert";
import {
  buildGerencialWatchHandoffRequest,
  GERENCIAL_WATCH_EDGE_INGEST_PATH,
} from "../src/edge/gerencialWatchTransport";
import { managerSnapshotToWatchHandoff } from "../src/edge/gerencialWatchHandoff";
import { projectManagerSnapshot } from "../src/edge/managerSnapshot";
import type { EdgeSourceObservation } from "../src/edge/simulator";

const observation: EdgeSourceObservation = {
  source_mode: "synthetic",
  observation_id: "transport-auth-human",
  kind: "auth_state",
  source_ref: {
    source: "ifood",
    kind: "auth_session",
    id: "safe-profile",
    unit_id: "0001",
  },
  observed_at: "2026-09-25T12:00:00.000Z",
  payload: {
    health: "HUMAN_REQUIRED",
    raw_token: "must-not-cross",
    customer_name: "must-not-cross",
  },
};

const manager = projectManagerSnapshot(
  [observation],
  "2026-09-25T12:01:00.000Z",
);
const envelope = managerSnapshotToWatchHandoff(manager);
const request = buildGerencialWatchHandoffRequest(envelope);

assert.equal(request.method, "POST");
assert.equal(request.path, GERENCIAL_WATCH_EDGE_INGEST_PATH);
assert.equal(request.path, "/sources/tata-edge/handoff");
assert.equal(request.headers["content-type"], "application/json");
assert.equal(request.external_effect_authorized, false);

const decoded = JSON.parse(request.body);
assert.equal(decoded.contract_version, "edge-watch-handoff@0.1.0");
assert.equal(decoded.source_system, "TATA_EDGE");
assert.equal(decoded.source_mode, "synthetic");
assert.equal(decoded.fact_class, "SIMULATION");
assert.equal(decoded.global_coverage_claim, "NOT_PROVIDED");
assert.equal(decoded.external_effect_authorized, false);

assert.equal(request.body.includes("must-not-cross"), false);
assert.equal(request.body.includes("raw_token"), false);
assert.equal(request.body.includes("customer_name"), false);
assert.equal("authorization" in request.headers, false);

console.log(JSON.stringify({
  status: "PASS",
  exact_context_kernel_path: true,
  request_is_transport_only: true,
  no_network_effect: true,
  no_auth_secret_embedded: true,
  no_raw_edge_payload: true,
  truth_class_preserved: true,
}, null, 2));
