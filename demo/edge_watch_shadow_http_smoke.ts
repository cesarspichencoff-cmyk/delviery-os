import { strict as assert } from "node:assert";
import { request as httpsRequest } from "node:https";
import { projectManagerSnapshot } from "../src/edge/managerSnapshot";
import { managerSnapshotToWatchHandoff } from "../src/edge/gerencialWatchHandoff";
import { buildGerencialWatchHandoffRequest } from "../src/edge/gerencialWatchTransport";
import type { EdgeSourceObservation } from "../src/edge/simulator";

interface HttpResult {
  status: number;
  body: unknown;
}

function postJson(args: {
  baseUrl: string;
  path: string;
  token: string;
  body: string;
}): Promise<HttpResult> {
  const target = new URL(args.path, args.baseUrl);
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      target,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${args.token}`,
          "content-length": Buffer.byteLength(args.body),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let body: unknown = raw;
          try {
            body = raw ? JSON.parse(raw) : null;
          } catch {
            // Preserve non-JSON body without logging credentials.
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.on("error", reject);
    req.write(args.body);
    req.end();
  });
}

function requireConfig(): { baseUrl: string; token: string } {
  const baseUrl = process.env.WATCH_BRIDGE_URL?.trim();
  const token = process.env.WATCH_BRIDGE_TOKEN?.trim();
  if (!baseUrl) throw new Error("WATCH_BRIDGE_URL_REQUIRED");
  if (!token) throw new Error("WATCH_BRIDGE_TOKEN_REQUIRED");
  return {
    baseUrl: baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
    token,
  };
}

async function main(): Promise<void> {
  const { baseUrl, token } = requireConfig();
  const now = new Date();
  const observedAt = new Date(now.getTime() - 60_000).toISOString();

  const observation: EdgeSourceObservation = {
    source_mode: "synthetic",
    observation_id: "world-shadow-smoke-auth-human",
    kind: "auth_state",
    source_ref: {
      source: "ifood",
      kind: "auth_session",
      id: "shadow-safe-profile",
      unit_id: "0001",
    },
    observed_at: observedAt,
    payload: {
      health: "HUMAN_REQUIRED",
      secret_material: "must-not-cross",
    },
  };

  const manager = projectManagerSnapshot([observation], now.toISOString());
  const syntheticEnvelope = managerSnapshotToWatchHandoff(manager);
  const syntheticRequest = buildGerencialWatchHandoffRequest(syntheticEnvelope);

  assert.equal(syntheticRequest.body.includes("must-not-cross"), false);
  const accepted = await postJson({
    baseUrl,
    path: syntheticRequest.path,
    token,
    body: syntheticRequest.body,
  });
  assert.equal(accepted.status, 202);

  const acceptedBody = accepted.body as {
    accepted?: boolean;
    snapshot?: {
      truthClass?: string;
      validity?: { status?: string; globalAllClearAuthorized?: boolean };
      needsCesar?: unknown[];
      externalEffectsAuthorized?: boolean;
    };
  };
  assert.equal(acceptedBody.accepted, true);
  assert.equal(acceptedBody.snapshot?.truthClass, "SIMULATION");
  assert.equal(acceptedBody.snapshot?.validity?.status, "DEGRADED");
  assert.equal(
    acceptedBody.snapshot?.validity?.globalAllClearAuthorized,
    false,
  );
  assert.equal(acceptedBody.snapshot?.needsCesar?.length, 1);
  assert.equal(acceptedBody.snapshot?.externalEffectsAuthorized, false);

  const duplicate = await postJson({
    baseUrl,
    path: syntheticRequest.path,
    token,
    body: syntheticRequest.body,
  });
  assert.equal(duplicate.status, 200);
  const duplicateBody = duplicate.body as {
    accepted?: boolean;
    duplicate?: boolean;
    snapshot?: { truthClass?: string };
  };
  assert.equal(duplicateBody.accepted, true);
  assert.equal(duplicateBody.duplicate, true);
  assert.equal(duplicateBody.snapshot?.truthClass, "SIMULATION");

  const emptyManager = projectManagerSnapshot([], new Date().toISOString());
  const emptyEnvelope = managerSnapshotToWatchHandoff(emptyManager);
  const emptyRequest = buildGerencialWatchHandoffRequest(emptyEnvelope);
  const cleared = await postJson({
    baseUrl,
    path: emptyRequest.path,
    token,
    body: emptyRequest.body,
  });
  assert.equal(cleared.status, 202);

  const clearedBody = cleared.body as {
    accepted?: boolean;
    snapshot?: {
      truthClass?: string;
      validity?: { status?: string; globalAllClearAuthorized?: boolean };
      needsCesar?: unknown[];
      criticalQueue?: unknown[];
      externalEffectsAuthorized?: boolean;
    };
  };
  assert.equal(clearedBody.accepted, true);
  assert.equal(clearedBody.snapshot?.truthClass, "EMPTY");
  assert.equal(clearedBody.snapshot?.validity?.status, "INSUFFICIENT");
  assert.equal(
    clearedBody.snapshot?.validity?.globalAllClearAuthorized,
    false,
  );
  assert.equal(clearedBody.snapshot?.needsCesar?.length, 0);
  assert.equal(clearedBody.snapshot?.criticalQueue?.length, 0);
  assert.equal(clearedBody.snapshot?.externalEffectsAuthorized, false);

  console.log(JSON.stringify({
    status: "PASS",
    producer_code_used: true,
    network_boundary_reached: true,
    exact_retry_idempotent: true,
    synthetic_truth_preserved: true,
    synthetic_requires_cesar: true,
    final_state_reset_to_empty: true,
    final_all_clear_authorized: false,
    external_effects_authorized: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    error: error instanceof Error ? error.message : "unknown_error",
  }));
  process.exit(1);
});
