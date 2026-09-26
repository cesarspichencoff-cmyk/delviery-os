export const CLOSING_SOURCE = "tata_daily_closing";
export const IFOOD_REVIEW_SOURCE = "ifood_review_mail";
export const EDGE_CONTRACT_VERSION = "edge-watch-handoff@0.1.0";

export class ProducerError extends Error {
  constructor(code) {
    super(code);
    this.name = "ProducerError";
    this.code = code;
  }
}

function assertIso(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new ProducerError(code);
  }
}

function assertDate(value, code) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ProducerError(code);
  }
}

function bool01(value) {
  return value === true || value === 1 || value === "1";
}

export function normalizeClosingRow(row) {
  if (!row || typeof row !== "object") {
    throw new ProducerError("closing_row_invalid");
  }

  const mailboxUid = Number(row.mailbox_uid);
  if (!Number.isSafeInteger(mailboxUid) || mailboxUid <= 0) {
    throw new ProducerError("closing_mailbox_uid_invalid");
  }

  const businessDate = String(row.business_date ?? "").trim();
  assertDate(businessDate, "closing_business_date_invalid");

  const messageSentAt = String(row.message_sent_at ?? "");
  const ingestedAt = String(row.updated_at ?? "");
  assertIso(messageSentAt, "closing_message_sent_at_invalid");
  assertIso(ingestedAt, "closing_updated_at_invalid");

  if (!bool01(row.readonly_verified)) {
    throw new ProducerError("closing_not_readonly_verified");
  }

  return {
    mailbox_uid: mailboxUid,
    business_date: businessDate,
    message_sent_at: messageSentAt,
    source_observed_at: messageSentAt,
    ingested_at: ingestedAt,
    totals_match: bool01(row.totals_match),
    period_label_mismatch: bool01(row.period_label_mismatch),
  };
}

export function normalizeIfoodReviewRow(row) {
  if (!row || typeof row !== "object") {
    throw new ProducerError("ifood_review_row_invalid");
  }

  const mailboxUid = Number(row.mailbox_uid);
  if (!Number.isSafeInteger(mailboxUid) || mailboxUid <= 0) {
    throw new ProducerError("ifood_review_mailbox_uid_invalid");
  }

  const uidValidity = String(row.uid_validity ?? "").trim();
  if (!/^[1-9]\d*$/.test(uidValidity)) {
    throw new ProducerError("ifood_review_uidvalidity_invalid");
  }

  const messageSentAt = String(row.message_sent_at ?? "");
  const ingestedAt = String(row.updated_at ?? "");
  assertIso(messageSentAt, "ifood_review_message_sent_at_invalid");
  assertIso(ingestedAt, "ifood_review_updated_at_invalid");

  if (!bool01(row.readonly_verified)) {
    throw new ProducerError("ifood_review_not_readonly_verified");
  }

  const attachmentCount = Number(row.attachment_count ?? 0);
  if (!Number.isSafeInteger(attachmentCount) || attachmentCount < 0) {
    throw new ProducerError("ifood_review_attachment_count_invalid");
  }

  return {
    mailbox_uid: mailboxUid,
    uid_validity: uidValidity,
    message_sent_at: messageSentAt,
    source_observed_at: messageSentAt,
    ingested_at: ingestedAt,
    attachment_count: attachmentCount,
  };
}

