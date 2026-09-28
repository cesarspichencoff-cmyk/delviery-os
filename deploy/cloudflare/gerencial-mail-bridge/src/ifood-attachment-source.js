import { matchesIfoodReviewMail } from "./ifood-intake.js";

function blobToUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("IFOOD_ATTACHMENT_BLOB_INVALID");
}

export async function loadAuthorizedIfoodReviewAttachmentD1(
  db,
  { mailbox_key, attachment_index },
) {
  if (!db) throw new Error("D1 binding is not configured");
  if (!/^\d+:\d+$/.test(String(mailbox_key ?? ""))) {
    throw new TypeError("INVALID_IFOOD_ATTACHMENT_MAILBOX_KEY");
  }
  if (!Number.isInteger(attachment_index) || attachment_index < 0) {
    throw new TypeError("INVALID_IFOOD_ATTACHMENT_INDEX");
  }

  const row = await db.prepare(`
    SELECT
      a.mailbox_key,
      a.attachment_index,
      a.mime_type,
      a.size_bytes,
      a.content_blob,
      m.sender,
      m.recipient,
      m.subject,
      m.readonly_verified
    FROM ifood_review_attachment a
    INNER JOIN ifood_review_mail m
      ON m.mailbox_key = a.mailbox_key
    WHERE a.mailbox_key = ?
      AND a.attachment_index = ?
    LIMIT 1
  `).bind(mailbox_key, attachment_index).first();

  if (!row) return null;

  const authorized =
    Number(row.readonly_verified) === 1 &&
    matchesIfoodReviewMail({
      subject: row.subject,
      from: row.sender,
      to: row.recipient,
    });

  if (!authorized) {
    throw new Error("IFOOD_ATTACHMENT_SOURCE_NOT_AUTHORIZED");
  }

  const bytes = blobToUint8Array(row.content_blob);
  if (Number(row.size_bytes) !== bytes.byteLength) {
    throw new Error("IFOOD_ATTACHMENT_SIZE_MISMATCH");
  }

  return {
    source_class: "AUTHORIZED_TEAM_MAIL",
    mime_type: String(row.mime_type ?? "application/octet-stream"),
    bytes,
  };
}
