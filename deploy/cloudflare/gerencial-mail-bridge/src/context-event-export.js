const EXPECTED_SENDER = "atendimento@tatasushi.com.br";
const EXPECTED_RECIPIENT = "cesar@tatasushi.com.br";

function addresses(value) {
  return [...String(value ?? "").toLowerCase().matchAll(
    /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g,
  )].map((match) => match[0]);
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function requireIdentity(row) {
  const uidValidity = String(row?.uid_validity ?? "").trim();
  const uid = Number(row?.mailbox_uid);
  if (!/^[1-9]\d*$/.test(uidValidity)) throw new TypeError("INVALID_UIDVALIDITY");
  if (!Number.isSafeInteger(uid) || uid <= 0) throw new TypeError("INVALID_MAILBOX_UID");
  return { uidValidity, uid };
}

function requireTrustedRoute(row) {
  const subject = String(row?.subject ?? "");
  if (!subject.toLowerCase().includes("ifood")) throw new TypeError("IFOOD_SUBJECT_REQUIRED");
  if (!addresses(row?.sender).includes(EXPECTED_SENDER)) {
    throw new TypeError("UNTRUSTED_MAIL_SENDER");
  }
  if (!addresses(row?.recipient).includes(EXPECTED_RECIPIENT)) {
    throw new TypeError("UNEXPECTED_MAIL_RECIPIENT");
  }
}

export function mailRowToContextEvent(row) {
  const { uidValidity, uid } = requireIdentity(row);
  requireTrustedRoute(row);

  const qualityFlags = parseJsonArray(row.quality_flags_json ?? row.quality_flags);
  const attachments = parseJsonArray(
    row.attachment_manifest_json ?? row.attachment_manifest,
  );
  const extractionStatus = String(row.extraction_status ?? "UNKNOWN");
  const readOnlyVerified = Boolean(
    row.readonly_verified === 1 ||
    row.readonly_verified === true ||
    row.readonly_verified === "1",
  );

  const missingFields = [];
  if (extractionStatus === "ATTACHMENT_ONLY") {
    missingFields.push("REVIEW_CONTENT_UNEXTRACTED");
  }
  if (!readOnlyVerified) missingFields.push("READ_ONLY_PROOF");

  return {
    event_id: `mail:atendimento:sent:${uidValidity}:${uid}`,
    event_type: "SOURCE_MAIL_IFOOD_REVIEW_BATCH",
    domain: "WORK_TATA",
    occurred_at: String(row.message_sent_at ?? ""),
    observed_at: String(row.updated_at ?? row.created_at ?? row.message_sent_at ?? ""),
    source: {
      system: "ATENDIMENTO_IMAP",
      mailbox: EXPECTED_SENDER,
      folder_role: "SENT",
      source_ref: `${uidValidity}:${uid}`,
      message_id: String(row.message_id ?? ""),
      read_only_verified: readOnlyVerified,
    },
    epistemic: {
      event_fact: "EMAIL_SENT_FROM_OPERATIONAL_MAILBOX",
      content_claim_status: "UNVERIFIED_CLAIMS",
      causal_status: "UNPROVEN",
      admission_status: "CANDIDATE_REVIEW_BATCH",
      authority: "OBSERVE_ONLY",
    },
    payload: {
      subject: String(row.subject ?? ""),
      body_text: String(row.body_text ?? ""),
      extraction_status: extractionStatus,
      attachment_count: Number(row.attachment_count ?? attachments.length ?? 0),
      attachments,
      quality_flags: qualityFlags,
      missing_fields: missingFields,
    },
    permissions: {
      external_action_allowed: false,
      customer_reply_allowed: false,
      blame_assignment_allowed: false,
    },
  };
}
