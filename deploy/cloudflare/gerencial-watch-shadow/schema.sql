CREATE TABLE IF NOT EXISTS edge_handoff_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  input_fingerprint TEXT NOT NULL UNIQUE,
  received_at TEXT NOT NULL,
  contract_version TEXT NOT NULL,
  source_mode TEXT NOT NULL,
  fact_class TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  source_watermark_at TEXT,
  observation_count INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watch_runtime_snapshot_history (
  snapshot_id TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  source_watermark_at TEXT,
  validity_status TEXT NOT NULL,
  truth_class TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watch_runtime_snapshot (
  singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
  snapshot_id TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  source_watermark_at TEXT,
  validity_status TEXT NOT NULL,
  truth_class TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edge_handoff_received
  ON edge_handoff_history(received_at);

CREATE INDEX IF NOT EXISTS idx_watch_snapshot_generated
  ON watch_runtime_snapshot_history(generated_at);
