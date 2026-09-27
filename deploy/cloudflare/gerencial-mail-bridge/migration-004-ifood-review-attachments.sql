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
