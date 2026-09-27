CREATE TABLE IF NOT EXISTS daily_closings (
  mailbox_uid INTEGER PRIMARY KEY,
  business_date TEXT NOT NULL,
  message_sent_at TEXT NOT NULL,
  report_gross_total REAL,
  lunch_gross REAL,
  dinner_gross REAL,
  ifood_orders_total INTEGER,
  ifood_value_total REAL,
  app_orders_total INTEGER,
  app_value_total REAL,
  salao_value_total REAL,
  discounts_value_total REAL,
  lunch_cash REAL,
  dinner_cash REAL,
  lunch_machine_total REAL,
  dinner_machine_total REAL,
  lunch_bordero_total REAL,
  dinner_bordero_total REAL,
  report_bordero_diff REAL,
  totals_match INTEGER NOT NULL DEFAULT 0,
  period_label_mismatch INTEGER NOT NULL DEFAULT 0,
  readonly_verified INTEGER NOT NULL DEFAULT 0,
  quality_flags_json TEXT NOT NULL DEFAULT '[]',
  metrics_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_daily_closings_business_date
  ON daily_closings(business_date);

CREATE TABLE IF NOT EXISTS bridge_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ifood_review_mail (
  mailbox_key TEXT PRIMARY KEY,
  uid_validity TEXT NOT NULL,
  mailbox_uid INTEGER NOT NULL,
  message_id TEXT NOT NULL DEFAULT '',
  message_sent_at TEXT NOT NULL,
  sender TEXT NOT NULL DEFAULT '',
  recipient TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  subject_normalized TEXT NOT NULL,
  body_text TEXT NOT NULL DEFAULT '',
  body_char_count INTEGER NOT NULL DEFAULT 0,
  raw_size INTEGER NOT NULL DEFAULT 0,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  attachment_manifest_json TEXT NOT NULL DEFAULT '[]',
  extraction_status TEXT NOT NULL,
  readonly_verified INTEGER NOT NULL DEFAULT 0,
  quality_flags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(uid_validity, mailbox_uid)
);

CREATE INDEX IF NOT EXISTS idx_ifood_review_mail_sent_at
  ON ifood_review_mail(message_sent_at);

CREATE INDEX IF NOT EXISTS idx_ifood_review_mail_status
  ON ifood_review_mail(extraction_status);

CREATE TABLE IF NOT EXISTS ifood_review_attachment (
  mailbox_key TEXT NOT NULL,
  attachment_index INTEGER NOT NULL,
  filename TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  disposition TEXT NOT NULL DEFAULT '',
  content_id TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  content_blob BLOB NOT NULL,
  PRIMARY KEY (mailbox_key, attachment_index)
);

CREATE INDEX IF NOT EXISTS idx_ifood_review_attachment_mailbox
  ON ifood_review_attachment(mailbox_key);

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
