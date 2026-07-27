"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TARGET = process.env.DELIVERYOS_AUDIT_TARGET_ROOT;
if (!TARGET) throw new Error("DELIVERYOS_AUDIT_TARGET_ROOT obrigatorio");

function fromTarget(relativePath) {
  return require(path.join(TARGET, relativePath));
}

const Grouping = fromTarget("src/conference-brain/live/grouping");
const PiiGuard = fromTarget("src/conference-brain/live/pii-guard");
const Multidimensional = fromTarget("src/conference-brain/live/multidimensional-observation");
const Clock = fromTarget("src/conference-brain/live/clock");
const Panel = fromTarget("tools/conference-brain/operator-panel-server");
const { createStore } = fromTarget("src/conference-brain/storage/store");

test("PRESENCE.CONFLICT sobrevive ao store e o painel nao afirma agrupamento", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s24-conflict-smoke-"));
  const orderId = "SMOKE-CONFLICT-1";
  const piiMarkers = ["Joao Silva", "11999999999"];
  try {
    const observedAt = "2026-07-24T12:00:00Z";
    const dimensions = [
      PiiGuard.sanitizeOrderObservation(Multidimensional.buildOrderObservation({
        externalId: orderId,
        observedAt,
        orderStateText: "Pronto",
        customerNote: piiMarkers.join(" "),
        grouping: {
          observed: true,
          groupId: "SMOKE-GROUP",
          memberOrderIds: [orderId, "SMOKE-CONFLICT-2"]
        }
      })),
      PiiGuard.sanitizeOrderObservation(Multidimensional.buildOrderObservation({
        externalId: orderId,
        observedAt,
        orderStateText: "Pronto",
        grouping: { observed: true, memberOrderIds: [] }
      }))
    ];

    const writer = createStore({ dir });
    for (const [index, dimension] of dimensions.entries()) {
      const result = writer.put("live_observations", {
        run_id: "smoke", cycle_id: `c${index + 1}`, external_id: orderId,
        observed_at: observedAt, raw_status: "Pronto", source_health: "available",
        confidence: "alta", status: "ready", dimensions: dimension
      });
      assert.equal(result.ok, true, JSON.stringify(result.errors));
    }
    const event = Clock.recordEvent({
      order_id: orderId, event_type: "ready_observed", observed_at: observedAt,
      origin: "ifood_screen", raw_status: "Pronto", existing_events: []
    });
    assert.equal(writer.put("conference_clock_events", event.event).ok, true);

    const restored = createStore({ dir });
    assert.equal(restored.load("live_observations"), 2);
    assert.equal(restored.load("conference_clock_events"), 1);

    const dimension = Panel.reconciledDimensionFor(restored, orderId);
    assert.equal(dimension.grouping.presence, Grouping.PRESENCE.CONFLICT);
    assert.equal(dimension.grouping.group_id, null);
    assert.deepEqual(dimension.grouping.member_order_ids, []);

    const rows = Panel.ordersInPlay(restored);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].grouped, false);
    const html = Panel.renderPage(rows);
    assert.equal(html.includes("agrupado"), false);
    for (const marker of piiMarkers) assert.equal(html.includes(marker), false, marker);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
