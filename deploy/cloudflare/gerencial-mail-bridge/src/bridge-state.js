const SOURCES = new Set(["daily_closing", "caixa_pulse", "ifood_review"]);
const STATUSES = new Set(["OK", "DEGRADED", "ERROR"]);

export async function recordBridgeSourceHealthD1(db, {
  source,
  at,
  status,
  scanned = 0,
  candidates = 0,
  processed_count = 0,
  error_count = 0,
}) {
  if (!db || typeof db.prepare !== "function") {
    throw new Error("D1 binding is not configured");
  }
  if (!SOURCES.has(source)) throw new TypeError("BRIDGE_STATE_SOURCE_INVALID");
  if (!STATUSES.has(status)) throw new TypeError("BRIDGE_STATE_STATUS_INVALID");
  if (!Number.isFinite(Date.parse(at))) throw new TypeError("BRIDGE_STATE_AT_INVALID");

  for (const [name, value] of Object.entries({
    scanned,
    candidates,
    processed_count,
    error_count,
  })) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(`BRIDGE_STATE_${name.toUpperCase()}_INVALID`);
    }
  }

  const value = JSON.stringify({
    schema: "gerencial-bridge-source-health-v1",
    source,
    status,
    at,
    scanned,
    candidates,
    processed_count,
    error_count,
  });
  const key = "source_health:" + source;

  await db.prepare(`
    INSERT INTO bridge_state (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).bind(key, value, at).run();

  return { key, value, updated_at: at };
}
