import { neon } from "@neondatabase/serverless";

export async function upsertNeon(databaseUrl, row, readOnlyVerified) {
  if (!databaseUrl) throw new Error("NEON_DATABASE_URL is not configured");
  const sql = neon(databaseUrl);
  const flags = JSON.stringify(row.quality_flags ?? []);
  const metrics = JSON.stringify(row.metrics ?? {});
  const readonly = Boolean(readOnlyVerified);
  await sql`
    INSERT INTO gerencial.daily_closings (
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
      ${row.business_date}::date,
      ${row.mailbox_uid},
      ${row.message_sent_at}::timestamptz,
      ${row.report_gross_total},
      ${row.lunch_gross},
      ${row.dinner_gross},
      ${row.ifood_orders_total},
      ${row.ifood_value_total},
      ${row.app_orders_total},
      ${row.app_value_total},
      ${row.tel_orders_total},
      ${row.tel_value_total},
      ${row.salao_value_total},
      ${row.discounts_value_total},
      ${row.lunch_cash},
      ${row.dinner_cash},
      ${row.lunch_machine_total},
      ${row.dinner_machine_total},
      ${row.lunch_bordero_total},
      ${row.dinner_bordero_total},
      ${row.report_bordero_diff},
      ${Boolean(row.totals_match)},
      ${Boolean(row.period_label_mismatch)},
      ${readonly},
      ${flags}::jsonb,
      ${metrics}::jsonb,
      now()
    )
