import {
  ProducerError,
  closingRowToEdgeHandoff,
  normalizeClosingRow,
  shouldDispatchClosing,
} from "./core.mjs";

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
    ORDER BY updated_at DESC, mailbox_uid DESC
    LIMIT 1`,
  ).first();
}

async function watchSnapshot(env) {
  const response = await fetch(`${env.WATCH_BASE_URL}/snapshot`, {
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
  const response = await fetch(
    `${env.WATCH_BASE_URL}/sources/tata-edge/handoff`,
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
  if (!env.WATCH_BASE_URL || !env.WATCH_BRIDGE_TOKEN) {
    throw new ProducerError("watch_target_not_configured");
  }

  const row = await latestVerifiedClosing(env);
  if (!row) {
    return {
      status: "skipped",
      reason: "no_verified_closing",
      external_effects_authorized: false,
    };
  }

  const normalized = normalizeClosingRow(row);
  const snapshot = await watchSnapshot(env);
  const decision = shouldDispatchClosing(row, snapshot);

  if (!decision.dispatch) {
    return {
      status: "skipped",
      reason: decision.reason,
      source_business_date: normalized.business_date,
      source_watermark_at: normalized.observed_at,
      external_effects_authorized: false,
    };
  }

  const handoff = closingRowToEdgeHandoff(row, generatedAt);
  const receipt = await postHandoff(env, handoff);

  return {
    status: "sent",
    source_business_date: normalized.business_date,
    source_watermark_at: normalized.observed_at,
    source_totals_match: normalized.totals_match,
    source_period_label_mismatch: normalized.period_label_mismatch,
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
        source_mode: "read_only_closing_source",
        external_effects_authorized: false,
      });
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
