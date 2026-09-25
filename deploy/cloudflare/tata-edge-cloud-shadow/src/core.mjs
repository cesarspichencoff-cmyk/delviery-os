export const CLOSING_SOURCE = "tata_daily_closing";
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

export function closingRowToEdgeHandoff(row, generatedAt) {
  const normalized = normalizeClosingRow(row);
  assertIso(generatedAt, "producer_generated_at_invalid");

  if (Date.parse(normalized.source_observed_at) > Date.parse(generatedAt)) {
    throw new ProducerError("closing_source_observed_after_generation");
  }

  return {
    contract_version: EDGE_CONTRACT_VERSION,
    source_system: "TATA_EDGE",
    source_mode: "live_observed",
    fact_class: "FACT",
    generated_at: generatedAt,
    source_watermark_at: normalized.source_observed_at,
    observation_count: 1,
    source_coverage: [{
      source: CLOSING_SOURCE,
      observation_count: 1,
      first_observed_at: normalized.source_observed_at,
      last_observed_at: normalized.source_observed_at,
    }],
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
