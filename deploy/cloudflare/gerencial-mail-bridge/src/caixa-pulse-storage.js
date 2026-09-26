function numericUids(values) {
  return (values ?? [])
    .map((value) => Number(value))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
}

export async function findKnownCaixaPulseUidsD1(db, uidValidity, uids) {
  const values = numericUids(uids);
  if (!values.length) return [];

  const placeholders = values.map(() => "?").join(",");
  const result = await db.prepare(
    `SELECT mailbox_uid
       FROM caixa_pulse_shift
      WHERE uid_validity = ?
        AND mailbox_uid IN (${placeholders})`,
  ).bind(String(uidValidity), ...values).all();

  return (result.results ?? []).map((row) => String(row.mailbox_uid));
}

export async function upsertCaixaPulseMessageD1(db, record) {
  const now = new Date().toISOString();
  const statements = [];

  statements.push(
    db.prepare(
      `INSERT INTO caixa_pulse_shift (
        mailbox_key, uid_validity, mailbox_uid,
        business_date, shift, message_sent_at,
        reported_total, parsed_total, open_total, explicit_none,
        source_health, readonly_verified, body_char_count,
        quality_flags_json, is_canonical, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)
      ON CONFLICT(mailbox_key) DO UPDATE SET
        business_date=excluded.business_date,
        shift=excluded.shift,
        message_sent_at=excluded.message_sent_at,
        reported_total=excluded.reported_total,
        parsed_total=excluded.parsed_total,
        open_total=excluded.open_total,
        explicit_none=excluded.explicit_none,
        source_health=excluded.source_health,
        readonly_verified=excluded.readonly_verified,
        body_char_count=excluded.body_char_count,
        quality_flags_json=excluded.quality_flags_json,
        updated_at=excluded.updated_at`,
    ).bind(
      record.mailbox_key,
      record.uid_validity,
      record.mailbox_uid,
      record.business_date,
      record.shift,
      record.message_sent_at,
      record.reported_total,
      record.parsed_total,
      record.open_total,
      record.explicit_none ? 1 : 0,
      record.source_health,
      record.readonly_verified ? 1 : 0,
      record.body_char_count,
      JSON.stringify(record.quality_flags ?? []),
      now,
      now,
    ),
  );

  statements.push(
    db.prepare(
      "DELETE FROM caixa_pulse_occurrence WHERE mailbox_key = ?",
    ).bind(record.mailbox_key),
  );

  for (const occurrence of record.occurrences ?? []) {
    statements.push(
      db.prepare(
        `INSERT INTO caixa_pulse_occurrence (
          mailbox_key, occurrence_index, domain, category,
          operator_name, status, reference_text,
          happened_text, action_text, created_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        record.mailbox_key,
        occurrence.occurrence_index,
        occurrence.domain,
        occurrence.category,
        occurrence.operator,
        occurrence.status,
        occurrence.reference,
        occurrence.happened_text,
        occurrence.action_text,
        now,
      ),
    );
  }

  statements.push(
    db.prepare(
      `UPDATE caixa_pulse_shift
          SET is_canonical = 0,
              updated_at = ?
        WHERE business_date = ?
          AND shift = ?`,
    ).bind(now, record.business_date, record.shift),
  );

  statements.push(
    db.prepare(
      `UPDATE caixa_pulse_shift
          SET is_canonical = 1,
              updated_at = ?
        WHERE mailbox_key = (
          SELECT mailbox_key
            FROM caixa_pulse_shift
           WHERE business_date = ?
             AND shift = ?
           ORDER BY message_sent_at DESC, mailbox_uid DESC
           LIMIT 1
        )`,
    ).bind(now, record.business_date, record.shift),
  );

  await db.batch(statements);
}

export async function getCanonicalCaixaPulseShiftD1(db, businessDate, shift) {
  return db.prepare(
    `SELECT *
       FROM caixa_pulse_shift
      WHERE business_date = ?
        AND shift = ?
        AND is_canonical = 1
      LIMIT 1`,
  ).bind(businessDate, shift).first();
}
