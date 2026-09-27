const MAX_BODY_CHARS = 180000;
const MAX_ATTACHMENT_TEXT_CHARS = 50000;
const MAX_TOTAL_ATTACHMENT_TEXT_CHARS = 100000;

export const IFOOD_REVIEW_RECIPIENT = "cesar@tatasushi.com.br";
export const IFOOD_REVIEW_SENDER = "atendimento@tatasushi.com.br";

export function matchesIfoodSubject(subject) {
  return String(subject ?? "").toLowerCase().includes("ifood");
}

function emailAddresses(value) {
  return [...String(value ?? "").toLowerCase().matchAll(
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g,
  )].map((match) => match[0]);
}

export function matchesIfoodReviewMail({ subject, from, to }) {
  return matchesIfoodSubject(subject) &&
    emailAddresses(from).includes(IFOOD_REVIEW_SENDER) &&
    emailAddresses(to).includes(IFOOD_REVIEW_RECIPIENT);
}

function decodeTextContent(content) {
  if (content == null) return "";
  const bytes = content instanceof Uint8Array
    ? content
    : content instanceof ArrayBuffer
      ? new Uint8Array(content)
      : ArrayBuffer.isView(content)
        ? new Uint8Array(content.buffer, content.byteOffset, content.byteLength)
        : null;
  if (!bytes) return "";
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

function stripHtml(html) {
  return String(html ?? "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function attachmentTextKind(mimeType, filename) {
  const mime = String(mimeType ?? "").toLowerCase();
  const name = String(filename ?? "").toLowerCase();
  if (mime.startsWith("text/")) return true;
  if (mime === "application/json" || mime === "application/xml") return true;
  return /\.(txt|csv|json|xml|md|log)$/i.test(name);
}

function attachmentBytes(attachment) {
  const content = attachment?.content;
  if (content instanceof Uint8Array) return content.byteLength;
  if (content instanceof ArrayBuffer) return content.byteLength;
  if (ArrayBuffer.isView(content)) return content.byteLength;
  return 0;
}
export function buildIfoodReviewRecord({
  uid,
  uidValidity,
  subject,
  sentAt,
  from,
  to,
  messageId,
  rawSize = 0,
  parsed,
  readOnlyVerified,
}) {
  if (!matchesIfoodSubject(subject)) {
    throw new TypeError("IFOOD_SUBJECT_REQUIRED");
  }

  const flags = [];
  const attachments = [];
  const attachmentPayloads = [];
  let attachmentText = "";
  let unextractedAttachments = 0;

  for (const attachment of parsed?.attachments ?? []) {
    const filename = String(attachment.filename ?? "");
    const mimeType = String(attachment.mimeType ?? "application/octet-stream");
    const bytes = attachmentBytes(attachment);
    let extractedText = "";

    if (attachmentTextKind(mimeType, filename) && bytes <= 1024 * 1024) {
      extractedText = decodeTextContent(attachment.content)
        .slice(0, MAX_ATTACHMENT_TEXT_CHARS)
        .trim();
      if (extractedText) {
        const remaining = MAX_TOTAL_ATTACHMENT_TEXT_CHARS - attachmentText.length;
        if (remaining > 0) {
          attachmentText +=
            `\n\n[ANEXO: ${filename || "sem-nome"}]\n` +
            extractedText.slice(0, remaining);
        }
      }
    } else if (bytes > 0) {
      unextractedAttachments += 1;
    }

    attachments.push({
      filename,
      mimeType,
      bytes,
      disposition: String(attachment.disposition ?? ""),
      contentId: String(attachment.contentId ?? ""),
      textExtracted: Boolean(extractedText),
    });
    attachmentPayloads.push({
      filename,
      mimeType,
      disposition: String(attachment.disposition ?? ""),
      contentId: String(attachment.contentId ?? ""),
      content: attachment.content ?? new Uint8Array(),
    });
  }

  let body = String(parsed?.text ?? "").trim();
  if (!body && parsed?.html) body = stripHtml(parsed.html);
  const combined = (body + attachmentText).trim();

  let bodyText = combined;
  if (bodyText.length > MAX_BODY_CHARS) {
    bodyText = bodyText.slice(0, MAX_BODY_CHARS);
    flags.push("BODY_TRUNCATED");
  }
  if (!bodyText) flags.push("NO_TEXT_CONTENT");
  if (unextractedAttachments > 0) flags.push("HAS_UNEXTRACTED_ATTACHMENTS");
  if (!readOnlyVerified) flags.push("READONLY_NOT_VERIFIED");

  let extractionStatus = "TEXT_READY";
  if (!bodyText && attachments.length) extractionStatus = "ATTACHMENT_ONLY";
  else if (bodyText && unextractedAttachments > 0) extractionStatus = "MIXED_CONTENT";
  else if (!bodyText && !attachments.length) extractionStatus = "EMPTY_CONTENT";

  const uidValue = Number(uid);
  const uidValidityValue = String(uidValidity ?? "").trim();
  if (!Number.isSafeInteger(uidValue) || uidValue <= 0) {
    throw new TypeError("INVALID_MAILBOX_UID");
  }
  if (!/^[1-9]\d*$/.test(uidValidityValue)) {
    throw new TypeError("INVALID_UIDVALIDITY");
  }

  return {
    mailbox_key: uidValidityValue + ":" + String(uidValue),
    uid_validity: uidValidityValue,
    mailbox_uid: uidValue,
    message_id: String(messageId ?? parsed?.messageId ?? ""),
    message_sent_at: new Date(sentAt ?? parsed?.date ?? Date.now()).toISOString(),
    sender: String(from ?? parsed?.from?.address ?? parsed?.from ?? ""),
    recipient: String(to ?? ""),
    subject: String(subject ?? ""),
    subject_normalized: String(subject ?? "").toLowerCase(),
    body_text: bodyText,
    body_char_count: bodyText.length,
    raw_size: Number(rawSize) || 0,
    attachment_count: attachments.length,
    attachment_manifest: attachments,
    attachment_payloads: attachmentPayloads,
    extraction_status: extractionStatus,
    readonly_verified: Boolean(readOnlyVerified),
    quality_flags: flags,
  };
}
