import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import type { DomainEvent, Handoff } from "../foundation/types";
import type { OutboxRecord } from "../integration/outbox";
import type { Occurrence } from "../operational/occurrence";
import type { RiderOperationalState } from "../operational/rider-state";
import { openFileUnitOfWork } from "../persistence/file-store";
import type { TripRecord } from "../persistence/ports";
import type {
  SqlRow,
  TransactionalSqlClient,
} from "../../platform/persistence/sql-client";
import {
  FilePilotReadyOrderStore,
  type PilotReadyOrder,
} from "./ready-orders";

export interface PilotStorageSnapshot {
  unit_id: string;
  trips: TripRecord[];
  handoffs: Array<{ handoff: Handoff; version: number }>;
  occurrences: Occurrence[];
  riders: RiderOperationalState[];
  events: DomainEvent[];
  outbox: OutboxRecord[];
  ready_orders: PilotReadyOrder[];
}

export interface PilotStorageCounts {
  trips: number;
  deliveries: number;
  handoffs: number;
  occurrences: number;
  riders: number;
  events: number;
  outbox: number;
  ready_orders: number;
}

export interface PilotStorageCutoverPlan {
  unit_id: string;
  source_fingerprint: string;
  source_counts: PilotStorageCounts;
  target_counts: PilotStorageCounts;
  conflicts: string[];
  can_apply: boolean;
}

export interface PilotStorageCutoverResult {
  unit_id: string;
  source_fingerprint: string;
  imported_counts: PilotStorageCounts;
  target_fingerprint: string;
}

export class PilotStorageCutoverError extends Error {
  constructor(
    readonly code:
      | "SOURCE_INVALID"
      | "SOURCE_CHANGED"
      | "TARGET_NOT_EMPTY"
      | "TARGET_NOT_READY"
      | "GLOBAL_COLLISION"
      | "VERIFY_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "PilotStorageCutoverError";
  }
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = stable(v);
    }
    return out;
  }
  return value;
}

function fingerprint(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stable(value)), "utf8")
    .digest("hex");
}

function sortSnapshot(s: PilotStorageSnapshot): PilotStorageSnapshot {
  return {
    ...s,
    trips: [...s.trips]
      .map((x) => ({
        ...x,
        deliveries: [...x.deliveries].sort((a, b) =>
          a.delivery_id.localeCompare(b.delivery_id),
        ),
      }))
      .sort((a, b) => a.trip.trip_id.localeCompare(b.trip.trip_id)),
    handoffs: [...s.handoffs].sort((a, b) =>
      a.handoff.handoff_id.localeCompare(b.handoff.handoff_id),
    ),
    occurrences: [...s.occurrences].sort((a, b) =>
      a.occurrence_id.localeCompare(b.occurrence_id),
    ),
    riders: [...s.riders].sort((a, b) =>
      String(a.rider_id).localeCompare(String(b.rider_id)),
    ),
    ready_orders: [...s.ready_orders].sort((a, b) =>
      a.order_ref.localeCompare(b.order_ref),
    ),
    // event/outbox order is semantically relevant to replay/feed.
    events: [...s.events],
    outbox: [...s.outbox],
  };
}

export function snapshotFingerprint(snapshot: PilotStorageSnapshot): string {
  return fingerprint(sortSnapshot(snapshot));
}

export function snapshotCounts(snapshot: PilotStorageSnapshot): PilotStorageCounts {
  return {
    trips: snapshot.trips.length,
    deliveries: snapshot.trips.reduce(
      (sum, x) => sum + x.deliveries.length,
      0,
    ),
    handoffs: snapshot.handoffs.length,
    occurrences: snapshot.occurrences.length,
    riders: snapshot.riders.length,
    events: snapshot.events.length,
    outbox: snapshot.outbox.length,
    ready_orders: snapshot.ready_orders.length,
  };
}

function fileHash(path: string): string {
  if (!existsSync(path)) return "ABSENT";
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertUnique(
  label: string,
  values: readonly string[],
  conflicts: string[],
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) conflicts.push(`${label} duplicado: ${value}`);
    seen.add(value);
  }
}

