import { TallyWebhookError } from "./tally-webhook-core.mjs";

function json(value) {
  return value == null ? null : JSON.stringify(value);
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value ?? "")),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function storeTallyObservation(
  db,
  observation,
  payloadSha256,
  receivedAt = new Date().toISOString(),
) {
  if (!db?.prepare) throw new TallyWebhookError("tally_capture_db_missing");

  const insert = await db.prepare(
    `INSERT OR IGNORE INTO tally_occurrence_barrier (
      event_id, submission_id, form_id, source_created_at,
      operator_name, business_date, shift, category,
      reference_text, happened_text, action_text, status, subtype,
      item_missing_barriers_json, wrong_item_barriers_json,
      truth_class, payload_sha256, received_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    observation.event_id,
    observation.submission_id,
    observation.form_id,
    observation.source_created_at,
    observation.operator_name,
    observation.business_date,
    observation.shift,
    observation.category,
    observation.reference_text,
    observation.happened_text,
    observation.action_text,
    observation.status,
    observation.subtype,
    json(observation.item_missing_barriers),
    json(observation.wrong_item_barriers),
    observation.truth_class,
    payloadSha256,
    receivedAt,
  ).run();

  const existing = await db.prepare(
    `SELECT event_id, submission_id, form_id, payload_sha256
       FROM tally_occurrence_barrier
      WHERE event_id = ? OR submission_id = ?
      LIMIT 1`,
  ).bind(observation.event_id, observation.submission_id).first();

  if (!existing) throw new TallyWebhookError("tally_capture_write_unverified");
  const same =
    existing.event_id === observation.event_id &&
    existing.submission_id === observation.submission_id &&
    existing.form_id === observation.form_id &&
    existing.payload_sha256 === payloadSha256;

  if (!same) throw new TallyWebhookError("tally_replay_conflict");

  const changes = Number(insert?.meta?.changes ?? 0);
  return {
    accepted: true,
    duplicate: changes === 0,
    event_id: observation.event_id,
    submission_id: observation.submission_id,
    payload_sha256: payloadSha256,
    external_effects_authorized: false,
  };
}
