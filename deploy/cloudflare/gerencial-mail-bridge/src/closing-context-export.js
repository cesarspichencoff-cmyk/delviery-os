function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bool01(value) {
  return value === true || value === 1 || value === "1";
}

export function closingRowToContextEvent(row) {
  const uid = Number(row?.mailbox_uid);
  if (!Number.isSafeInteger(uid) || uid <= 0) throw new TypeError("INVALID_MAILBOX_UID");

  const businessDate = String(row?.business_date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new TypeError("INVALID_BUSINESS_DATE");
  }

  const qualityFlags = parseJsonArray(row.quality_flags_json ?? row.quality_flags);
  const totalsMatch = bool01(row.totals_match);
  const periodLabelMismatch = bool01(row.period_label_mismatch);
  const readOnlyVerified = bool01(row.readonly_verified);

  const missingFields = [];
  if (!readOnlyVerified) missingFields.push("READ_ONLY_PROOF");
  if (!totalsMatch) missingFields.push("FINANCIAL_RECONCILIATION");
  if (periodLabelMismatch) missingFields.push("PERIOD_LABEL_MAPPING");

  return {
    event_id: `mail:atendimento:closing:${uid}`,
    event_type: "SOURCE_TATA_DAILY_CLOSING",
    domain: "WORK_TATA",
    occurred_at: String(row.message_sent_at ?? ""),
    observed_at: String(row.updated_at ?? row.created_at ?? row.message_sent_at ?? ""),
    source: {
      system: "ATENDIMENTO_IMAP_D1",
      mailbox: "atendimento@tatasushi.com.br",
      folder_role: "SENT",
      source_table: "daily_closings",
      source_ref: String(uid),
      read_only_verified: readOnlyVerified,
    },
    epistemic: {
      metrics_status: "SOURCE_REPORTED_FACTS",
      causal_status: "UNPROVEN",
      authority: "OBSERVE_ONLY",
    },
    payload: {
      business_date: businessDate,
      gross_total: numberOrNull(row.report_gross_total),
      lunch_gross: numberOrNull(row.lunch_gross),
      dinner_gross: numberOrNull(row.dinner_gross),
      ifood_orders_total: numberOrNull(row.ifood_orders_total),
      ifood_value_total: numberOrNull(row.ifood_value_total),
      app_orders_total: numberOrNull(row.app_orders_total),
      app_value_total: numberOrNull(row.app_value_total),
      tel_orders_total: numberOrNull(row.tel_orders_total),
      tel_value_total: numberOrNull(row.tel_value_total),
      salao_value_total: numberOrNull(row.salao_value_total),
      discounts_value_total: numberOrNull(row.discounts_value_total),
      report_bordero_diff: numberOrNull(row.report_bordero_diff),
      totals_match: totalsMatch,
      period_label_mismatch: periodLabelMismatch,
      quality_flags: qualityFlags,
      missing_fields: missingFields,
    },
    permissions: {
      external_action_allowed: false,
      financial_write_allowed: false,
      causal_assignment_allowed: false,
    },
  };
}

export function compareClosings(currentEvent, previousEvent) {
  if (currentEvent?.event_type !== "SOURCE_TATA_DAILY_CLOSING" ||
      previousEvent?.event_type !== "SOURCE_TATA_DAILY_CLOSING") {
    throw new TypeError("CLOSING_EVENTS_REQUIRED");
  }

  const current = currentEvent.payload;
  const previous = previousEvent.payload;
  const delta = (a, b) => {
    if (a === null || b === null) return null;
    return a - b;
  };
  const pct = (a, b) => {
    if (a === null || b === null || b === 0) return null;
    return ((a - b) / Math.abs(b)) * 100;
  };

  return {
    current_business_date: current.business_date,
    previous_business_date: previous.business_date,
    descriptive_only: true,
    causal_status: "UNPROVEN",
    gross_delta: delta(current.gross_total, previous.gross_total),
    gross_pct_change: pct(current.gross_total, previous.gross_total),
    ifood_orders_delta: delta(current.ifood_orders_total, previous.ifood_orders_total),
    ifood_value_delta: delta(current.ifood_value_total, previous.ifood_value_total),
    salao_value_delta: delta(current.salao_value_total, previous.salao_value_total),
    current_quality_flags: current.quality_flags,
  };
}