export function validatePilotStorageSnapshot(
  snapshot: PilotStorageSnapshot,
): string[] {
  const conflicts: string[] = [];
  const unit = snapshot.unit_id;

  assertUnique(
    "trip_id",
    snapshot.trips.map((x) => x.trip.trip_id),
    conflicts,
  );
  assertUnique(
    "delivery_id",
    snapshot.trips.flatMap((x) => x.deliveries.map((d) => d.delivery_id)),
    conflicts,
  );
  assertUnique(
    "handoff_id",
    snapshot.handoffs.map((x) => x.handoff.handoff_id),
    conflicts,
  );
  assertUnique(
    "occurrence_id",
    snapshot.occurrences.map((x) => x.occurrence_id),
    conflicts,
  );
  assertUnique(
    "rider_id",
    snapshot.riders.map((x) => String(x.rider_id)),
    conflicts,
  );
  assertUnique(
    "event_id",
    snapshot.events.map((x) => x.event_id),
    conflicts,
  );
  assertUnique(
    "event idempotency_key",
    snapshot.events.map((x) => x.idempotency_key),
    conflicts,
  );
  assertUnique(
    "outbox_id",
    snapshot.outbox.map((x) => x.outbox_id),
    conflicts,
  );
  assertUnique(
    "outbox event_id",
    snapshot.outbox.map((x) => x.event.event_id),
    conflicts,
  );
  assertUnique(
    "outbox idempotency_key",
    snapshot.outbox.map((x) => x.event.idempotency_key),
    conflicts,
  );
  assertUnique(
    "ready order_ref",
    snapshot.ready_orders.map((x) => x.order_ref),
    conflicts,
  );

  const deliveryOrders = new Set<string>();
  for (const rec of snapshot.trips) {
    if (rec.trip.unit_id !== unit) {
      conflicts.push(
        `trip ${rec.trip.trip_id} pertence a ${rec.trip.unit_id}, esperado ${unit}`,
      );
    }
    if (!Number.isInteger(rec.version) || rec.version < 1) {
      conflicts.push(
        `trip ${rec.trip.trip_id} tem version inválida: ${rec.version}`,
      );
    }
    const actualIds = [...rec.deliveries.map((d) => d.delivery_id)].sort();
    const declaredIds = [...rec.trip.delivery_ids].sort();
    if (JSON.stringify(actualIds) !== JSON.stringify(declaredIds)) {
      conflicts.push(
        `trip ${rec.trip.trip_id}: delivery_ids divergem das deliveries persistidas`,
      );
    }
    for (const d of rec.deliveries) {
      if (d.trip_id !== rec.trip.trip_id) {
        conflicts.push(
          `delivery ${d.delivery_id} aponta para ${d.trip_id}, esperado ${rec.trip.trip_id}`,
        );
      }
      deliveryOrders.add(d.order_ref);
    }
  }

  for (const rec of snapshot.handoffs) {
    if (rec.handoff.unit_id !== unit) {
      conflicts.push(
        `handoff ${rec.handoff.handoff_id} pertence a outra unidade`,
      );
    }
    if (!Number.isInteger(rec.version) || rec.version < 1) {
      conflicts.push(
        `handoff ${rec.handoff.handoff_id} tem version inválida: ${rec.version}`,
      );
    }
  }

  for (const occ of snapshot.occurrences) {
    if (occ.unit_id !== unit) {
      conflicts.push(`occurrence ${occ.occurrence_id} pertence a outra unidade`);
    }
    if (!Number.isInteger(occ.version) || occ.version < 1) {
      conflicts.push(
        `occurrence ${occ.occurrence_id} tem version inválida: ${occ.version}`,
      );
    }
  }

  for (const rider of snapshot.riders) {
    if (rider.unit_id !== unit) {
      conflicts.push(`rider ${String(rider.rider_id)} pertence a outra unidade`);
    }
    if (!Number.isInteger(rider.version) || rider.version < 1) {
      conflicts.push(
        `rider ${String(rider.rider_id)} tem version inválida: ${rider.version}`,
      );
    }
  }

  for (const rec of snapshot.outbox) {
    if (rec.event.unit_id !== unit) {
      conflicts.push(
        `outbox ${rec.outbox_id} pertence a ${rec.event.unit_id}, esperado ${unit}`,
      );
    }
  }

  for (const ready of snapshot.ready_orders) {
    if (deliveryOrders.has(ready.order_ref)) {
      conflicts.push(
        `ready_order ${ready.order_ref} já existe em delivery; fonte pode ter parado entre commit da viagem e remoção da fila`,
      );
    }
  }

  return conflicts;
}

