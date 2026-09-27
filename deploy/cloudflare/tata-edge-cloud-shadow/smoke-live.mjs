function envRequired(name) {
  const value = process.env[name];
  if (!value) throw new Error(`MISSING_ENV_${name}`);
  return value;
}

async function readJson(response, label) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}`);
  }
  return body;
}

function assertSafeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("WATCH_SNAPSHOT_INVALID");
  }
  if (snapshot.validity?.globalAllClearAuthorized !== false) {
    throw new Error("WATCH_GLOBAL_ALL_CLEAR_MUST_BE_FALSE");
  }
  if (snapshot.externalEffectsAuthorized !== false) {
    throw new Error("WATCH_EXTERNAL_EFFECTS_MUST_BE_FALSE");
  }
}

async function main() {
  const producerUrl = envRequired("EDGE_PRODUCER_URL").replace(/\/$/, "");
  const producerToken = envRequired("EDGE_PRODUCER_ADMIN_TOKEN");
  const watchUrl = envRequired("WATCH_URL").replace(/\/$/, "");
  const watchToken = envRequired("WATCH_BRIDGE_TOKEN");

  const health = await readJson(
    await fetch(`${producerUrl}/health`),
    "PRODUCER_HEALTH",
  );

  if (
    health.runtime !== "tata-edge-cloud-shadow@0.1.0" ||
    health.external_effects_authorized !== false
  ) {
    throw new Error("PRODUCER_HEALTH_CONTRACT_MISMATCH");
  }

  const run = await readJson(
    await fetch(`${producerUrl}/run`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${producerToken}`,
      },
    }),
    "PRODUCER_RUN",
  );

  const snapshot = await readJson(
    await fetch(`${watchUrl}/snapshot`, {
      headers: {
        authorization: `Bearer ${watchToken}`,
      },
    }),
    "WATCH_SNAPSHOT",
  );

  assertSafeSnapshot(snapshot);

  const closingCoverage = Array.isArray(snapshot.coverage)
    ? snapshot.coverage.find(
        (item) => item?.source === "tata_daily_closing",
      )
    : undefined;

  if (run.status === "sent") {
    if (snapshot.truthClass !== "FACT") {
      throw new Error("LIVE_CLOSING_DID_NOT_REMAIN_FACT");
    }
    if (snapshot.validity?.status !== "DEGRADED") {
      throw new Error("LIVE_CLOSING_VALIDITY_UNEXPECTED");
    }
    if (!closingCoverage) {
      throw new Error("LIVE_CLOSING_COVERAGE_MISSING");
    }
  } else if (
    run.status === "skipped" &&
    run.reason === "source_already_observed"
  ) {
    if (!closingCoverage) {
      throw new Error("REPLAY_SKIP_WITHOUT_EXISTING_COVERAGE");
    }
  } else if (
    run.status === "skipped" &&
    run.reason === "no_verified_closing"
  ) {
    // Safe no-source state. Do not manufacture FACT.
  } else {
    throw new Error("UNEXPECTED_PRODUCER_RESULT");
  }

  console.log(JSON.stringify({
    status: "PASS",
    producer_status: run.status,
    producer_reason: run.reason ?? null,
    source_business_date: run.source_business_date ?? null,
    source_watermark_at: run.source_watermark_at ?? null,
    watch_truth_class: snapshot.truthClass,
    watch_validity: snapshot.validity?.status,
    global_all_clear_authorized:
      snapshot.validity?.globalAllClearAuthorized,
    watch_external_effects_authorized:
      snapshot.externalEffectsAuthorized,
    closing_coverage_present: Boolean(closingCoverage),
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: "FAIL",
    error: error instanceof Error ? error.message : "UNKNOWN",
  }));
  process.exit(1);
});
