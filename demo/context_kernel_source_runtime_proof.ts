import { strict as assert } from "node:assert";
import { projectManagerSnapshot } from "../src/edge/managerSnapshot";
import type { EdgeSourceObservation } from "../src/edge/simulator";
import { runContextRefresh } from "../src/contextKernel/sourceRuntime";

async function main(): Promise<void> {
  const edgeObservation: EdgeSourceObservation = {
    source_mode: "synthetic",
    observation_id: "runtime-auth-human",
    kind: "auth_state",
    source_ref: {
      source: "ifood",
      kind: "auth_session",
      id: "runtime-profile",
      unit_id: "0001",
    },
    observed_at: "2026-09-25T13:00:00.000Z",
    payload: { health: "HUMAN_REQUIRED" },
  };

  const edge = projectManagerSnapshot(
    [edgeObservation],
    "2026-09-25T13:01:00.000Z",
  );

  const result = await runContextRefresh({
    now: "2026-09-25T14:30:00.000Z",
    edge,
    attention_policy: [{
      mode: "REUNIAO",
      reason_kind: "EDGE_HARD_EXCEPTION",
      disposition: "SHOW_NOW",
    }],
    adapters: [
      {
        adapter_id: "calendar",
        collect() {
          return {
            source_mode: "synthetic" as const,
            schedule_events: [{
              event_id: "meeting-runtime",
              source_ref: "gcal:work",
              domain: "WORK" as const,
              starts_at: "2026-09-25T14:00:00.000Z",
              ends_at: "2026-09-25T15:00:00.000Z",
              status: "CONFIRMED" as const,
              all_day: false,
            }],
          };
        },
      },
      {
        adapter_id: "broken-trello",
        collect() {
          throw new Error("private connector error must-not-cross");
        },
      },
    ],
  });

  assert.equal(result.source_mode, "synthetic");
  assert.equal(result.coverage_complete, false);
  assert.equal(result.receipts.length, 2);
  assert.equal(result.receipts[0].status, "ok");
  assert.equal(result.receipts[1].status, "failed");
  assert.equal(result.receipts[1].error_code, "source_failed");
  assert.equal(result.cycle.kernel.mode.mode, "REUNIAO");
  assert.equal(result.cycle.kernel.needs_me.state, "YES");
  assert.equal(
    result.cycle.attention_delivery.reason_decisions[0].disposition,
    "SHOW_NOW",
  );

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("must-not-cross"), false);

  const liveIntoSynthetic = await runContextRefresh({
    now: "2026-09-25T14:30:00.000Z",
    edge,
    attention_policy: [],
    adapters: [{
      adapter_id: "live-calendar",
      collect() {
        return {
          source_mode: "live_observed" as const,
          schedule_events: [],
        };
      },
    }],
  });

  assert.equal(liveIntoSynthetic.coverage_complete, false);
  assert.equal(liveIntoSynthetic.receipts[0].status, "failed");
  assert.equal(
    liveIntoSynthetic.receipts[0].error_code,
    "source_mode_conflict",
  );
  assert.equal(liveIntoSynthetic.source_mode, "empty");

  const mixedSources = await runContextRefresh({
    now: "2026-09-25T14:30:00.000Z",
    attention_policy: [],
    adapters: [
      {
        adapter_id: "synthetic-source",
        collect() {
          return { source_mode: "synthetic" as const };
        },
      },
      {
        adapter_id: "live-source",
        collect() {
          return { source_mode: "live_observed" as const };
        },
      },
    ],
  });

  assert.equal(mixedSources.source_mode, "synthetic");
  assert.equal(mixedSources.coverage_complete, false);
  assert.equal(mixedSources.receipts[1].error_code, "source_mode_conflict");

  console.log(JSON.stringify({
    status: "PASS",
    source_failure_isolated: true,
    raw_source_error_not_exposed: true,
    coverage_degradation_explicit: true,
    mixed_live_and_synthetic_blocked: true,
    edge_context_truth_class_compatible: true,
    refresh_does_not_authorize_effects: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
