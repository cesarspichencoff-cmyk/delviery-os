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
