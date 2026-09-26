import { neon } from "@neondatabase/serverless";

function numericMailboxUids(uids) {
  const values = uids.map((uid) => Number(uid));
  if (values.some((uid) => !Number.isSafeInteger(uid) || uid <= 0)) {
    throw new TypeError("INVALID_MAILBOX_UID_LOOKUP");
  }
  return values;
}

export async function findKnownClosingUidsD1(db, uids) {
  if (!db) throw new Error("D1 binding is not configured");
  const values = numericMailboxUids(uids);
  if (!values.length) return [];
  const placeholders = values.map(() => "?").join(",");
  const result = await db.prepare(
    `SELECT mailbox_uid FROM daily_closings
     WHERE mailbox_uid IN (${placeholders})`,
  ).bind(...values).all();
  return (result.results ?? []).map((row) => String(row.mailbox_uid));
}

export async function upsertClosing(db, row, readOnlyVerified) {
  const now = new Date().toISOString();
  const sql = `
    INSERT INTO daily_closings (
      mailbox_uid, business_date, message_sent_at,
      report_gross_total, lunch_gross, dinner_gross,
      ifood_orders_total, ifood_value_total,
      app_orders_total, app_value_total,
      tel_orders_total, tel_value_total,
      salao_value_total, discounts_value_total,
      lunch_cash, dinner_cash,
      lunch_machine_total, dinner_machine_total,
      lunch_bordero_total, dinner_bordero_total,
      report_bordero_diff, totals_match,
      period_label_mismatch, readonly_verified,
      quality_flags_json, metrics_json,
      created_at, updated_at
    ) VALUES (
      ?,?,?,?,?,?,?,?,?,?,?,?,?,?,
      ?,?,?,?,?,?,?,?,?,?,?,?,?,?
    )
    ON CONFLICT(business_date) DO UPDATE SET
      mailbox_uid = excluded.mailbox_uid,
      message_sent_at = excluded.message_sent_at,
      report_gross_total = excluded.report_gross_total,
      lunch_gross = excluded.lunch_gross,
      dinner_gross = excluded.dinner_gross,
      ifood_orders_total = excluded.ifood_orders_total,
      ifood_value_total = excluded.ifood_value_total,
      app_orders_total = excluded.app_orders_total,
      app_value_total = excluded.app_value_total,
      tel_orders_total = excluded.tel_orders_total,
      tel_value_total = excluded.tel_value_total,
      salao_value_total = excluded.salao_value_total,
      discounts_value_total = excluded.discounts_value_total,
      lunch_cash = excluded.lunch_cash,
      dinner_cash = excluded.dinner_cash,
      lunch_machine_total = excluded.lunch_machine_total,
      dinner_machine_total = excluded.dinner_machine_total,
      lunch_bordero_total = excluded.lunch_bordero_total,
      dinner_bordero_total = excluded.dinner_bordero_total,
      report_bordero_diff = excluded.report_bordero_diff,
      totals_match = excluded.totals_match,
      period_label_mismatch = excluded.period_label_mismatch,
      readonly_verified = excluded.readonly_verified,
      quality_flags_json = excluded.quality_flags_json,
      metrics_json = excluded.metrics_json,
      updated_at = excluded.updated_at
    WHERE excluded.message_sent_at >= daily_closings.message_sent_at
  `;

  return db.prepare(sql).bind(
    row.mailbox_uid,
    row.business_date,
    row.message_sent_at,
    row.report_gross_total,
    row.lunch_gross,
    row.dinner_gross,
    row.ifood_orders_total,
    row.ifood_value_total,
    row.app_orders_total,
    row.app_value_total,
    row.tel_orders_total,
    row.tel_value_total,
    row.salao_value_total,
    row.discounts_value_total,
    row.lunch_cash,
    row.dinner_cash,
    row.lunch_machine_total,
    row.dinner_machine_total,
    row.lunch_bordero_total,
    row.dinner_bordero_total,
    row.report_bordero_diff,
    row.totals_match ? 1 : 0,
    row.period_label_mismatch ? 1 : 0,
    readOnlyVerified ? 1 : 0,
    JSON.stringify(row.quality_flags),
    JSON.stringify(row.metrics),
    now,
    now,
  ).run();
}

