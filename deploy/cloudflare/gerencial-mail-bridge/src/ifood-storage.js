import { neon } from "@neondatabase/serverless";

function normalizeUidValidity(uidValidity) {
  const value = String(uidValidity ?? "").trim();
  if (!/^[1-9]\d*$/.test(value)) throw new TypeError("INVALID_UIDVALIDITY");
  return value;
}

function numericMailboxUids(uids) {
  const values = uids.map((uid) => Number(uid));
  if (values.some((uid) => !Number.isSafeInteger(uid) || uid <= 0)) {
    throw new TypeError("INVALID_MAILBOX_UID_LOOKUP");
  }
  return values;
}

export async function findKnownIfoodReviewUidsD1(db, uidValidity, uids) {
  if (!db) throw new Error("D1 binding is not configured");
  const epoch = normalizeUidValidity(uidValidity);
  const values = numericMailboxUids(uids);
  if (!values.length) return [];
  const placeholders = values.map(() => "?").join(",");
  const result = await db.prepare(
    `SELECT mailbox_uid FROM ifood_review_mail
     WHERE uid_validity = ? AND mailbox_uid IN (${placeholders})`,
  ).bind(epoch, ...values).all();
  return (result.results ?? []).map((row) => String(row.mailbox_uid));
}

function toArrayBuffer(content) {
  if (content instanceof ArrayBuffer) return content;
  if (content instanceof Uint8Array) {
    return content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength,
    );
  }
  if (ArrayBuffer.isView(content)) {
    return content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength,
    );
  }
  return new ArrayBuffer(0);
}

export async function replaceIfoodReviewAttachmentsD1(db, row) {
  if (!db) throw new Error("D1 binding is not configured");
  await db.prepare(
    "DELETE FROM ifood_review_attachment WHERE mailbox_key = ?",
  ).bind(row.mailbox_key).run();

  let index = 0;
  for (const attachment of row.attachment_payloads ?? []) {
    await db.prepare(`
      INSERT INTO ifood_review_attachment (
        mailbox_key, attachment_index, filename, mime_type,
        disposition, content_id, size_bytes, content_blob
      ) VALUES (?,?,?,?,?,?,?,?)
    `).bind(
      row.mailbox_key,
      index,
      String(attachment.filename ?? ""),
      String(attachment.mimeType ?? "application/octet-stream"),
      String(attachment.disposition ?? ""),
      String(attachment.contentId ?? ""),
      Number(attachment.content?.byteLength ?? 0),
      toArrayBuffer(attachment.content),
    ).run();
    index += 1;
  }
  return index;
}

export async function upsertIfoodReviewD1(db, row) {
  if (!db) throw new Error("D1 binding is not configured");
  const now = new Date().toISOString();
  return db.prepare(`
    INSERT INTO ifood_review_mail (
      mailbox_key, uid_validity, mailbox_uid, message_id, message_sent_at,
      sender, recipient, subject, subject_normalized, body_text,
      body_char_count, raw_size, attachment_count, attachment_manifest_json,
      extraction_status, readonly_verified, quality_flags_json, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(mailbox_key) DO UPDATE SET
      message_id = excluded.message_id,
      message_sent_at = excluded.message_sent_at,
      sender = excluded.sender,
      recipient = excluded.recipient,
      subject = excluded.subject,
      subject_normalized = excluded.subject_normalized,
      body_text = excluded.body_text,
      body_char_count = excluded.body_char_count,
      raw_size = excluded.raw_size,
      attachment_count = excluded.attachment_count,
      attachment_manifest_json = excluded.attachment_manifest_json,
      extraction_status = excluded.extraction_status,
      readonly_verified = excluded.readonly_verified,
      quality_flags_json = excluded.quality_flags_json,
      updated_at = excluded.updated_at
  `).bind(
    row.mailbox_key,
    row.uid_validity,
    row.mailbox_uid,
    row.message_id,
    row.message_sent_at,
    row.sender,
    row.recipient,
    row.subject,
    row.subject_normalized,
    row.body_text,
    row.body_char_count,
    row.raw_size,
    row.attachment_count,
    JSON.stringify(row.attachment_manifest ?? []),
    row.extraction_status,
    row.readonly_verified ? 1 : 0,
    JSON.stringify(row.quality_flags ?? []),
    now,
    now,
  ).run();
}
