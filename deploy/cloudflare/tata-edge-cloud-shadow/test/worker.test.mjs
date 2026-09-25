import test from "node:test";
import assert from "node:assert/strict";
import worker, { runOnce } from "../src/worker.mjs";

function closing(overrides = {}) {
  return {
    mailbox_uid: 200,
    business_date: "2026-09-24",
    message_sent_at: "2026-09-25T02:57:22.000Z",
    updated_at: "2026-09-25T03:00:39.554Z",
    readonly_verified: 1,
    totals_match: 1,
    period_label_mismatch: 1,
    ...overrides,
  };
}

function fakeDb(row, calls) {
  return {
    prepare(sql) {
      calls.push(sql);
      if (!/^\s*SELECT\b/i.test(sql)) {
        throw new Error("SOURCE_DB_WRITE_FORBIDDEN");
      }
      return {
        async first() {
          return row;
        },
      };
    },
  };
}

function watchFetch({
  snapshot = { coverage: [] },
  postStatus = 202,
  postBody = {
    accepted: true,
    duplicate: false,
    snapshot: {
      truthClass: "FACT",
      validity: { status: "DEGRADED", globalAllClearAuthorized: false },
      externalEffectsAuthorized: false,
    },
  },
  requests,
}) {
  return async (url, init = {}) => {
    requests.push({ url: String(url), init });

    if (init.method === "GET") {
      return new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (init.method === "POST") {
      return new Response(JSON.stringify(postBody), {
        status: postStatus,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error("UNEXPECTED_FETCH");
  };
}

test("runOnce performs SELECT-only source read and sends minimized FACT handoff", async () => {
  const dbCalls = [];
  const requests = [];
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = watchFetch({ requests });

    const result = await runOnce({
      SOURCE_DB: fakeDb(closing(), dbCalls),
      WATCH_BASE_URL: "https://watch.example",
      WATCH_BRIDGE_TOKEN: "secret",
    }, "2026-09-25T17:00:00.000Z");

    assert.equal(result.status, "sent");
    assert.equal(result.source_business_date, "2026-09-24");
    assert.equal(result.source_watermark_at, "2026-09-25T02:57:22.000Z");
    assert.equal(result.source_ingested_at, "2026-09-25T03:00:39.554Z");
    assert.equal(result.watch.truth_class, "FACT");
    assert.equal(result.watch.validity_status, "DEGRADED");
    assert.equal(result.watch.global_all_clear_authorized, false);
    assert.equal(result.external_effects_authorized, false);

    assert.equal(dbCalls.length, 1);
    assert.match(dbCalls[0], /^\s*SELECT\b/i);
    assert.match(dbCalls[0], /ORDER BY business_date DESC, message_sent_at DESC/i);
    assert.equal(/\b(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(dbCalls[0]), false);

    assert.equal(requests.length, 2);
    assert.equal(requests[0].init.method, "GET");
    assert.equal(requests[1].init.method, "POST");

    const handoff = JSON.parse(requests[1].init.body);
    assert.equal(handoff.source_mode, "live_observed");
    assert.equal(handoff.fact_class, "FACT");
    assert.equal(handoff.source_coverage[0].source, "tata_daily_closing");
    assert.equal(handoff.global_coverage_claim, "NOT_PROVIDED");
    assert.equal(handoff.external_effect_authorized, false);

    const serialized = requests[1].init.body;
    assert.equal(serialized.includes("report_gross_total"), false);
    assert.equal(serialized.includes("ifood_value_total"), false);
    assert.equal(serialized.includes("discounts_value_total"), false);
    assert.equal(serialized.includes("mailbox_uid"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("same source watermark is skipped without POST", async () => {
  const dbCalls = [];
  const requests = [];
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = watchFetch({
      requests,
      snapshot: {
        coverage: [{
          source: "tata_daily_closing",
          last_observed_at: "2026-09-25T02:57:22.000Z",
        }],
      },
    });

    const result = await runOnce({
      SOURCE_DB: fakeDb(closing(), dbCalls),
      WATCH_BASE_URL: "https://watch.example",
      WATCH_BRIDGE_TOKEN: "secret",
    }, "2026-09-25T17:00:00.000Z");

    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "source_already_observed");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].init.method, "GET");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing verified closing fails quiet without Watch write", async () => {
  const dbCalls = [];
  const requests = [];
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = watchFetch({ requests });

    const result = await runOnce({
      SOURCE_DB: fakeDb(null, dbCalls),
      WATCH_BASE_URL: "https://watch.example",
      WATCH_BRIDGE_TOKEN: "secret",
    });

    assert.equal(result.status, "skipped");
    assert.equal(result.reason, "no_verified_closing");
    assert.equal(requests.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Watch rejection fails closed", async () => {
  const dbCalls = [];
  const requests = [];
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = watchFetch({
      requests,
      postStatus: 409,
      postBody: { accepted: false, error: "handoff_conflict" },
    });

    await assert.rejects(
      runOnce({
        SOURCE_DB: fakeDb(closing(), dbCalls),
        WATCH_BASE_URL: "https://watch.example",
        WATCH_BRIDGE_TOKEN: "secret",
      }, "2026-09-25T17:00:00.000Z"),
      /watch_handoff_rejected/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("manual /run requires its own admin secret", async () => {
  const env = {
    EDGE_PRODUCER_ADMIN_TOKEN: "admin-secret",
    SOURCE_DB: fakeDb(null, []),
    WATCH_BASE_URL: "https://watch.example",
    WATCH_BRIDGE_TOKEN: "watch-secret",
  };

  const denied = await worker.fetch(
    new Request("https://edge.example/run", { method: "POST" }),
    env,
  );
  assert.equal(denied.status, 401);

  const allowed = await worker.fetch(
    new Request("https://edge.example/run", {
      method: "POST",
      headers: { authorization: "Bearer admin-secret" },
    }),
    env,
  );
  assert.equal(allowed.status, 200);
  const body = await allowed.json();
  assert.equal(body.status, "skipped");
  assert.equal(body.external_effects_authorized, false);
});

test("health is non-sensitive and public", async () => {
  const response = await worker.fetch(
    new Request("https://edge.example/health"),
    {},
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.runtime, "tata-edge-cloud-shadow@0.1.0");
  assert.equal(body.source_mode, "read_only_closing_source");
  assert.equal(body.external_effects_authorized, false);
});


test("service binding is preferred over public workers.dev fetch", async () => {
  const dbCalls = [];
  const serviceRequests = [];
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => {
      throw new Error("PUBLIC_FETCH_MUST_NOT_BE_USED");
    };

    const watchService = {
      async fetch(request) {
        const body = request.method === "POST"
          ? await request.text()
          : null;
        serviceRequests.push({
          url: request.url,
          method: request.method,
          body,
        });

        if (request.method === "GET") {
          return new Response(JSON.stringify({ coverage: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        if (request.method === "POST") {
          return new Response(JSON.stringify({
            accepted: true,
            duplicate: false,
            snapshot: {
              truthClass: "FACT",
              validity: {
                status: "DEGRADED",
                globalAllClearAuthorized: false,
              },
              externalEffectsAuthorized: false,
            },
          }), {
            status: 202,
            headers: { "content-type": "application/json" },
          });
        }

        throw new Error("UNEXPECTED_SERVICE_METHOD");
      },
    };

    const result = await runOnce({
      SOURCE_DB: fakeDb(closing(), dbCalls),
      WATCH_SERVICE: watchService,
      WATCH_BASE_URL: "https://public-fallback-must-not-run.example",
      WATCH_BRIDGE_TOKEN: "secret",
    }, "2026-09-25T17:00:00.000Z");

    assert.equal(result.status, "sent");
    assert.equal(serviceRequests.length, 2);
    assert.equal(serviceRequests[0].url, "https://watch.internal/snapshot");
    assert.equal(
      serviceRequests[1].url,
      "https://watch.internal/sources/tata-edge/handoff",
    );

    const handoff = JSON.parse(serviceRequests[1].body);
    assert.equal(handoff.fact_class, "FACT");
    assert.equal(handoff.external_effect_authorized, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
