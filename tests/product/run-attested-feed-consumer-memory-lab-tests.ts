/**
 * SECURITY LAB ONLY. Signed fictional producer -> pre-consumer feed -> actual
 * EntregasLiveConsumer + adapter + ingest. No DB, real producer or real mode.
 * No part of this verifier is wired into an operational runtime.
 */
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign, verify, type KeyObject } from "node:crypto";
import type { EntregasPublicEvent } from "../../src/entregas/contracts/events/types";
import type { EntregasEventFeed } from "../../src/entregas/contracts/EntregasEventFeed";
import { buildSignalEvent } from "../../src/entregas/integration/public-event-builder";
import { validatePublicEvent } from "../../src/entregas/contracts/events/validate";
import type { OutboxMessage } from "../../src/platform/contracts/messaging";
import type { EscritorTransacional, FatoParaGravar } from "../../src/platform/ingest/ingest-service";
import {
  EntregasLiveConsumer, type ConsumerCheckpointState,
} from "../../src/platform/runtime/entregas-live-consumer";

const DATE = "2026-10-20T03:00:00.000Z";
const NOW = Date.parse(DATE);
const CHANNEL = "LAB_FAKE_SIGNED_PRODUCER_V1";
const LABEL = "LAB_SIGNED_SYNTHETIC_NOT_REAL";
let checks = 0;
function expect(ok: unknown, name: string): void {
  assert.ok(ok, name);
  console.log("ok ATTESTED-CONSUMER-" + (++checks) + " " + name);
}

interface Producer {
  id: string;
  privateKey: KeyObject;
}
interface Policy {
  key: KeyObject;
  unit: string;
  types: ReadonlySet<string>;
  modes: ReadonlySet<string>;
  active: boolean;
  expires: number;
}
interface Claims {
  producer_id: string;
  channel: string;
  issued_at: number;
  nonce: string;
  event: EntregasPublicEvent;
}
interface Signed {
  claims: Claims;
  signature: string;
}
const registry = new Map<string, Policy>();
function producer(id: string, unit: string, modes: string[], types: string[]): Producer {
  const keys = generateKeyPairSync("ed25519");
  registry.set(id, {
    key: keys.publicKey, unit, modes: new Set(modes), types: new Set(types),
    active: true, expires: NOW + 120_000,
  });
  return { id, privateKey: keys.privateKey };
}
function create(producer: Producer, event: EntregasPublicEvent, nonce = randomUUID()): Signed {
  const claims: Claims = {
    producer_id: producer.id, channel: CHANNEL, issued_at: NOW, nonce, event,
  };
  return { claims, signature: sign(null, Buffer.from(JSON.stringify(claims)), producer.privateKey).toString("base64url") };
}
function event(id: string, kind: "trip_created" | "trip_started" | "trip_return_started" | "delivery_ready",
               source_mode: "simulated" | "real" | "control" = "simulated",
               unit_id = "ITAIM"): EntregasPublicEvent {
  return { ...buildSignalEvent({
    event_type: kind, unit_id, source_mode,
    trip_id: "LAB_TRIP_20261020", recorded_at: DATE, occurred_at: DATE,
    idempotency_key: "LAB_KEY_" + id, payload: { lab_only: true },
  }), event_id: id };
}
function verifyAndScope(envelope: Signed): EntregasPublicEvent {
  const c = envelope.claims;
  if (!c || c.channel !== CHANNEL || typeof c.producer_id !== "string" ||
      !Number.isSafeInteger(c.issued_at) || Math.abs(c.issued_at - NOW) > 90_000 ||
      typeof c.nonce !== "string" || !/^[0-9a-f-]{36}$/.test(c.nonce)) {
    throw new Error("LAB_INVALID_CLAIMS");
  }
  const grant = registry.get(c.producer_id);
  if (!grant || !grant.active || grant.expires <= NOW) throw new Error("LAB_PRODUCER_REVOKED");
  if (typeof envelope.signature !== "string" ||
      !verify(null, Buffer.from(JSON.stringify(c)), grant.key, Buffer.from(envelope.signature, "base64url"))) {
    throw new Error("LAB_BAD_SIGNATURE");
  }
  const validated = validatePublicEvent(c.event);
  if (!validated.ok) throw new Error("LAB_INVALID_PUBLIC_EVENT");
  const e = validated.event;
  if (e.unit_id !== grant.unit) throw new Error("LAB_UNIT_DENIED");
  if (!grant.types.has(e.event_type)) throw new Error("LAB_TYPE_DENIED");
  if (!e.source_mode || !grant.modes.has(e.source_mode)) throw new Error("LAB_MODE_DENIED");
  // Fictional signatures CANNOT prove an operational real-world producer.
  if (e.source_mode !== "simulated") throw new Error("LAB_REAL_UNPROVEN");
  return structuredClone(e);
}
class VerifiedFeed implements EntregasEventFeed {
  readonly records: Signed[] = [];
  readonly quarantined = new Map<number, string>();
  readonly audit: Array<{ index: number; reason: string; label: string }> = [];
  private failure: { index: number; reason: string } | null = null;
  polls = 0;