export async function readFilePilotStorageSnapshot(args: {
  unit_id: string;
  data_file: string;
  ready_file: string;
}): Promise<PilotStorageSnapshot> {
  const beforeData = fileHash(args.data_file);
  const beforeReady = fileHash(args.ready_file);

  const uow = openFileUnitOfWork(args.data_file);
  const ready = new FilePilotReadyOrderStore(args.ready_file);
  const [
    trips,
    handoffs,
    occurrences,
    riders,
    events,
    outbox,
    readyOrders,
  ] = await Promise.all([
    uow.trips.list(),
    uow.handoffs.list(),
    uow.occurrences.list(),
    uow.riders.list(),
    uow.events.listAll(),
    uow.outbox.all(),
    ready.list(),
  ]);

  const afterData = fileHash(args.data_file);
  const afterReady = fileHash(args.ready_file);
  if (beforeData !== afterData || beforeReady !== afterReady) {
    throw new PilotStorageCutoverError(
      "SOURCE_CHANGED",
      "arquivos de origem mudaram durante a leitura; pare o servidor de arquivo e tente novamente",
    );
  }

  const snapshot = sortSnapshot({
    unit_id: args.unit_id,
    trips,
    handoffs,
    occurrences,
    riders,
    events,
    outbox,
    ready_orders: readyOrders,
  });
  const conflicts = validatePilotStorageSnapshot(snapshot);
  if (conflicts.length) {
    throw new PilotStorageCutoverError(
      "SOURCE_INVALID",
      conflicts.join("; "),
    );
  }
  return snapshot;
}

async function assertTargetReady(
  sql: TransactionalSqlClient,
  unitId: string,
): Promise<void> {
  const migrations = await sql.query<{ version: string }>(
    `SELECT version FROM platform.schema_migration
      WHERE version = ANY($1::text[])`,
    [[
      "0006_entregas_cluster_persistence",
      "0007_entregas_ready_order",
      "0008_ready_order_consumido_por_delivery",
    ]],
  );
  const have = new Set(migrations.map((x) => String(x.version)));
  for (const required of [
    "0006_entregas_cluster_persistence",
    "0007_entregas_ready_order",
    "0008_ready_order_consumido_por_delivery",
  ]) {
    if (!have.has(required)) {
      throw new PilotStorageCutoverError(
        "TARGET_NOT_READY",
        `migration obrigatória ausente: ${required}`,
      );
    }
  }
  const unit = await sql.query<{ unit_id: string; active: boolean }>(
    `SELECT unit_id, active FROM identity.unit WHERE unit_id=$1`,
    [unitId],
  );
  if (unit.length !== 1 || !unit[0].active) {
    throw new PilotStorageCutoverError(
      "TARGET_NOT_READY",
      `unidade ausente ou inativa no destino: ${unitId}`,
    );
  }
}

export async function targetCounts(
  sql: TransactionalSqlClient,
  unitId: string,
): Promise<PilotStorageCounts> {
  const rows = await sql.query<SqlRow>(
    `SELECT
      (SELECT count(*)::int FROM entregas.trip WHERE unit_id=$1) AS trips,
      (SELECT count(*)::int FROM entregas.delivery d
         JOIN entregas.trip t ON t.trip_id=d.trip_id WHERE t.unit_id=$1) AS deliveries,
      (SELECT count(*)::int FROM entregas.handoff WHERE unit_id=$1) AS handoffs,
      (SELECT count(*)::int FROM entregas.occurrence WHERE unit_id=$1) AS occurrences,
      (SELECT count(*)::int FROM entregas.rider_state WHERE unit_id=$1) AS riders,
      (SELECT count(*)::int FROM entregas.domain_event WHERE unit_id=$1) AS events,
      (SELECT count(*)::int FROM entregas.public_outbox WHERE unit_id=$1) AS outbox,
      (SELECT count(*)::int FROM entregas.ready_order WHERE unit_id=$1) AS ready_orders`,
    [unitId],
  );
  const r = rows[0];
  return {
    trips: Number(r.trips),
    deliveries: Number(r.deliveries),
    handoffs: Number(r.handoffs),
    occurrences: Number(r.occurrences),
    riders: Number(r.riders),
    events: Number(r.events),
    outbox: Number(r.outbox),
    ready_orders: Number(r.ready_orders),
  };
}

