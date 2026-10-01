import type {
  TripRepository,
  HandoffRepository,
  OccurrenceRepository,
  RiderStateRepository,
  EventStore,
  OutboxRepository,
  TripRecord,
  UnitOfWork,
} from "./ports";
import { ConcurrencyError } from "./ports";
import type {
  Trip,
  Delivery,
  Handoff,
  DomainEvent,
} from "../foundation/types";
import type { Occurrence } from "../operational/occurrence";
import type { RiderOperationalState } from "../operational/rider-state";
import type { OutboxRecord } from "../integration/outbox";
import { validatePublicEvent } from "../contracts/events/validate";
import type {
  SqlClient,
  SqlRow,
  TransactionalSqlClient,
} from "../../platform/persistence/sql-client";

function iso(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v.toISOString();
  return new Date(String(v)).toISOString();
}
function requiredIso(v: unknown): string {
  const x = iso(v);
  if (!x) throw new Error("timestamp obrigatorio ausente");
  return x;
}
function text(v: unknown): string {
  return String(v);
}
function optText(v: unknown): string | undefined {
  return v === null || v === undefined ? undefined : String(v);
}
function clone<T>(x: T): T {
  return structuredClone(x);
}

function rowToTrip(row: SqlRow, deliveries: Delivery[]): TripRecord {
  const trip: Trip = {
    trip_id: text(row.trip_id),
    unit_id: text(row.unit_id),
    courier_actor_id: text(row.courier_actor_id) as Trip["courier_actor_id"],
    created_by: text(row.created_by),
    state: text(row.state) as Trip["state"],
    delivery_ids: Array.isArray(row.delivery_ids)
      ? (row.delivery_ids as unknown[]).map(String)
      : deliveries.map((d) => d.delivery_id),
    created_at: requiredIso(row.created_at),
    started_at: iso(row.started_at),
    closed_at: iso(row.closed_at),
    close_mode: optText(row.close_mode) as Trip["close_mode"],
    last_event_id: optText(row.last_event_id) ?? "",
    contract_version: text(row.contract_version) as Trip["contract_version"],
    policy_bundle_id: optText(row.policy_bundle_id) ?? "",
    return_evidence:
      row.return_evidence && typeof row.return_evidence === "object"
        ? (row.return_evidence as Record<string, unknown>)
        : undefined,
    manual_close_reason: optText(row.manual_close_reason),
    manual_close_actor: optText(row.manual_close_actor),
    state_before_signal_loss:
      optText(row.state_before_signal_loss) as Trip["state_before_signal_loss"],
  };
  return {
    trip,
    deliveries,
    version: Number(row.version),
  };
}

function rowToDelivery(row: SqlRow): Delivery {
  return {
    delivery_id: text(row.delivery_id),
    trip_id: text(row.trip_id),
    order_ref: text(row.order_ref),
    channel: text(row.channel) as Delivery["channel"],
    planned_stop_order: Number(row.planned_stop_order),
    actual_stop_order:
      row.actual_stop_order === null || row.actual_stop_order === undefined
        ? undefined
        : Number(row.actual_stop_order),
    state: text(row.state) as Delivery["state"],
    arrival_detected_at: iso(row.arrival_detected_at),
    arrival_reported_at: iso(row.arrival_reported_at),
    confirmed_at: iso(row.confirmed_at),
    unconfirmed_at: iso(row.unconfirmed_at),
    unconfirmed_trigger:
      optText(row.unconfirmed_trigger) as Delivery["unconfirmed_trigger"],
    occurrence_id: optText(row.occurrence_id),
    cancelled_reason: optText(row.cancelled_reason),
    active: Boolean(row.active),
    removed_at: iso(row.removed_at),
    removed_reason: optText(row.removed_reason),
    removed_by: optText(row.removed_by),
  };
}