  add(e: Signed): void {
    assert.ok(!this.records.some(x => x.claims.event.event_id === e.claims.event.event_id));
    this.records.push(e);
  }
  quarantine(index: number, reason: string): void {
    if (!this.failure || this.failure.index !== index || this.failure.reason !== reason) {
      throw new Error("LAB_QUARANTINE_REQUIRES_EXPLICIT_FAILED_POLL");
    }
    this.quarantined.set(index, reason);
    this.audit.push({ index, reason, label: LABEL });
    this.failure = null;
  }
  async list(o?: { after_event_id?: string; limit?: number }): Promise<EntregasPublicEvent[]> {
    return (await this.poll(o?.after_event_id ?? null, o?.limit ?? 50)).events;
  }
  async poll(cursor: string | null, limit = 50) {
    this.polls++;
    const pos = cursor === null ? -1 : this.records.findIndex(r => r.claims.event.event_id === cursor);
    if (cursor !== null && pos < 0) throw new Error("LAB_UNKNOWN_CURSOR");
    const accepted: EntregasPublicEvent[] = [];
    let next = cursor;
    for (let i = pos + 1; i < this.records.length && accepted.length < limit; i++) {
      if (this.quarantined.has(i)) continue;
      try {
        const envelope = this.records[i];
        const collision = this.records.findIndex((previous, idx) =>
          idx < i && previous.claims.nonce === envelope.claims.nonce);
        if (collision >= 0) throw new Error("LAB_REPLAY_NONCE");
        const e = verifyAndScope(envelope);
        accepted.push(e);
        next = e.event_id;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "LAB_UNKNOWN";
        this.failure = { index: i, reason };
        this.audit.push({ index: i, reason, label: LABEL });
        // Preflight the whole batch: no valid prefix leaks to consumer.
        throw new Error("LAB_BATCH_BLOCKED:" + reason);
      }
    }
    return { events: accepted, next_cursor: next };
  }
}

const real = producer("LAB_PRODUCER_ITAIM", "ITAIM", ["simulated"], [
  "trip_created", "trip_started", "trip_return_started", "delivery_ready",
]);
const fakeModeReal = producer("LAB_SIGNED_REAL_NOT_WORLD", "ITAIM", ["real"], ["trip_started"]);
const foreign = producer("LAB_PRODUCER_VILA", "VILA-LAB", ["simulated"], ["trip_started"]);
const used = new Map<string, FatoParaGravar>();
const outbox = new Map<string, OutboxMessage>();
const writer: EscritorTransacional = {
  async commit(facts, messages) {
    if (facts.length !== messages.length) return { ok: false, code: "LAB_PAIR_MISMATCH", detail: "" };
    if (facts.some(f => f.source_mode !== "simulated") ||
        messages.some(m => m.payload.source_mode !== "simulated")) {
      return { ok: false, code: "LAB_REAL_REJECTED", detail: "" };
    }
    let count = 0;
    for (let i = 0; i < facts.length; i++) {
      if (used.has(facts[i].idempotency_key)) continue;
      used.set(facts[i].idempotency_key, facts[i]);
      outbox.set(messages[i].idempotency_key, messages[i]);
      count++;
    }
    return { ok: true, facts: count, messages: count };
  },
};
let checkpoint: ConsumerCheckpointState = {
  version: 1, checkpoint: null, isolated_count: 0, updated_at: null,
};
const state = {
  async load() { return structuredClone(checkpoint); },
  async save(next: ConsumerCheckpointState) { checkpoint = structuredClone(next); },
};
const feed = new VerifiedFeed();
let enabled = true;
const consumer = new EntregasLiveConsumer({
  enabled: true, feed, writer, state, now: () => new Date(DATE),
  control: { async canRun() { return enabled; } },
});
function appendRejection(envelope: Signed, reason: string, name: string) {
  const index = feed.records.length;
  feed.add(envelope);
  return async () => {
    const before = used.size;
    const cursor = checkpoint.checkpoint;
    const r = await consumer.tick();
    expect(r.status === "failed" && r.error?.includes("LAB_BATCH_BLOCKED:" + reason), name);
    expect(used.size === before && checkpoint.checkpoint === cursor,
      name + " preserves durable cursor and facts");
    feed.quarantine(index, reason);
  };
}

