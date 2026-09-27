import {
  ProducerError,
  normalizeClosingRow,
  normalizeIfoodReviewRow,
  operationalRowsToEdgeHandoff,
  shouldDispatchClosing,
  shouldDispatchIfoodReview,
} from "./core.mjs";
import {
  TallyWebhookError,
  parseTallyOccurrenceWebhook,
  verifyTallySignature,
} from "./tally-webhook-core.mjs";
import {
  sha256Hex,
  storeTallyObservation,
} from "./tally-webhook-storage.mjs";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function adminAuthorized(request, env) {
  if (!env.EDGE_PRODUCER_ADMIN_TOKEN) return false;
  return request.headers.get("authorization") ===
    `Bearer ${env.EDGE_PRODUCER_ADMIN_TOKEN}`;
}

function tallyCaptureConfigured(env) {
  return env.TALLY_CAPTURE_ENABLED === "true" &&
    Boolean(env.TALLY_EXPECTED_FORM_ID) &&
    Boolean(env.TALLY_SIGNING_SECRET) &&
    Boolean(env.TALLY_CAPTURE_DB?.prepare);
}

async function handleTallyOccurrenceWebhook(request, env) {
  if (env.TALLY_CAPTURE_ENABLED !== "true") {
    return json({ error: "not_found" }, 404);
  }
  if (!tallyCaptureConfigured(env)) {
    return json({ error: "tally_capture_not_configured" }, 503);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json({ error: "unsupported_media_type" }, 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > 1_000_000) {
    return json({ error: "payload_too_large" }, 413);
  }

  const rawBody = await request.text();
  if (rawBody.length > 1_000_000) {
    return json({ error: "payload_too_large" }, 413);
  }

  const signature = request.headers.get("tally-signature");
  const verified = await verifyTallySignature(
    rawBody,
    signature,
    env.TALLY_SIGNING_SECRET,
  );
  if (!verified) return json({ error: "invalid_signature" }, 401);

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  try {
    const observation = parseTallyOccurrenceWebhook(
      payload,
      env.TALLY_EXPECTED_FORM_ID,
    );
    const payloadSha256 = await sha256Hex(rawBody);
    const receipt = await storeTallyObservation(
      env.TALLY_CAPTURE_DB,
      observation,
      payloadSha256,
    );
    return json({
      accepted: true,
      duplicate: receipt.duplicate,
      source: observation.source,
      truth_class: observation.truth_class,
      event_id: observation.event_id,
      submission_id: observation.submission_id,
      external_effects_authorized: false,
    }, 202);
  } catch (error) {
    if (error instanceof TallyWebhookError) {
      const status = error.code === "tally_replay_conflict" ? 409 : 422;
      return json({ error: error.code }, status);
    }
    throw error;
  }
}

async function latestVerifiedClosing(env) {
  return env.SOURCE_DB.prepare(
    `SELECT
      mailbox_uid,
      business_date,
      message_sent_at,
      updated_at,
      readonly_verified,
      totals_match,
      period_label_mismatch
    FROM daily_closings
    WHERE readonly_verified = 1
    ORDER BY business_date DESC, message_sent_at DESC, mailbox_uid DESC
    LIMIT 1`,
  ).first();
}

async function latestVerifiedIfoodReview(env) {
  return env.SOURCE_DB.prepare(
    `SELECT
      uid_validity,
      mailbox_uid,
      message_sent_at,
      updated_at,
      readonly_verified,
      attachment_count
    FROM ifood_review_mail
    WHERE readonly_verified = 1
    ORDER BY message_sent_at DESC, mailbox_uid DESC
    LIMIT 1`,
  ).first();
}

function watchTargetConfigured(env) {
  return Boolean(
    env.WATCH_BRIDGE_TOKEN &&
    (env.WATCH_SERVICE?.fetch || env.WATCH_BASE_URL),
  );
}

async function watchFetch(env, path, init) {
  const request = new Request(`https://watch.internal${path}`, init);

  if (env.WATCH_SERVICE?.fetch) {
    return env.WATCH_SERVICE.fetch(request);
  }

  if (!env.WATCH_BASE_URL) {
    throw new ProducerError("watch_target_not_configured");
  }

  return fetch(`${env.WATCH_BASE_URL}${path}`, init);
}

async function watchSnapshot(env) {
  const response = await watchFetch(env, "/snapshot", {
    method: "GET",
    headers: {
      authorization: `Bearer ${env.WATCH_BRIDGE_TOKEN}`,
      accept: "application/json",
    },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    console.error(JSON.stringify({
      event: "tata_edge_watch_snapshot_read_failed",
      upstream_status: response.status,
      external_effects_authorized: false,
    }));
    throw new ProducerError("watch_snapshot_read_failed");
  }
  return response.json();
}

async function postHandoff(env, handoff) {
  const response = await watchFetch(
    env,
    "/sources/tata-edge/handoff",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.WATCH_BRIDGE_TOKEN}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(handoff),
    },
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.accepted !== true) {
    console.error(JSON.stringify({
      event: "tata_edge_watch_handoff_rejected",
      upstream_status: response.status,
      upstream_error:
        typeof body?.error === "string" ? body.error : "unknown",
      external_effects_authorized: false,
    }));
    throw new ProducerError("watch_handoff_rejected");
  }

  return {
    accepted: true,
    duplicate: body?.duplicate === true,
    truth_class: body?.snapshot?.truthClass ?? null,
    validity_status: body?.snapshot?.validity?.status ?? null,
    global_all_clear_authorized:
      body?.snapshot?.validity?.globalAllClearAuthorized === true,
    external_effects_authorized:
      body?.snapshot?.externalEffectsAuthorized === true,
  };
}