function rowToHandoff(row: SqlRow): { handoff: Handoff; version: number } {
  return {
    handoff: {
      handoff_id: text(row.handoff_id),
      unit_id: text(row.unit_id),
      external_order_ref: text(row.external_order_ref),
      external_courier_ref:
        optText(row.external_courier_ref) as Handoff["external_courier_ref"],
      state: text(row.state) as Handoff["state"],
      arrived_at: iso(row.arrived_at),
      conference_actor: optText(row.conference_actor),
      handoff_actor: optText(row.handoff_actor),
      volumes:
        row.volumes && typeof row.volumes === "object"
          ? (row.volumes as Handoff["volumes"])
          : undefined,
      integrity_ok:
        row.integrity_ok === null || row.integrity_ok === undefined
          ? undefined
          : Boolean(row.integrity_ok),
      courier_verified: Boolean(row.courier_verified),
      courier_verification_method: optText(row.courier_verification_method),
      handoff_at: iso(row.handoff_at),
      confirmed: Boolean(row.confirmed),
      exception: optText(row.exception),
      contract_version: text(row.contract_version) as Handoff["contract_version"],
    },
    version: Number(row.version),
  };
}

function rowToOccurrence(row: SqlRow): Occurrence {
  return {
    occurrence_id: text(row.occurrence_id),
    unit_id: text(row.unit_id),
    type: text(row.kind),
    source_channel: optText(row.source_channel) ?? "",
    related_delivery_id: optText(row.delivery_id),
    related_trip_id: optText(row.trip_id),
    state: text(row.state) as Occurrence["state"],
    report: optText(row.report) ?? "",
    hypothesis: optText(row.hypothesis),
    promised_action: optText(row.promised_action),
    executed_action: optText(row.executed_action),
    evidence: optText(row.evidence),
    owner_role: optText(row.owner_role) ?? "",
    confirmation:
      (optText(row.confirmation) as Occurrence["confirmation"]) ?? "none",
    blocks_availability: Boolean(row.blocks_availability),
    opened_at: requiredIso(row.opened_at),
    opened_by: text(row.opened_by),
    closed_at: iso(row.closed_at),
    closed_by: optText(row.closed_by),
    contract_version: optText(row.contract_version) ?? "",
    version: Number(row.version),
  };
}

function rowToRider(row: SqlRow): RiderOperationalState {
  return {
    rider_id: text(row.rider_id) as RiderOperationalState["rider_id"],
    unit_id: text(row.unit_id),
    availability: text(row.availability) as RiderOperationalState["availability"],
    occurrence_blocking_availability: Boolean(
      row.occurrence_blocking_availability,
    ),
    active_trip_id: optText(row.active_trip_id),
    version: Number(row.version),
    updated_at: requiredIso(row.updated_at),
  };
}

function rowToDomainEvent(row: SqlRow): DomainEvent {
  return {
    event_id: text(row.event_id),
    object_type: text(row.object_type) as DomainEvent["object_type"],
    object_id: text(row.object_id),
    event_type: text(row.event_type),
    occurred_at: requiredIso(row.occurred_at),
    recorded_at: requiredIso(row.recorded_at),
    synced_at: iso(row.synced_at),
    origin: text(row.origin) as DomainEvent["origin"],
    device_id: optText(row.device_id),
    actor_id: optText(row.actor_id),
    idempotency_key: text(row.idempotency_key),
    payload: (row.payload ?? {}) as Record<string, unknown>,
    clock_trust: text(row.clock_trust) as DomainEvent["clock_trust"],
    contract_version: text(row.contract_version) as DomainEvent["contract_version"],
  };
}

function rowToOutbox(row: SqlRow): OutboxRecord {
  return {
    outbox_id: text(row.outbox_id),
    event: clone(row.event as OutboxRecord["event"]),
    status: text(row.status) as OutboxRecord["status"],
    attempts: Number(row.attempts),
    created_at: requiredIso(row.created_at),
    last_attempt_at: iso(row.last_attempt_at),
    last_error: optText(row.last_error),
    published_at: iso(row.published_at),
  };
}

type TripWrite = { record: TripRecord; expected: number | null };
type HandoffWrite = {
  handoff: Handoff;
  version: number;
  expected: number | null;
};
type OccWrite = { occ: Occurrence; expected: number | null };
type RiderWrite = {
  state: RiderOperationalState;
  expected: number | null;
};

export class PgEntregasUnitOfWork implements UnitOfWork {
  private readonly tripWrites = new Map<string, TripWrite>();
  private readonly handoffWrites = new Map<string, HandoffWrite>();
  private readonly occurrenceWrites = new Map<string, OccWrite>();
  private readonly riderWrites = new Map<string, RiderWrite>();
  private eventWrites: DomainEvent[] = [];
  private outboxWrites: OutboxRecord[] = [];
  private outboxStatus = new Map<
    string,
    { kind: "published"; at: string } | { kind: "failed"; at: string; error: string }
  >();