export async function findKnownClosingUidsNeon(databaseUrl, uids) {
  if (!databaseUrl) throw new Error("NEON_DATABASE_URL is not configured");
  const values = numericMailboxUids(uids);
  if (!values.length) return [];
  const placeholders = values
    .map((_uid, index) => `$${index + 1}::bigint`)
    .join(",");
  const sql = neon(databaseUrl);
  const result = await sql.query(
    `SELECT mailbox_uid FROM gerencial.daily_closings
     WHERE mailbox_uid IN (${placeholders})`,
    values,
  );
  const rows = result.rows ?? result;
  return rows.map((row) => String(row.mailbox_uid));
}

export async function upsertClosingNeon(databaseUrl, row, readOnlyVerified) {
  if (!databaseUrl) throw new Error("NEON_DATABASE_URL is not configured");
  const sql = neon(databaseUrl);
  const flags = JSON.stringify(row.quality_flags ?? []);
  const metrics = JSON.stringify(row.metrics ?? {});
  await sql.query(
    `INSERT INTO gerencial.daily_closings (
      business_date, mailbox_uid, message_sent_at,
      report_gross_total, lunch_gross, dinner_gross,
      ifood_orders_total, ifood_value_total,
      app_orders_total, app_value_total,
      tel_orders_total, tel_value_total,
      salao_value_total, discounts_value_total,
      lunch_cash, dinner_cash,
      lunch_machine_total, dinner_machine_total,
      lunch_bordero_total, dinner_bordero_total,
      report_bordero_diff, totals_match,
      period_label_mismatch, readonly_verified,
      quality_flags, metrics, updated_at
    ) VALUES (
      $1::date,$2,$3::timestamptz,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
      $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25::jsonb,$26::jsonb,now()
    )
    ON CONFLICT (business_date) DO UPDATE SET
      mailbox_uid = EXCLUDED.mailbox_uid,
      message_sent_at = EXCLUDED.message_sent_at,
      report_gross_total = EXCLUDED.report_gross_total,
      lunch_gross = EXCLUDED.lunch_gross,
      dinner_gross = EXCLUDED.dinner_gross,
      ifood_orders_total = EXCLUDED.ifood_orders_total,
      ifood_value_total = EXCLUDED.ifood_value_total,
      app_orders_total = EXCLUDED.app_orders_total,
      app_value_total = EXCLUDED.app_value_total,
      tel_orders_total = EXCLUDED.tel_orders_total,
      tel_value_total = EXCLUDED.tel_value_total,
      salao_value_total = EXCLUDED.salao_value_total,
      discounts_value_total = EXCLUDED.discounts_value_total,
      lunch_cash = EXCLUDED.lunch_cash,
      dinner_cash = EXCLUDED.dinner_cash,
      lunch_machine_total = EXCLUDED.lunch_machine_total,
      dinner_machine_total = EXCLUDED.dinner_machine_total,
      lunch_bordero_total = EXCLUDED.lunch_bordero_total,
      dinner_bordero_total = EXCLUDED.dinner_bordero_total,
      report_bordero_diff = EXCLUDED.report_bordero_diff,
      totals_match = EXCLUDED.totals_match,
      period_label_mismatch = EXCLUDED.period_label_mismatch,
      readonly_verified = EXCLUDED.readonly_verified,
      quality_flags = EXCLUDED.quality_flags,
      metrics = EXCLUDED.metrics,
      updated_at = now()
    WHERE EXCLUDED.message_sent_at >= gerencial.daily_closings.message_sent_at`,
    [
      row.business_date,
      row.mailbox_uid,
      row.message_sent_at,
      row.report_gross_total,
      row.lunch_gross,
      row.dinner_gross,
      row.ifood_orders_total,
      row.ifood_value_total,
      row.app_orders_total,
      row.app_value_total,
      row.tel_orders_total,
      row.tel_value_total,
      row.salao_value_total,
      row.discounts_value_total,
      row.lunch_cash,
      row.dinner_cash,
      row.lunch_machine_total,
      row.dinner_machine_total,
      row.lunch_bordero_total,
      row.dinner_bordero_total,
      row.report_bordero_diff,
      Boolean(row.totals_match),
      Boolean(row.period_label_mismatch),
      Boolean(readOnlyVerified),
      flags,
      metrics,
    ],
  );

  await sql.query(
    `UPDATE gerencial.bridge_status
     SET last_ingestion_at = now(),
         last_success_at = now(),
         last_error_code = NULL,
         updated_at = now()
     WHERE singleton = true`,
    [],
  );
}
