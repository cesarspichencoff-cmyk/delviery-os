import {
  ContractError,
  buildRuntimeSnapshot,
  inputFingerprint,
  validateEdgeHandoff,
} from "./core.mjs";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

function authorized(request, env) {
  if (!env.WATCH_BRIDGE_TOKEN) return false;
  const value = request.headers.get("authorization") ?? "";
  return value === `Bearer ${env.WATCH_BRIDGE_TOKEN}`;
}

async function readJson(request) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new ContractError("content_type_must_be_json");
  }
  return request.json();
}

async function persistSnapshot(env, input, receivedAt) {
  const fingerprint = await inputFingerprint(input);
  const snapshot = await buildRuntimeSnapshot(input, receivedAt);

  const handoff = env.DB.prepare(
    `INSERT OR IGNORE INTO edge_handoff_history(
      input_fingerprint, received_at, contract_version, source_mode, fact_class,
      generated_at, source_watermark_at, observation_count, payload_json
    ) VALUES(?,?,?,?,?,?,?,?,?)`,
  ).bind(
    fingerprint,
    receivedAt,
    input.contract_version,
    input.source_mode,
    input.fact_class,
    input.generated_at,
    input.source_watermark_at ?? null,
    input.observation_count,
    JSON.stringify(input),
  );

  const history = env.DB.prepare(
    `INSERT OR IGNORE INTO watch_runtime_snapshot_history(
      snapshot_id, generated_at, input_fingerprint, source_watermark_at,
      validity_status, truth_class, payload_json
    ) VALUES(?,?,?,?,?,?,?)`,
  ).bind(
    snapshot.snapshotId,
    snapshot.generatedAt,
    snapshot.inputFingerprint,
    snapshot.sourceWatermarkAt,
    snapshot.validity.status,
    snapshot.truthClass,
    JSON.stringify(snapshot),
  );

  const current = env.DB.prepare(
    `INSERT INTO watch_runtime_snapshot(
      singleton_id, snapshot_id, generated_at, input_fingerprint,
      source_watermark_at, validity_status, truth_class, payload_json
    ) VALUES(1,?,?,?,?,?,?,?)
    ON CONFLICT(singleton_id) DO UPDATE SET
      snapshot_id=excluded.snapshot_id,
      generated_at=excluded.generated_at,
      input_fingerprint=excluded.input_fingerprint,
      source_watermark_at=excluded.source_watermark_at,
      validity_status=excluded.validity_status,
      truth_class=excluded.truth_class,
      payload_json=excluded.payload_json`,
  ).bind(
    snapshot.snapshotId,
    snapshot.generatedAt,
    snapshot.inputFingerprint,
    snapshot.sourceWatermarkAt,
    snapshot.validity.status,
    snapshot.truthClass,
    JSON.stringify(snapshot),
  );

  await env.DB.batch([handoff, history, current]);
  return snapshot;
}

async function currentSnapshot(env) {
  const row = await env.DB.prepare(
    "SELECT payload_json FROM watch_runtime_snapshot WHERE singleton_id=1",
  ).first();
  return row ? JSON.parse(row.payload_json) : null;
}

async function latestHandoff(env) {
  const row = await env.DB.prepare(
    `SELECT payload_json FROM edge_handoff_history
     ORDER BY id DESC LIMIT 1`,
  ).first();
  return row ? JSON.parse(row.payload_json) : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        status: "ok",
        runtime: "cesar-gerencial-watch-shadow@0.1.0",
        externalEffectsAuthorized: false,
      });
    }

    if (!authorized(request, env)) {
      return json({ error: "unauthorized" }, 401);
    }

    try {
      if (
        request.method === "POST" &&
        url.pathname === "/sources/tata-edge/handoff"
      ) {
        const input = validateEdgeHandoff(await readJson(request));
        const snapshot = await persistSnapshot(
          env,
          input,
          new Date().toISOString(),
        );
        return json({
          accepted: true,
          snapshot,
        }, 202);
      }

      if (request.method === "GET" && url.pathname === "/snapshot") {
        const snapshot = await currentSnapshot(env);
        if (!snapshot) return json({ error: "snapshot_not_available" }, 404);
        return json(snapshot);
      }

      if (request.method === "POST" && url.pathname === "/snapshot/recompute") {
        const input = await latestHandoff(env);
        if (!input) return json({ error: "handoff_not_available" }, 409);
        const snapshot = await persistSnapshot(
          env,
          validateEdgeHandoff(input),
          new Date().toISOString(),
        );
        return json(snapshot);
      }

      return json({ error: "not_found" }, 404);
    } catch (error) {
      if (error instanceof ContractError) {
        return json({ error: error.code }, 400);
      }
      console.error(JSON.stringify({
        event: "gerencial_watch_shadow_error",
        at: new Date().toISOString(),
        error: error instanceof Error ? error.name : "unknown",
      }));
      return json({ error: "internal_error" }, 500);
    }
  },

  async scheduled(_controller, env) {
    try {
      const input = await latestHandoff(env);
      if (!input) return;
      await persistSnapshot(
        env,
        validateEdgeHandoff(input),
        new Date().toISOString(),
      );
    } catch (error) {
      console.error(JSON.stringify({
        event: "gerencial_watch_shadow_scheduled_error",
        at: new Date().toISOString(),
        error: error instanceof Error ? error.name : "unknown",
      }));
    }
  },
};