  readonly trips: TripRepository;
  readonly handoffs: HandoffRepository;
  readonly occurrences: OccurrenceRepository;
  readonly riders: RiderStateRepository;
  readonly events: EventStore;
  readonly outbox: OutboxRepository;

  constructor(
    private readonly client: TransactionalSqlClient,
    private readonly unitId: string,
  ) {
    if (!unitId.trim()) throw new Error("unit_id obrigatorio no PgEntregasUnitOfWork");
    const self = this;

    this.trips = {
      async get(id) {
        const staged = self.tripWrites.get(id);
        if (staged) return clone(staged.record);
        const rows = await self.client.query<SqlRow>(
          `SELECT * FROM entregas.trip WHERE trip_id=$1 AND unit_id=$2`,
          [id, self.unitId],
        );
        if (!rows.length) return null;
        const ds = await self.client.query<SqlRow>(
          `SELECT * FROM entregas.delivery WHERE trip_id=$1
             ORDER BY planned_stop_order, delivery_id`,
          [id],
        );
        return rowToTrip(rows[0], ds.map(rowToDelivery));
      },
      async save(record, expected) {
        if (record.trip.unit_id !== self.unitId) {
          throw new Error("trip de outra unidade recusada");
        }
        self.tripWrites.set(record.trip.trip_id, {
          record: clone(record),
          expected,
        });
      },
    };

    this.handoffs = {
      async get(id) {
        const staged = self.handoffWrites.get(id);
        if (staged) {
          return { handoff: clone(staged.handoff), version: staged.version };
        }
        const rows = await self.client.query<SqlRow>(
          `SELECT * FROM entregas.handoff WHERE handoff_id=$1 AND unit_id=$2`,
          [id, self.unitId],
        );
        return rows.length ? rowToHandoff(rows[0]) : null;
      },
      async save(handoff, version, expected) {
        if (handoff.unit_id !== self.unitId) {
          throw new Error("handoff de outra unidade recusado");
        }
        self.handoffWrites.set(handoff.handoff_id, {
          handoff: clone(handoff),
          version,
          expected,
        });
      },
    };

    this.occurrences = {
      async get(id) {
        const staged = self.occurrenceWrites.get(id);
        if (staged) return clone(staged.occ);
        const rows = await self.client.query<SqlRow>(
          `SELECT * FROM entregas.occurrence WHERE occurrence_id=$1 AND unit_id=$2`,
          [id, self.unitId],
        );
        return rows.length ? rowToOccurrence(rows[0]) : null;
      },
      async save(occ, expected) {
        if (occ.unit_id !== self.unitId) {
          throw new Error("occurrence de outra unidade recusada");
        }
        self.occurrenceWrites.set(occ.occurrence_id, {
          occ: clone(occ),
          expected,
        });
      },
    };

    this.riders = {
      async get(id) {
        const staged = self.riderWrites.get(id);
        if (staged) return clone(staged.state);
        const rows = await self.client.query<SqlRow>(
          `SELECT * FROM entregas.rider_state WHERE rider_id=$1 AND unit_id=$2`,
          [id, self.unitId],
        );
        return rows.length ? rowToRider(rows[0]) : null;
      },
      async save(state, expected) {
        if (state.unit_id !== self.unitId) {
          throw new Error("rider de outra unidade recusado");
        }
        self.riderWrites.set(String(state.rider_id), {
          state: clone(state),
          expected,
        });
      },
    };

    this.events = {
      async append(events) {
        self.eventWrites.push(...events.map(clone));
      },
      async listByObject(objectType, objectId) {
        const rows = await self.client.query<SqlRow>(
          `SELECT * FROM entregas.domain_event
            WHERE unit_id=$1 AND object_type=$2 AND object_id=$3
            ORDER BY seq`,
          [self.unitId, objectType, objectId],
        );
        const committed = rows.map(rowToDomainEvent);
        const staged = self.eventWrites.filter(
          (e) => e.object_type === objectType && e.object_id === objectId,
        );
        return [...committed, ...staged.map(clone)];
      },
      async listAll() {
        const rows = await self.client.query<SqlRow>(
          `SELECT * FROM entregas.domain_event WHERE unit_id=$1 ORDER BY seq`,
          [self.unitId],
        );
        return [...rows.map(rowToDomainEvent), ...self.eventWrites.map(clone)];
      },
    };

    this.outbox = {
      async enqueue(record) {
        if (record.event.unit_id !== self.unitId) {
          throw new Error("outbox de outra unidade recusada");
        }
        const v = validatePublicEvent(record.event);
        if (!v.ok) throw new Error("Outbox: evento publico invalido");

        const local = self.outboxWrites.find(
          (r) =>
            r.event.event_id === record.event.event_id ||
            r.event.idempotency_key === record.event.idempotency_key,
        );
        if (local) return { duplicate: true };

        const rows = await self.client.query<SqlRow>(
          `SELECT outbox_id FROM entregas.public_outbox
            WHERE unit_id=$1 AND (event_id=$2 OR idempotency_key=$3)
            LIMIT 1`,
          [self.unitId, record.event.event_id, record.event.idempotency_key],
        );
        if (rows.length) return { duplicate: true };
        self.outboxWrites.push(clone(record));
        return { duplicate: false };
      },
      async listPending() {
        const rows = await self.client.query<SqlRow>(
          `SELECT * FROM entregas.public_outbox
            WHERE unit_id=$1 AND status IN ('pending','failed')
            ORDER BY seq`,
          [self.unitId],
        );
        const committed = rows.map(rowToOutbox);
        const staged = self.outboxWrites.filter(
          (r) => r.status === "pending" || r.status === "failed",
        );
        return [...committed, ...staged.map(clone)];
      },
      async markPublished(id, at) {
        const local = self.outboxWrites.find((r) => r.outbox_id === id);
        if (local) {
          local.status = "published";
          local.published_at = at;
          return;
        }
        self.outboxStatus.set(id, { kind: "published", at });
      },
      async markFailed(id, error, at) {
        const local = self.outboxWrites.find((r) => r.outbox_id === id);
        if (local) {
          local.status = "failed";
          local.last_error = error;
          local.last_attempt_at = at;
          local.attempts += 1;
          return;
        }
        self.outboxStatus.set(id, { kind: "failed", at, error });
      },
      async all() {
        const rows = await self.client.query<SqlRow>(
          `SELECT * FROM entregas.public_outbox
            WHERE unit_id=$1 ORDER BY seq`,
          [self.unitId],
        );
        return [...rows.map(rowToOutbox), ...self.outboxWrites.map(clone)];
      },
    };
  }