export async function runOnce(env, generatedAt = new Date().toISOString()) {
  if (!watchTargetConfigured(env)) {
    throw new ProducerError("watch_target_not_configured");
  }

  const [closingRow, ifoodReviewRow] = await Promise.all([
    latestVerifiedClosing(env),
    latestVerifiedIfoodReview(env),
  ]);

  if (!closingRow && !ifoodReviewRow) {
    return {
      status: "skipped",
      reason: "no_verified_sources",
      external_effects_authorized: false,
    };
  }

  const closing = closingRow ? normalizeClosingRow(closingRow) : null;
  const ifood = ifoodReviewRow ? normalizeIfoodReviewRow(ifoodReviewRow) : null;
  const handoff = operationalRowsToEdgeHandoff(
    { closingRow, ifoodReviewRow },
    generatedAt,
  );
  const snapshot = await watchSnapshot(env);

  const closingDecision = closingRow
    ? shouldDispatchClosing(closingRow, snapshot)
    : null;
  const ifoodDecision = ifoodReviewRow
    ? shouldDispatchIfoodReview(ifoodReviewRow, snapshot)
    : null;
  const shouldDispatch =
    closingDecision?.dispatch === true || ifoodDecision?.dispatch === true;

  if (!shouldDispatch) {
    return {
      status: "skipped",
      reason: "source_already_observed",
      source_business_date: closing?.business_date ?? null,
      source_watermark_at: handoff.source_watermark_at,
      source_ingested_at: closing?.ingested_at ?? null,
      ifood_source_watermark_at: ifood?.source_observed_at ?? null,
      ifood_source_ingested_at: ifood?.ingested_at ?? null,
      source_count: handoff.source_coverage.length,
      external_effects_authorized: false,
    };
  }

  const receipt = await postHandoff(env, handoff);

  return {
    status: "sent",
    source_business_date: closing?.business_date ?? null,
    source_watermark_at: handoff.source_watermark_at,
    source_ingested_at: closing?.ingested_at ?? null,
    source_totals_match: closing?.totals_match ?? null,
    source_period_label_mismatch: closing?.period_label_mismatch ?? null,
    ifood_source_watermark_at: ifood?.source_observed_at ?? null,
    ifood_source_ingested_at: ifood?.ingested_at ?? null,
    source_count: handoff.source_coverage.length,
    watch: receipt,
    external_effects_authorized: false,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        status: "ok",
        runtime: "tata-edge-cloud-shadow@0.1.0",
        source_mode: "read_only_operational_sources",
        sources: ["tata_daily_closing", "ifood_review_mail"],
        external_effects_authorized: false,
      });
    }

    if (
      request.method === "POST" &&
      url.pathname === "/sources/tally/occurrence-barrier"
    ) {
      return handleTallyOccurrenceWebhook(request, env);
    }

    if (request.method === "POST" && url.pathname === "/run") {
      if (!adminAuthorized(request, env)) {
        return json({ error: "unauthorized" }, 401);
      }

      try {
        return json(await runOnce(env), 200);
      } catch (error) {
        if (error instanceof ProducerError) {
          return json({ error: error.code }, 409);
        }

        console.error(JSON.stringify({
          event: "tata_edge_cloud_shadow_run_failed",
          at: new Date().toISOString(),
          error: error instanceof Error ? error.name : "unknown",
        }));
        return json({ error: "internal_error" }, 500);
      }
    }

    return json({ error: "not_found" }, 404);
  },

  async scheduled(_controller, env) {
    try {
      const result = await runOnce(env);
      console.log(JSON.stringify({
        event: "tata_edge_cloud_shadow_cycle",
        status: result.status,
        reason: result.reason ?? null,
        source_business_date: result.source_business_date ?? null,
        source_watermark_at: result.source_watermark_at ?? null,
        external_effects_authorized: false,
      }));
    } catch (error) {
      console.error(JSON.stringify({
        event: "tata_edge_cloud_shadow_cycle_failed",
        at: new Date().toISOString(),
        error: error instanceof ProducerError ? error.code :
          error instanceof Error ? error.name : "unknown",
      }));
    }
  },
};
