import assert from "node:assert/strict";
import test from "node:test";
import { recordBridgeSourceHealthD1 } from "./bridge-state.js";

function fakeDb() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      assert.match(sql, /INSERT INTO bridge_state/i);
      return {
        bind(key, value, updatedAt) {
          return {
            async run() {
              rows.set(key, { value, updated_at: updatedAt });
              return { success: true };
            },
          };
        },
      };
    },
  };
}

test("records minimized source-health heartbeat without source payload", async () => {
  const db = fakeDb();
  const result = await recordBridgeSourceHealthD1(db, {
    source: "ifood_review",
    at: "2026-09-30T10:00:00.000Z",
    status: "OK",
    scanned: 42,
    candidates: 0,
    processed_count: 0,
    error_count: 0,
  });
  assert.equal(result.key, "source_health:ifood_review");
  const stored = db.rows.get(result.key);
  const value = JSON.parse(stored.value);
  assert.deepEqual(value, {
    schema: "gerencial-bridge-source-health-v1",
    source: "ifood_review",
    status: "OK",
    at: "2026-09-30T10:00:00.000Z",
    scanned: 42,
    candidates: 0,
    processed_count: 0,
    error_count: 0,
  });
  assert.equal(stored.value.includes("subject"), false);
  assert.equal(stored.value.includes("body"), false);
});

test("upserts the same per-source key", async () => {
  const db = fakeDb();
  await recordBridgeSourceHealthD1(db, {
    source: "caixa_pulse",
    at: "2026-09-30T09:00:00.000Z",
    status: "OK",
  });
  await recordBridgeSourceHealthD1(db, {
    source: "caixa_pulse",
    at: "2026-09-30T10:00:00.000Z",
    status: "DEGRADED",
    error_count: 1,
  });
  assert.equal(db.rows.size, 1);
  const value = JSON.parse(db.rows.get("source_health:caixa_pulse").value);
  assert.equal(value.status, "DEGRADED");
  assert.equal(value.error_count, 1);
});

test("fails closed on invalid source/status/counters", async () => {
  const db = fakeDb();
  await assert.rejects(
    recordBridgeSourceHealthD1(db, {
      source: "other",
      at: "2026-09-30T10:00:00.000Z",
      status: "OK",
    }),
    /BRIDGE_STATE_SOURCE_INVALID/,
  );
  await assert.rejects(
    recordBridgeSourceHealthD1(db, {
      source: "ifood_review",
      at: "2026-09-30T10:00:00.000Z",
      status: "GREEN",
    }),
    /BRIDGE_STATE_STATUS_INVALID/,
  );
  await assert.rejects(
    recordBridgeSourceHealthD1(db, {
      source: "ifood_review",
      at: "2026-09-30T10:00:00.000Z",
      status: "OK",
      scanned: -1,
    }),
    /BRIDGE_STATE_SCANNED_INVALID/,
  );
});