  private clearStage(): void {
    this.tripWrites.clear();
    this.handoffWrites.clear();
    this.occurrenceWrites.clear();
    this.riderWrites.clear();
    this.eventWrites = [];
    this.outboxWrites = [];
    this.outboxStatus.clear();
  }

  async commit(): Promise<void> {
    await this.client.transaction(async (tx) => {
      for (const { record, expected } of this.tripWrites.values()) {
        const t = record.trip;
        let ok = false;
        if (expected === null) {
          const r = await tx.query<SqlRow>(
            `INSERT INTO entregas.trip
              (trip_id,unit_id,courier_actor_id,state,created_by,created_at,
               started_at,closed_at,contract_version,policy_bundle_id,version,
               delivery_ids,close_mode,last_event_id,return_evidence,
               manual_close_reason,manual_close_actor,state_before_signal_loss)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11::jsonb,$12,$13,$14::jsonb,$15,$16,$17)
             ON CONFLICT (trip_id) DO NOTHING RETURNING version`,
            [
              t.trip_id,t.unit_id,String(t.courier_actor_id),t.state,t.created_by,
              t.created_at,t.started_at ?? null,t.closed_at ?? null,
              t.contract_version,t.policy_bundle_id,
              JSON.stringify(t.delivery_ids),t.close_mode ?? null,t.last_event_id,
              t.return_evidence ? JSON.stringify(t.return_evidence) : null,
              t.manual_close_reason ?? null,t.manual_close_actor ?? null,
              t.state_before_signal_loss ?? null,
            ],
          );
          ok = r.length === 1;
        } else {
          const r = await tx.query<SqlRow>(
            `UPDATE entregas.trip SET
               courier_actor_id=$3,state=$4,created_by=$5,created_at=$6,
               started_at=$7,closed_at=$8,contract_version=$9,policy_bundle_id=$10,
               version=version+1,delivery_ids=$11::jsonb,close_mode=$12,
               last_event_id=$13,return_evidence=$14::jsonb,
               manual_close_reason=$15,manual_close_actor=$16,
               state_before_signal_loss=$17
             WHERE trip_id=$1 AND unit_id=$2 AND version=$18
             RETURNING version`,
            [
              t.trip_id,t.unit_id,String(t.courier_actor_id),t.state,t.created_by,
              t.created_at,t.started_at ?? null,t.closed_at ?? null,
              t.contract_version,t.policy_bundle_id,
              JSON.stringify(t.delivery_ids),t.close_mode ?? null,t.last_event_id,
              t.return_evidence ? JSON.stringify(t.return_evidence) : null,
              t.manual_close_reason ?? null,t.manual_close_actor ?? null,
              t.state_before_signal_loss ?? null,expected,
            ],
          );
          ok = r.length === 1;
        }
        if (!ok) {
          throw new ConcurrencyError(
            `Trip ${t.trip_id} version conflict expected=${expected}`,
          );
        }

        await tx.query(`DELETE FROM entregas.delivery WHERE trip_id=$1`, [t.trip_id]);
        for (const d of record.deliveries) {
          await tx.query(
            `INSERT INTO entregas.delivery
              (delivery_id,trip_id,order_ref,channel,planned_stop_order,
               actual_stop_order,state,arrival_detected_at,arrival_reported_at,
               confirmed_at,unconfirmed_at,active,unconfirmed_trigger,
               occurrence_id,cancelled_reason,removed_at,removed_reason,removed_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
            [
              d.delivery_id,d.trip_id,d.order_ref,d.channel,d.planned_stop_order,
              d.actual_stop_order ?? null,d.state,d.arrival_detected_at ?? null,
              d.arrival_reported_at ?? null,d.confirmed_at ?? null,
              d.unconfirmed_at ?? null,d.active,d.unconfirmed_trigger ?? null,
              d.occurrence_id ?? null,d.cancelled_reason ?? null,d.removed_at ?? null,
              d.removed_reason ?? null,d.removed_by ?? null,
            ],
          );
        }
      }

      for (const { handoff, version, expected } of this.handoffWrites.values()) {
        if (expected !== null && version !== expected + 1) {
          throw new ConcurrencyError("Handoff version sequence invalid");
        }
        const params = [
          handoff.handoff_id,handoff.unit_id,handoff.external_order_ref,
          handoff.external_courier_ref ?? null,handoff.state,handoff.arrived_at ?? null,
          handoff.conference_actor ?? null,handoff.handoff_actor ?? null,
          handoff.volumes ? JSON.stringify(handoff.volumes) : null,
          handoff.integrity_ok ?? null,handoff.courier_verified,
          handoff.courier_verification_method ?? null,handoff.handoff_at ?? null,
          handoff.confirmed,handoff.exception ?? null,handoff.contract_version,version,
        ];
        const r = expected === null
          ? await tx.query<SqlRow>(
              `INSERT INTO entregas.handoff
                (handoff_id,unit_id,external_order_ref,external_courier_ref,state,
                 arrived_at,conference_actor,handoff_actor,volumes,integrity_ok,
                 courier_verified,courier_verification_method,handoff_at,confirmed,
                 exception,contract_version,version)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17)
               ON CONFLICT (handoff_id) DO NOTHING RETURNING version`,
              params,
            )
          : await tx.query<SqlRow>(
              `UPDATE entregas.handoff SET
                 external_order_ref=$3,external_courier_ref=$4,state=$5,arrived_at=$6,
                 conference_actor=$7,handoff_actor=$8,volumes=$9::jsonb,integrity_ok=$10,
                 courier_verified=$11,courier_verification_method=$12,handoff_at=$13,
                 confirmed=$14,exception=$15,contract_version=$16,version=$17
               WHERE handoff_id=$1 AND unit_id=$2 AND version=$18
               RETURNING version`,
              [...params, expected],
            );
        if (!r.length) throw new ConcurrencyError("Handoff version conflict");
      }

      for (const { occ, expected } of this.occurrenceWrites.values()) {
        const params = [
          occ.occurrence_id,occ.unit_id,occ.related_trip_id ?? null,
          occ.related_delivery_id ?? null,occ.type,occ.state,occ.opened_at,
          occ.closed_at ?? null,occ.opened_by,occ.source_channel,occ.report,
          occ.hypothesis ?? null,occ.promised_action ?? null,occ.executed_action ?? null,
          occ.evidence ?? null,occ.owner_role,occ.confirmation,
          occ.blocks_availability,occ.closed_by ?? null,occ.contract_version,occ.version,
          JSON.stringify({}),
        ];
        const r = expected === null
          ? await tx.query<SqlRow>(
              `INSERT INTO entregas.occurrence
                (occurrence_id,unit_id,trip_id,delivery_id,kind,state,opened_at,
                 closed_at,opened_by,source_channel,report,hypothesis,promised_action,
                 executed_action,evidence,owner_role,confirmation,blocks_availability,
                 closed_by,contract_version,version,detail)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb)
               ON CONFLICT (occurrence_id) DO NOTHING RETURNING version`,
              params,
            )
          : await tx.query<SqlRow>(
              `UPDATE entregas.occurrence SET
                 trip_id=$3,delivery_id=$4,kind=$5,state=$6,opened_at=$7,closed_at=$8,
                 opened_by=$9,source_channel=$10,report=$11,hypothesis=$12,
                 promised_action=$13,executed_action=$14,evidence=$15,owner_role=$16,
                 confirmation=$17,blocks_availability=$18,closed_by=$19,
                 contract_version=$20,version=$21,detail=$22::jsonb
               WHERE occurrence_id=$1 AND unit_id=$2 AND version=$23
               RETURNING version`,
              [...params, expected],
            );
        if (!r.length) throw new ConcurrencyError("Occurrence version conflict");
      }

      for (const { state, expected } of this.riderWrites.values()) {
        const params = [
          String(state.rider_id),state.unit_id,state.availability,
          state.occurrence_blocking_availability,state.active_trip_id ?? null,
          state.version,state.updated_at,
        ];
        const r = expected === null
          ? await tx.query<SqlRow>(
              `INSERT INTO entregas.rider_state
                (rider_id,unit_id,availability,occurrence_blocking_availability,
                 active_trip_id,version,updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7)
               ON CONFLICT (rider_id) DO NOTHING RETURNING version`,
              params,
            )
          : await tx.query<SqlRow>(
              `UPDATE entregas.rider_state SET
                 availability=$3,occurrence_blocking_availability=$4,
                 active_trip_id=$5,version=$6,updated_at=$7
               WHERE rider_id=$1 AND unit_id=$2 AND version=$8
               RETURNING version`,
              [...params, expected],
            );
        if (!r.length) throw new ConcurrencyError("Rider version conflict");
      }

      for (const e of this.eventWrites) {
        await tx.query(
          `INSERT INTO entregas.domain_event
            (event_id,unit_id,object_type,object_id,event_type,occurred_at,recorded_at,
             synced_at,origin,device_id,actor_id,idempotency_key,payload,clock_trust,
             contract_version)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15)
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [
            e.event_id,this.unitId,e.object_type,e.object_id,e.event_type,
            e.occurred_at,e.recorded_at,e.synced_at ?? null,e.origin,e.device_id ?? null,
            e.actor_id ?? null,e.idempotency_key,JSON.stringify(e.payload ?? {}),
            e.clock_trust,e.contract_version,
          ],
        );
      }

      for (const r of this.outboxWrites) {
        await tx.query(
          `INSERT INTO entregas.public_outbox
            (outbox_id,unit_id,event_id,idempotency_key,event,status,attempts,
             created_at,last_attempt_at,last_error,published_at)
           VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11)
           ON CONFLICT DO NOTHING`,
          [
            r.outbox_id,this.unitId,r.event.event_id,r.event.idempotency_key,
            JSON.stringify(r.event),r.status,r.attempts,r.created_at,
            r.last_attempt_at ?? null,r.last_error ?? null,r.published_at ?? null,
          ],
        );
      }

      for (const [id, s] of this.outboxStatus) {
        if (s.kind === "published") {
          await tx.query(
            `UPDATE entregas.public_outbox
                SET status='published', published_at=$3
              WHERE outbox_id=$1 AND unit_id=$2`,
            [id,this.unitId,s.at],
          );
        } else {
          await tx.query(
            `UPDATE entregas.public_outbox
                SET status='failed', last_error=$3, last_attempt_at=$4,
                    attempts=attempts+1
              WHERE outbox_id=$1 AND unit_id=$2`,
            [id,this.unitId,s.error,s.at],
          );
        }
      }
    });
    this.clearStage();
  }

  async rollback(): Promise<void> {
    this.clearStage();
  }
}