function countTotal(c: PilotStorageCounts): number {
  return Object.values(c).reduce((a, b) => a + b, 0);
}

async function globalCollisions(
  sql: TransactionalSqlClient,
  snapshot: PilotStorageSnapshot,
): Promise<string[]> {
  const conflicts: string[] = [];
  const probes: Array<[string, string, string[]]> = [
    ["trip_id", "entregas.trip", snapshot.trips.map((x) => x.trip.trip_id)],
    [
      "delivery_id",
      "entregas.delivery",
      snapshot.trips.flatMap((x) => x.deliveries.map((d) => d.delivery_id)),
    ],
    [
      "handoff_id",
      "entregas.handoff",
      snapshot.handoffs.map((x) => x.handoff.handoff_id),
    ],
    [
      "occurrence_id",
      "entregas.occurrence",
      snapshot.occurrences.map((x) => x.occurrence_id),
    ],
    [
      "rider_id",
      "entregas.rider_state",
      snapshot.riders.map((x) => String(x.rider_id)),
    ],
    [
      "event_id",
      "entregas.domain_event",
      snapshot.events.map((x) => x.event_id),
    ],
    [
      "outbox_id",
      "entregas.public_outbox",
      snapshot.outbox.map((x) => x.outbox_id),
    ],
  ];
  for (const [column, table, values] of probes) {
    if (!values.length) continue;
    const rows = await sql.query<{ id: string }>(
      `SELECT ${column}::text AS id FROM ${table}
        WHERE ${column} = ANY($1::text[]) LIMIT 20`,
      [values],
    );
    for (const row of rows) conflicts.push(`${table}.${column} já existe: ${row.id}`);
  }

  if (snapshot.events.length) {
    const keys = snapshot.events.map((x) => x.idempotency_key);
    const rows = await sql.query<{ key: string }>(
      `SELECT idempotency_key AS key FROM entregas.domain_event
        WHERE idempotency_key = ANY($1::text[]) LIMIT 20`,
      [keys],
    );
    for (const row of rows) {
      conflicts.push(
        `entregas.domain_event.idempotency_key já existe: ${row.key}`,
      );
    }
  }

  if (snapshot.outbox.length) {
    const eventIds = snapshot.outbox.map((x) => x.event.event_id);
    const keys = snapshot.outbox.map((x) => x.event.idempotency_key);
    const rows = await sql.query<{ event_id: string; idempotency_key: string }>(
      `SELECT event_id, idempotency_key FROM entregas.public_outbox
        WHERE event_id = ANY($1::text[])
           OR idempotency_key = ANY($2::text[])
        LIMIT 20`,
      [eventIds, keys],
    );
    for (const row of rows) {
      conflicts.push(
        `entregas.public_outbox collision event=${row.event_id} key=${row.idempotency_key}`,
      );
    }
  }
  return conflicts;
}

export async function planFileToPostgresCutover(args: {
  sql: TransactionalSqlClient;
  snapshot: PilotStorageSnapshot;
}): Promise<PilotStorageCutoverPlan> {
  const sourceConflicts = validatePilotStorageSnapshot(args.snapshot);
  if (sourceConflicts.length) {
    return {
      unit_id: args.snapshot.unit_id,
      source_fingerprint: snapshotFingerprint(args.snapshot),
      source_counts: snapshotCounts(args.snapshot),
      target_counts: {
        trips: 0,
        deliveries: 0,
        handoffs: 0,
        occurrences: 0,
        riders: 0,
        events: 0,
        outbox: 0,
        ready_orders: 0,
      },
      conflicts: sourceConflicts,
      can_apply: false,
    };
  }
  await assertTargetReady(args.sql, args.snapshot.unit_id);
  const target = await targetCounts(args.sql, args.snapshot.unit_id);
  const conflicts: string[] = [];
  if (countTotal(target) !== 0) {
    conflicts.push(
      `destino da unidade ${args.snapshot.unit_id} não está vazio: ${JSON.stringify(target)}`,
    );
  }
  conflicts.push(...(await globalCollisions(args.sql, args.snapshot)));
  return {
    unit_id: args.snapshot.unit_id,
    source_fingerprint: snapshotFingerprint(args.snapshot),
    source_counts: snapshotCounts(args.snapshot),
    target_counts: target,
    conflicts,
    can_apply: conflicts.length === 0,
  };
}