export function operationalRowsToEdgeHandoff(
  { closingRow = null, ifoodReviewRow = null },
  generatedAt,
) {
  assertIso(generatedAt, "producer_generated_at_invalid");
  const sourceCoverage = [];

  if (closingRow) {
    const closing = normalizeClosingRow(closingRow);
    if (Date.parse(closing.source_observed_at) > Date.parse(generatedAt)) {
      throw new ProducerError("closing_source_observed_after_generation");
    }
    sourceCoverage.push({
      source: CLOSING_SOURCE,
      observation_count: 1,
      first_observed_at: closing.source_observed_at,
      last_observed_at: closing.source_observed_at,
    });
  }

  if (ifoodReviewRow) {
    const ifood = normalizeIfoodReviewRow(ifoodReviewRow);
    if (Date.parse(ifood.source_observed_at) > Date.parse(generatedAt)) {
      throw new ProducerError("ifood_review_source_observed_after_generation");
    }
    sourceCoverage.push({
      source: IFOOD_REVIEW_SOURCE,
      observation_count: 1,
      first_observed_at: ifood.source_observed_at,
      last_observed_at: ifood.source_observed_at,
    });
  }

  if (!sourceCoverage.length) {
    throw new ProducerError("no_verified_source_observation");
  }

  const sourceWatermarkAt = sourceCoverage
    .map((item) => item.last_observed_at)
    .sort((a, b) => Date.parse(a) - Date.parse(b))
    .at(-1);

  return {
    contract_version: EDGE_CONTRACT_VERSION,
    source_system: "TATA_EDGE",
    source_mode: "live_observed",
    fact_class: "FACT",
    generated_at: generatedAt,
    source_watermark_at: sourceWatermarkAt,
    observation_count: sourceCoverage.length,
    source_coverage: sourceCoverage,
    identity_counts: {
      proven: 0,
      supported_inference: 0,
      candidate: 0,
      unknown: 0,
    },
    hard_exceptions: [],
    global_coverage_claim: "NOT_PROVIDED",
    external_effect_authorized: false,
  };
}

export function closingRowToEdgeHandoff(row, generatedAt) {
  return operationalRowsToEdgeHandoff({ closingRow: row }, generatedAt);
}

export function latestClosingWatermarkFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.coverage)) {
    return null;
  }

  const matches = snapshot.coverage
    .filter((item) => item?.source === CLOSING_SOURCE)
    .map((item) => item?.last_observed_at)
    .filter((value) => typeof value === "string" && Number.isFinite(Date.parse(value)))
    .sort();

  return matches.length > 0 ? matches[matches.length - 1] : null;
}

export function shouldDispatchClosing(row, currentSnapshot) {
  const normalized = normalizeClosingRow(row);
  const current = latestClosingWatermarkFromSnapshot(currentSnapshot);

  if (!current) {
    return {
      dispatch: true,
      reason: "source_not_present_in_snapshot",
      source_watermark_at: normalized.source_observed_at,
    };
  }

  if (Date.parse(normalized.source_observed_at) <= Date.parse(current)) {
    return {
      dispatch: false,
      reason: "source_already_observed",
      source_watermark_at: normalized.source_observed_at,
    };
  }

  return {
    dispatch: true,
    reason: "new_source_observation",
    source_watermark_at: normalized.source_observed_at,
  };
}

export function latestIfoodReviewWatermarkFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.coverage)) {
    return null;
  }

  const matches = snapshot.coverage
    .filter((item) => item?.source === IFOOD_REVIEW_SOURCE)
    .map((item) => item?.last_observed_at)
    .filter((value) => typeof value === "string" && Number.isFinite(Date.parse(value)))
    .sort();

  return matches.length > 0 ? matches[matches.length - 1] : null;
}

export function shouldDispatchIfoodReview(row, currentSnapshot) {
  const normalized = normalizeIfoodReviewRow(row);
  const current = latestIfoodReviewWatermarkFromSnapshot(currentSnapshot);

  if (!current) {
    return {
      dispatch: true,
      reason: "source_not_present_in_snapshot",
      source_watermark_at: normalized.source_observed_at,
    };
  }

  if (Date.parse(normalized.source_observed_at) <= Date.parse(current)) {
    return {
      dispatch: false,
      reason: "source_already_observed",
      source_watermark_at: normalized.source_observed_at,
    };
  }

  return {
    dispatch: true,
    reason: "new_source_observation",
    source_watermark_at: normalized.source_observed_at,
  };
}