async function main() {
  feed.add(create(real, event("LAB_C", "trip_created")));
  feed.add(create(real, event("LAB_BAD_MODE", "trip_started", "real")));
  feed.add(create(real, event("LAB_SIGNAL", "delivery_ready")));
  feed.add(create(real, event("LAB_S", "trip_started")));

  enabled = false;
  const stopped = await consumer.tick();
  expect(stopped.status === "killed" && feed.polls === 0, "kill switch prevents even polling");
  enabled = true;
  const first = await consumer.tick();
  expect(first.status === "failed" && first.error?.includes("LAB_MODE_DENIED"),
    "mixed signed valid+invalid batch is blocked before consumer");
  expect(used.size === 0 && outbox.size === 0 && checkpoint.checkpoint === null,
    "valid prefix did not leak into platform facts or advance cursor");
  assert.throws(() => feed.quarantine(0, "LAB_MODE_DENIED"), /LAB_QUARANTINE/);
  expect(true, "arbitrary quarantine is not authorized");
  feed.quarantine(1, "LAB_MODE_DENIED");

  const okBatch = await consumer.tick();
  expect(okBatch.status === "worked" && okBatch.ingested === 2 && okBatch.isolated === 1,
    "actual consumer ingests Trip-created and Trip-started, isolates independent signal");
  expect(used.size === 2 && outbox.size === 2 &&
         [...used.values()].every(f => f.source_mode === "simulated"),
    "actual ingest stores simulated-only fact/outbox pair");
  expect(checkpoint.checkpoint === "LAB_S" &&
         checkpoint.last_isolation?.event_type === "delivery_ready",
    "independent signal is not fabricated as a Trip event");

  const asReal = create(fakeModeReal, event("LAB_REAL", "trip_started", "real"));
  await appendRejection(asReal, "LAB_REAL_UNPROVEN",
    "signed fictional real-mode grant is NOT evidence of real operation")();

  const tampered = create(real, event("LAB_TAMPER", "trip_started"));
  tampered.claims.event.unit_id = "VILA-LAB";
  await appendRejection(tampered, "LAB_BAD_SIGNATURE",
    "tampered signed payload is rejected before consumer")();

  await appendRejection(create(foreign, event("LAB_OTHER_UNIT", "trip_started")),
    "LAB_UNIT_DENIED", "authorized foreign producer cannot write to Itaim")();

  const revoked = producer("LAB_REVOKED", "ITAIM", ["simulated"], ["trip_started"]);
  registry.get(revoked.id)!.active = false;
  await appendRejection(create(revoked, event("LAB_REVOKED_EVENT", "trip_started")),
    "LAB_PRODUCER_REVOKED", "revoked producer is refused")();

  const replayNonce = randomUUID();
  feed.add(create(real, event("LAB_NONCE_1", "trip_started"), replayNonce));
  const verified = await consumer.tick();
  expect(verified.status === "worked" && verified.ingested === 1,
    "fresh authorized nonce may be ingested once");
  await appendRejection(create(real, event("LAB_NONCE_2", "trip_started"), replayNonce),
    "LAB_REPLAY_NONCE", "nonce reuse by a different signed event is rejected")();

  const end = await consumer.tick();
  expect(end.status === "idle" && used.size === 3 && outbox.size === 3,
    "recovery after explicit lab quarantine is idle, without duplicates");
  expect(feed.audit.every(x => x.label === LABEL) && feed.quarantined.size === 6,
    "all rejected envelopes retain synthetic-only audit labels");
  console.log("ATTESTED_FEED_REAL_CONSUMER_LAB: " + checks + "/" + checks +
    " PASS (FAKE SIGNATURES, ACTUAL CONSUMER, NO REAL SOURCE/DB)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
