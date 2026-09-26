CREATE TABLE IF NOT EXISTS tally_occurrence_barrier (
  event_id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  form_id TEXT NOT NULL,
  source_created_at TEXT NOT NULL,
  operator_name TEXT NOT NULL DEFAULT '',
  business_date TEXT NOT NULL DEFAULT '',
  shift TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  reference_text TEXT NOT NULL DEFAULT '',
  happened_text TEXT NOT NULL DEFAULT '',
  action_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  subtype TEXT NOT NULL CHECK (subtype IN ('Item faltando','Item errado','Outro')),
  item_missing_barriers_json TEXT,
  wrong_item_barriers_json TEXT,
  truth_class TEXT NOT NULL CHECK (truth_class = 'OPERATOR_SELF_REPORT'),
  payload_sha256 TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tally_occurrence_barrier_created
  ON tally_occurrence_barrier(source_created_at);

CREATE INDEX IF NOT EXISTS idx_tally_occurrence_barrier_subtype
  ON tally_occurrence_barrier(subtype);
