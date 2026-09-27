CREATE TABLE IF NOT EXISTS caixa_pulse_shift (
  mailbox_key TEXT PRIMARY KEY,
  uid_validity TEXT NOT NULL,
  mailbox_uid INTEGER NOT NULL,
  business_date TEXT NOT NULL,
  shift TEXT NOT NULL CHECK (shift IN ('MANHA','NOITE')),
  message_sent_at TEXT NOT NULL,
  reported_total INTEGER NOT NULL,
  parsed_total INTEGER NOT NULL,
  open_total INTEGER NOT NULL,
  explicit_none INTEGER NOT NULL DEFAULT 0,
  source_health TEXT NOT NULL CHECK (source_health IN ('HEALTHY','DEGRADED')),
  readonly_verified INTEGER NOT NULL DEFAULT 0,
  body_char_count INTEGER NOT NULL DEFAULT 0,
  quality_flags_json TEXT NOT NULL DEFAULT '[]',
  is_canonical INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(uid_validity, mailbox_uid)
);

CREATE INDEX IF NOT EXISTS idx_caixa_pulse_shift_date_shift
  ON caixa_pulse_shift(business_date, shift, is_canonical);

CREATE INDEX IF NOT EXISTS idx_caixa_pulse_shift_source_time
  ON caixa_pulse_shift(message_sent_at);

CREATE TABLE IF NOT EXISTS caixa_pulse_occurrence (
  mailbox_key TEXT NOT NULL,
  occurrence_index INTEGER NOT NULL,
  domain TEXT NOT NULL,
  category TEXT NOT NULL,
  operator_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  reference_text TEXT NOT NULL DEFAULT '',
  happened_text TEXT NOT NULL DEFAULT '',
  action_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (mailbox_key, occurrence_index),
  FOREIGN KEY (mailbox_key)
    REFERENCES caixa_pulse_shift(mailbox_key)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_caixa_pulse_occurrence_domain
  ON caixa_pulse_occurrence(domain);

CREATE INDEX IF NOT EXISTS idx_caixa_pulse_occurrence_mailbox
  ON caixa_pulse_occurrence(mailbox_key);