async function insertSnapshot(
  tx: TransactionalSqlClient,
  s: PilotStorageSnapshot,
): Promise<void> {
  for (const rec of s.trips) {
    const t = rec.trip;
    await tx.query(
      `INSERT INTO entregas.trip
        (trip_id,unit_id,courier_actor_id,state,created_by,created_at,
         started_at,closed_at,contract_version,policy_bundle_id,version,
         delivery_ids,close_mode,last_event_id,return_evidence,
         manual_close_reason,manual_close_actor,state_before_signal_loss)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15::jsonb,$16,$17,$18)`,
      [
        t.trip_id,
        t.unit_id,
        String(t.courier_actor_id),
        t.state,
        t.created_by,
        t.created_at,
        t.started_at ?? null,
        t.closed_at ?? null,
        t.contract_version,
        t.policy_bundle_id,
        rec.version,
        JSON.stringify(t.delivery_ids),
        t.close_mode ?? null,
        t.last_event_id,
        t.return_evidence ? JSON.stringify(t.return_evidence) : null,
        t.manual_close_reason ?? null,
        t.manual_close_actor ?? null,
        t.state_before_signal_loss ?? null,
      ],
    );
    for (const d of rec.deliveries) {
      await tx.query(
        `INSERT INTO entregas.delivery
          (delivery_id,trip_id,order_ref,channel,planned_stop_order,
           actual_stop_order,state,arrival_detected_at,arrival_reported_at,
           confirmed_at,unconfirmed_at,active,unconfirmed_trigger,
           occurrence_id,cancelled_reason,removed_at,removed_reason,removed_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          d.delivery_id,
          d.trip_id,
          d.order_ref,
          d.channel,
          d.planned_stop_order,
          d.actual_stop_order ?? null,
          d.state,
          d.arrival_detected_at ?? null,
          d.arrival_reported_at ?? null,
          d.confirmed_at ?? null,
          d.unconfirmed_at ?? null,
          d.active,
          d.unconfirmed_trigger ?? null,
          d.occurrence_id ?? null,
          d.cancelled_reason ?? null,
          d.removed_at ?? null,
          d.removed_reason ?? null,
          d.removed_by ?? null,
        ],
      );
    }
  }

  for (const rec of s.handoffs) {
    const h = rec.handoff;
    await tx.query(
      `INSERT INTO entregas.handoff
        (handoff_id,unit_id,external_order_ref,external_courier_ref,state,
         arrived_at,conference_actor,handoff_actor,volumes,integrity_ok,
         courier_verified,courier_verification_method,handoff_at,confirmed,
         exception,contract_version,version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        h.handoff_id,
        h.unit_id,
        h.external_order_ref,
        h.external_courier_ref ?? null,
        h.state,
        h.arrived_at ?? null,
        h.conference_actor ?? null,
        h.handoff_actor ?? null,
        h.volumes ? JSON.stringify(h.volumes) : null,
        h.integrity_ok ?? null,
        h.courier_verified,
        h.courier_verification_method ?? null,
        h.handoff_at ?? null,
        h.confirmed,
        h.exception ?? null,
        h.contract_version,
        rec.version,
      ],
    );
  }

  for (const o of s.occurrences) {
    await tx.query(
      `INSERT INTO entregas.occurrence
        (occurrence_id,unit_id,trip_id,delivery_id,kind,state,opened_at,
         closed_at,opened_by,source_channel,report,hypothesis,promised_action,
         executed_action,evidence,owner_role,confirmation,blocks_availability,
         closed_by,contract_version,version,detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'{}'::jsonb)`,
      [
        o.occurrence_id,
        o.unit_id,
        o.related_trip_id ?? null,
        o.related_delivery_id ?? null,
        o.type,
        o.state,
        o.opened_at,
        o.closed_at ?? null,
        o.opened_by,
        o.source_channel,
        o.report,
        o.hypothesis ?? null,
        o.promised_action ?? null,
        o.executed_action ?? null,
        o.evidence ?? null,
        o.owner_role,
        o.confirmation,
        o.blocks_availability,
        o.closed_by ?? null,
        o.contract_version,
        o.version,
      ],
    );
  }

  for (const r of s.riders) {
    await tx.query(
      `INSERT INTO entregas.rider_state
        (rider_id,unit_id,availability,occurrence_blocking_availability,
         active_trip_id,version,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        String(r.rider_id),
        r.unit_id,
        r.availability,
        r.occurrence_blocking_availability,
        r.active_trip_id ?? null,
        r.version,
        r.updated_at,
      ],
    );
  }

  for (const e of s.events) {
    await tx.query(
      `INSERT INTO entregas.domain_event
        (event_id,unit_id,object_type,object_id,event_type,occurred_at,recorded_at,
         synced_at,origin,device_id,actor_id,idempotency_key,payload,clock_trust,
         contract_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15)`,
      [
        e.event_id,
        s.unit_id,
        e.object_type,
        e.object_id,
        e.event_type,
        e.occurred_at,
        e.recorded_at,
        e.synced_at ?? null,
        e.origin,
        e.device_id ?? null,
        e.actor_id ?? null,
        e.idempotency_key,
        JSON.stringify(e.payload ?? {}),
        e.clock_trust,
        e.contract_version,
      ],
    );
  }

  for (const r of s.outbox) {
    await tx.query(
      `INSERT INTO entregas.public_outbox
        (outbox_id,unit_id,event_id,idempotency_key,event,status,attempts,
         created_at,last_attempt_at,last_error,published_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11)`,
      [
        r.outbox_id,
        s.unit_id,
        r.event.event_id,
        r.event.idempotency_key,
        JSON.stringify(r.event),
        r.status,
        r.attempts,
        r.created_at,
        r.last_attempt_at ?? null,
        r.last_error ?? null,
        r.published_at ?? null,
      ],
    );
  }

  // READY LAST: delivery insert dispara 0008. Se ready fosse inserido antes,
  // a própria importação consumiria uma inconsistência que deve ser visível.
  for (const r of s.ready_orders) {
    await tx.query(
      `INSERT INTO entregas.ready_order
        (unit_id,order_ref,label,channel,created_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [s.unit_id, r.order_ref, r.label, r.channel ?? null, r.created_at],
    );
  }
}

async function verifyInsideTransaction(
  tx: TransactionalSqlClient,
  s: PilotStorageSnapshot,
): Promise<void> {
  const counts = await targetCounts(tx, s.unit_id);
  const expected = snapshotCounts(s);
  if (JSON.stringify(counts) !== JSON.stringify(expected)) {
    throw new PilotStorageCutoverError(
      "VERIFY_FAILED",
      `contagens divergentes antes do COMMIT; esperado=${JSON.stringify(expected)} obtido=${JSON.stringify(counts)}`,
    );
  }

  for (const rec of s.trips) {
    const rows = await tx.query<{ version: number }>(
      `SELECT version::int AS version FROM entregas.trip
        WHERE unit_id=$1 AND trip_id=$2`,
      [s.unit_id, rec.trip.trip_id],
    );
    if (rows.length !== 1 || Number(rows[0].version) !== rec.version) {
      throw new PilotStorageCutoverError(
        "VERIFY_FAILED",
        `version da trip ${rec.trip.trip_id} não foi preservada`,
      );
    }
  }

  for (const rec of s.handoffs) {
    const rows = await tx.query<{ version: number }>(
      `SELECT version::int AS version FROM entregas.handoff
        WHERE unit_id=$1 AND handoff_id=$2`,
      [s.unit_id, rec.handoff.handoff_id],
    );
    if (rows.length !== 1 || Number(rows[0].version) !== rec.version) {
      throw new PilotStorageCutoverError(
        "VERIFY_FAILED",
        `version do handoff ${rec.handoff.handoff_id} não foi preservada`,
      );
    }
  }

  for (const occ of s.occurrences) {
    const rows = await tx.query<{ version: number }>(
      `SELECT version::int AS version FROM entregas.occurrence
        WHERE unit_id=$1 AND occurrence_id=$2`,
      [s.unit_id, occ.occurrence_id],
    );
    if (rows.length !== 1 || Number(rows[0].version) !== occ.version) {
      throw new PilotStorageCutoverError(
        "VERIFY_FAILED",
        `version da occurrence ${occ.occurrence_id} não foi preservada`,
      );
    }
  }

  for (const rider of s.riders) {
    const rows = await tx.query<{ version: number }>(
      `SELECT version::int AS version FROM entregas.rider_state
        WHERE unit_id=$1 AND rider_id=$2`,
      [s.unit_id, String(rider.rider_id)],
    );
    if (rows.length !== 1 || Number(rows[0].version) !== rider.version) {
      throw new PilotStorageCutoverError(
        "VERIFY_FAILED",
        `version do rider ${String(rider.rider_id)} não foi preservada`,
      );
    }
  }

  const eventIds = await tx.query<{ event_id: string }>(
    `SELECT event_id FROM entregas.domain_event
      WHERE unit_id=$1 ORDER BY seq`,
    [s.unit_id],
  );
  if (
    JSON.stringify(eventIds.map((x) => String(x.event_id))) !==
    JSON.stringify(s.events.map((x) => x.event_id))
  ) {
    throw new PilotStorageCutoverError(
      "VERIFY_FAILED",
      "ordem/IDs de domain_event divergiram antes do COMMIT",
    );
  }

  const outbox = await tx.query<{
    outbox_id: string;
    status: string;
    attempts: number;
  }>(
    `SELECT outbox_id,status,attempts FROM entregas.public_outbox
      WHERE unit_id=$1 ORDER BY seq`,
    [s.unit_id],
  );
  if (
    JSON.stringify(
      outbox.map((x) => ({
        outbox_id: String(x.outbox_id),
        status: String(x.status),
        attempts: Number(x.attempts),
      })),
    ) !==
    JSON.stringify(
      s.outbox.map((x) => ({
        outbox_id: x.outbox_id,
        status: x.status,
        attempts: x.attempts,
      })),
    )
  ) {
    throw new PilotStorageCutoverError(
      "VERIFY_FAILED",
      "ordem/status/attempts da outbox divergiram antes do COMMIT",
    );
  }

  const ready = await tx.query<{ order_ref: string }>(
    `SELECT order_ref FROM entregas.ready_order
      WHERE unit_id=$1 ORDER BY order_ref`,
    [s.unit_id],
  );
  if (
    JSON.stringify(ready.map((x) => String(x.order_ref))) !==
    JSON.stringify([...s.ready_orders.map((x) => x.order_ref)].sort())
  ) {
    throw new PilotStorageCutoverError(
      "VERIFY_FAILED",
      "ready_orders divergiram antes do COMMIT",
    );
  }
}

export async function applyFileToPostgresCutover(args: {
  sql: TransactionalSqlClient;
  snapshot: PilotStorageSnapshot;
}): Promise<PilotStorageCutoverResult> {
  const plan = await planFileToPostgresCutover(args);
  if (!plan.can_apply) {
    const code =
      countTotal(plan.target_counts) > 0
        ? "TARGET_NOT_EMPTY"
        : "GLOBAL_COLLISION";
    throw new PilotStorageCutoverError(code, plan.conflicts.join("; "));
  }

  await args.sql.transaction(async (tx) => {
    // Revalida DENTRO da transação imediatamente antes da primeira escrita.
    await assertTargetReady(tx, args.snapshot.unit_id);
    const target = await targetCounts(tx, args.snapshot.unit_id);
    if (countTotal(target) !== 0) {
      throw new PilotStorageCutoverError(
        "TARGET_NOT_EMPTY",
        `destino deixou de estar vazio: ${JSON.stringify(target)}`,
      );
    }
    const collisions = await globalCollisions(tx, args.snapshot);
    if (collisions.length) {
      throw new PilotStorageCutoverError(
        "GLOBAL_COLLISION",
        collisions.join("; "),
      );
    }
    await insertSnapshot(tx, args.snapshot);
    await verifyInsideTransaction(tx, args.snapshot);
  });

  const after = await targetCounts(args.sql, args.snapshot.unit_id);
  if (JSON.stringify(after) !== JSON.stringify(snapshotCounts(args.snapshot))) {
    throw new PilotStorageCutoverError(
      "VERIFY_FAILED",
      "contagem mudou imediatamente após o COMMIT",
    );
  }

  return {
    unit_id: args.snapshot.unit_id,
    source_fingerprint: snapshotFingerprint(args.snapshot),
    imported_counts: after,
    // Fingerprint pós-commit é um selo da fonte importada; a equivalência
    // estrutural detalhada já foi verificada dentro da transação.
    target_fingerprint: snapshotFingerprint(args.snapshot),
  };
}
