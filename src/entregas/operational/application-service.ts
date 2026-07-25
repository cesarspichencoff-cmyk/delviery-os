/**
 * Application service — única porta de commands sobre a fundação COR.
 * Não duplica máquina de estados; delega a foundation/*.
 */
import { randomUUID } from "node:crypto";
import { InMemoryEventLog } from "../foundation/event-log";
import { createPilotPolicy, type PilotPolicy } from "../foundation/policy";
import {
  createTrip,
  startTrip,
  startReturn,
  closeTripAutomatic,
  closeTripManual,
  addDeliveryToTrip,
  removeDeliveryFromTrip,
  type TripAggregate,
} from "../foundation/trip-machine";
import {
  applyArrivalDetected,
  applyArrivalReported,
  arrivalProvenance,
  applyDeliveryConfirmed,
} from "../foundation/delivery-rules";
import {
  createHandoff,
  markCourierArrived,
  confirmHandoff,
} from "../foundation/handoff-machine";
import { DomainError, type Delivery, type Handoff } from "../foundation/types";
import { domainEventToPublic } from "../integration/public-event-builder";
import type { UnitOfWork } from "../persistence/ports";
import { assertCan, requireActor, MANUAL_CLOSE_ROLES, type ActorContext } from "./auth";
import type { Command } from "./commands";
import {
  openOccurrence,
  resolveOccurrence,
  type Occurrence,
} from "./occurrence";
import {
  createRiderState,
  applyTripStateToRider,
  setRiderAvailability,
  setOccurrenceBlocking,
  type RiderOperationalState,
} from "./rider-state";
import type { OutboxRecord } from "../integration/outbox";

export interface AppResult {
  ok: boolean;
  error?: string;
  code?: string;
  trip?: TripAggregate;
  handoff?: Handoff;
  occurrence?: Occurrence;
  rider?: RiderOperationalState;
}

export class EntregasApplicationService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly policy: PilotPolicy = createPilotPolicy(),
  ) {}

  async execute(cmd: Command): Promise<AppResult> {
    try {
      requireActor(cmd.actor);
      switch (cmd.type) {
        case "CreateTrip":
          return await this.createTrip(cmd);
        case "AddDeliveryToTrip":
          return await this.addDelivery(cmd);
        case "RemoveDeliveryFromTrip":
          return await this.removeDelivery(cmd);
        case "ConfirmTripDeparture":
          return await this.depart(cmd);
        case "RecordArrivalDetected":
          return await this.arrival(cmd);
        case "RecordArrivalReported":
          return await this.arrivalReported(cmd);
        case "ConfirmDelivery":
          return await this.confirmDelivery(cmd);
        case "RecordCustomerNotFound":
          return await this.customerNotFound(cmd);
        case "StartTripReturn":
          return await this.startReturn(cmd);
        case "DetectReturn":
          return await this.detectReturn(cmd);
        case "CloseTripManually":
          return await this.closeManual(cmd);
        case "StartHandoff":
          return await this.startHandoff(cmd);
        case "ConfirmHandoff":
          return await this.confirmHandoffCmd(cmd);
        case "CreateOccurrence":
          return await this.createOcc(cmd);
        case "ResolveOccurrence":
          return await this.resolveOcc(cmd);
        case "SetRiderPause":
          return await this.setPause(cmd);
        case "SetRiderSupport":
          return await this.setSupport(cmd);
        case "RecordReturnRequested":
          return await this.returnRequested(cmd);
        case "CancelDelivery":
          return await this.cancelDelivery(cmd);
        case "AssignInternalRider":
          return await this.assignRider(cmd);
        default:
          return { ok: false, error: "Unknown command", code: "UNKNOWN" };
      }
    } catch (e) {
      await this.uow.rollback().catch(() => undefined);
      const msg = e instanceof Error ? e.message : String(e);
      const code =
        e instanceof DomainError
          ? e.code
          : e instanceof Error && e.name === "AuthError"
            ? "AUTH"
            : e instanceof Error && e.name === "ConcurrencyError"
              ? "CONCURRENCY"
              : "ERROR";
      return { ok: false, error: msg, code };
    }
  }

  private async loadAgg(trip_id: string): Promise<TripAggregate> {
    const rec = await this.uow.trips.get(trip_id);
    if (!rec) throw new DomainError("PRECONDITION_FAILED", "Trip não encontrada");
    return {
      trip: rec.trip,
      deliveries: new Map(rec.deliveries.map((d) => [d.delivery_id, d])),
    };
  }

  private async saveAgg(
    agg: TripAggregate,
    expectedVersion: number | null,
    log: InMemoryEventLog,
  ): Promise<void> {
    const deliveries = [...agg.deliveries.values()];
    await this.uow.trips.save(
      { trip: agg.trip, deliveries, version: 0 },
      expectedVersion,
    );
    const newEvents = log.all();
    await this.uow.events.append(newEvents);
    for (const de of newEvents) {
      const pub = domainEventToPublic(de, {
        unit_id: agg.trip.unit_id,
        correlation_id: agg.trip.trip_id,
      });
      if (!pub) continue;
      const rec: OutboxRecord = {
        outbox_id: `obx_${randomUUID()}`,
        event: pub,
        status: "pending",
        attempts: 0,
        created_at: new Date().toISOString(),
      };
      await this.uow.outbox.enqueue(rec);
    }
    // rider sync
    let rider = await this.uow.riders.get(agg.trip.courier_actor_id);
    const isNew = !rider;
    if (!rider) {
      rider = createRiderState(
        agg.trip.courier_actor_id,
        agg.trip.unit_id,
        agg.trip.created_at,
      );
    }
    const expectedRider = isNew ? null : rider.version;
    rider = applyTripStateToRider(rider, agg.trip, new Date().toISOString());
    await this.uow.riders.save(rider, expectedRider);
    await this.uow.commit();
  }

  private async createTrip(
    cmd: Extract<Command, { type: "CreateTrip" }>,
  ): Promise<AppResult> {
    assertCan(cmd.actor, "trip_mutate");
    const log = new InMemoryEventLog();
    const r = createTrip(log, {
      trip_id: cmd.trip_id,
      unit_id: cmd.unit_id,
      courier_actor_id: cmd.courier_actor_id,
      created_by: cmd.actor.actor_id,
      occurred_at: cmd.occurred_at,
      policy: this.policy,
      initial_deliveries: cmd.deliveries,
    });
    if (!r.ok) return { ok: false, error: r.error.message, code: r.error.code };
    await this.saveAgg(r.state, null, log);
    return { ok: true, trip: r.state };
  }

  private async addDelivery(
    cmd: Extract<Command, { type: "AddDeliveryToTrip" }>,
  ): Promise<AppResult> {
    const rec = await this.uow.trips.get(cmd.trip_id);
    if (!rec) return { ok: false, error: "Trip não encontrada", code: "NOT_FOUND" };
    if (rec.trip.state !== "preparando_saida") {
      assertCan(cmd.actor, "add_after_start");
    } else {
      assertCan(cmd.actor, "trip_mutate");
    }
    const log = new InMemoryEventLog();
    const agg: TripAggregate = {
      trip: rec.trip,
      deliveries: new Map(rec.deliveries.map((d) => [d.delivery_id, d])),
    };
    const r = addDeliveryToTrip(
      log,
      agg,
      {
        delivery_id: cmd.delivery_id,
        order_ref: cmd.order_ref,
        planned_stop_order: cmd.planned_stop_order,
        channel: cmd.channel ?? "proprio",
      },
      cmd.occurred_at,
      cmd.actor.actor_id,
      this.policy,
    );
    if (!r.ok) return { ok: false, error: r.error.message, code: r.error.code };
    await this.saveAgg(r.state, rec.version, log);
    return { ok: true, trip: r.state };
  }

  private async removeDelivery(
    cmd: Extract<Command, { type: "RemoveDeliveryFromTrip" }>,
  ): Promise<AppResult> {
    assertCan(cmd.actor, "trip_mutate");
    const rec = await this.uow.trips.get(cmd.trip_id);
    if (!rec) return { ok: false, error: "Trip não encontrada", code: "NOT_FOUND" };
    const log = new InMemoryEventLog();
    const agg: TripAggregate = {
      trip: rec.trip,
      deliveries: new Map(rec.deliveries.map((d) => [d.delivery_id, d])),
    };
    const r = removeDeliveryFromTrip(
      log,
      agg,
      cmd.delivery_id,
      cmd.occurred_at,
      cmd.reason,
      cmd.actor.actor_id,
      this.policy,
    );
    if (!r.ok) return { ok: false, error: r.error.message, code: r.error.code };
    await this.saveAgg(r.state, rec.version, log);
    return { ok: true, trip: r.state };
  }

  private async depart(
    cmd: Extract<Command, { type: "ConfirmTripDeparture" }>,
  ): Promise<AppResult> {
    assertCan(cmd.actor, "trip_start");
    const rec = await this.uow.trips.get(cmd.trip_id);
    if (!rec) return { ok: false, error: "Trip não encontrada", code: "NOT_FOUND" };
    const log = new InMemoryEventLog();
    const agg: TripAggregate = {
      trip: rec.trip,
      deliveries: new Map(rec.deliveries.map((d) => [d.delivery_id, d])),
    };
    const r = startTrip(log, agg, cmd.occurred_at, cmd.actor.actor_id);
    if (!r.ok) return { ok: false, error: r.error.message, code: r.error.code };
    await this.saveAgg(r.state, rec.version, log);
    return { ok: true, trip: r.state };
  }

  private async arrival(
    cmd: Extract<Command, { type: "RecordArrivalDetected" }>,
  ): Promise<AppResult> {
    return this.recordArrival({
      trip_id: cmd.trip_id,
      delivery_id: cmd.delivery_id,
      occurred_at: cmd.occurred_at,
      actor: cmd.actor,
      kind: "detected",
      source: cmd.source ?? "manual",
    });
  }

  private async arrivalReported(
    cmd: Extract<Command, { type: "RecordArrivalReported" }>,
  ): Promise<AppResult> {
    return this.recordArrival({
      trip_id: cmd.trip_id,
      delivery_id: cmd.delivery_id,
      occurred_at: cmd.occurred_at,
      actor: cmd.actor,
      kind: "reported",
      source: "rider",
    });
  }

  /**
   * Caminho único das duas chegadas. Elas compartilham o estado canônico
   * (`chegada_detectada`, desfecho PENDENTE) e diferem em quem observou:
   * sistema ou pessoa. Nenhuma das duas confirma entrega — `confirms_delivery`
   * vai `false` no payload para que isso fique escrito no log, não só no
   * comentário.
   */
  private async recordArrival(args: {
    trip_id: string;
    delivery_id: string;
    occurred_at: string;
    actor: ActorContext;
    kind: "detected" | "reported";
    source: string;
  }): Promise<AppResult> {
    assertCan(args.actor, "trip_start");
    const rec = await this.uow.trips.get(args.trip_id);
    if (!rec) return { ok: false, error: "Trip não encontrada", code: "NOT_FOUND" };
    const log = new InMemoryEventLog();
    const map = new Map(rec.deliveries.map((d) => [d.delivery_id, d]));
    const d = map.get(args.delivery_id);
    if (!d) return { ok: false, error: "Delivery não encontrada", code: "NOT_FOUND" };

    const detected = args.kind === "detected";
    const updated = detected
      ? applyArrivalDetected(d, args.occurred_at)
      : applyArrivalReported(d, args.occurred_at);

    // Repetição do mesmo fato não vira segundo evento no log.
    if (updated === d) {
      const same: TripAggregate = { trip: rec.trip, deliveries: map };
      return { ok: true, trip: same };
    }

    map.set(args.delivery_id, updated);
    const event_type = detected ? "arrival_detected" : "arrival_reported";
    log.append({
      object_type: "delivery",
      object_id: args.delivery_id,
      event_type,
      occurred_at: args.occurred_at,
      origin: detected ? "system" : "device",
      actor_id: args.actor.actor_id,
      idempotency_key: `${event_type}:${args.delivery_id}:${args.occurred_at}`,
      payload: {
        source: args.source,
        confirms_delivery: false,
        arrival_provenance: arrivalProvenance(updated),
      },
    });
    const agg: TripAggregate = { trip: rec.trip, deliveries: map };
    await this.saveAgg(agg, rec.version, log);
    return { ok: true, trip: agg };
  }

  private async confirmDelivery(
    cmd: Extract<Command, { type: "ConfirmDelivery" }>,
  ): Promise<AppResult> {
    assertCan(cmd.actor, "delivery_confirm");
    const rec = await this.uow.trips.get(cmd.trip_id);
    if (!rec) return { ok: false, error: "Trip não encontrada", code: "NOT_FOUND" };
    const log = new InMemoryEventLog();
    const map = new Map(rec.deliveries.map((d) => [d.delivery_id, d]));
    const d = map.get(cmd.delivery_id);
    if (!d) return { ok: false, error: "Delivery não encontrada", code: "NOT_FOUND" };
    const updated = applyDeliveryConfirmed(d, {
      origin: "device",
      actor_id: cmd.actor.actor_id,
      payload: {},
      occurred_at: cmd.occurred_at,
    });
    map.set(cmd.delivery_id, updated);
    log.append({
      object_type: "delivery",
      object_id: cmd.delivery_id,
      event_type: "delivery_confirmed",
      occurred_at: cmd.occurred_at,
      origin: "device",
      actor_id: cmd.actor.actor_id,
      idempotency_key: `delivery_confirmed:${cmd.delivery_id}`,
      payload: {},
    });
    const agg: TripAggregate = { trip: rec.trip, deliveries: map };
    await this.saveAgg(agg, rec.version, log);
    return { ok: true, trip: agg };
  }

  private async customerNotFound(
    cmd: Extract<Command, { type: "RecordCustomerNotFound" }>,
  ): Promise<AppResult> {
    assertCan(cmd.actor, "delivery_confirm");
    const rec = await this.uow.trips.get(cmd.trip_id);
    if (!rec) return { ok: false, error: "Trip não encontrada", code: "NOT_FOUND" };
    const log = new InMemoryEventLog();
    const map = new Map(rec.deliveries.map((d) => [d.delivery_id, d]));
    const d = map.get(cmd.delivery_id);
    if (!d || !d.active) {
      return { ok: false, error: "Delivery inválida", code: "PRECONDITION_FAILED" };
    }
    map.set(cmd.delivery_id, { ...d, state: "cliente_nao_encontrado" });
    log.append({
      object_type: "delivery",
      object_id: cmd.delivery_id,
      event_type: "customer_not_found",
      occurred_at: cmd.occurred_at,
      origin: "device",
      actor_id: cmd.actor.actor_id,
      idempotency_key: `customer_not_found:${cmd.delivery_id}`,
      payload: {},
    });
    const agg: TripAggregate = { trip: rec.trip, deliveries: map };
    await this.saveAgg(agg, rec.version, log);
    return { ok: true, trip: agg };
  }

  private async startReturn(
    cmd: Extract<Command, { type: "StartTripReturn" }>,
  ): Promise<AppResult> {
    assertCan(cmd.actor, "trip_return");
    const rec = await this.uow.trips.get(cmd.trip_id);
    if (!rec) return { ok: false, error: "Trip não encontrada", code: "NOT_FOUND" };
    const log = new InMemoryEventLog();
    const agg: TripAggregate = {
      trip: rec.trip,
      deliveries: new Map(rec.deliveries.map((d) => [d.delivery_id, d])),
    };
    const r = startReturn(log, agg, cmd.occurred_at, cmd.actor.actor_id, this.policy);
    if (!r.ok) return { ok: false, error: r.error.message, code: r.error.code };
    await this.saveAgg(r.state, rec.version, log);
    return { ok: true, trip: r.state };
  }

  private async detectReturn(
    cmd: Extract<Command, { type: "DetectReturn" }>,
  ): Promise<AppResult> {
    assertCan(cmd.actor, "trip_return");
    const e = cmd.evidence;
    // Pré-condições COR return_detected (simplificado F0/3B.1)
    if (!e.in_store_geofence || !e.gps_recent) {
      return {
        ok: false,
        error: "Evidência de retorno insuficiente",
        code: "PRECONDITION_FAILED",
      };
    }
    if (e.accuracy_error_m > e.max_horizontal_accuracy_m) {
      return {
        ok: false,
        error: "GPS accuracy acima do limite",
        code: "PRECONDITION_FAILED",
      };
    }
    if (e.dwell_s < e.min_dwell_s) {
      return {
        ok: false,
        error: "Dwell insuficiente",
        code: "PRECONDITION_FAILED",
      };
    }
    if (e.speed_mps > e.max_speed_mps) {
      return {
        ok: false,
        error: "Velocidade acima do limite",
        code: "PRECONDITION_FAILED",
      };
    }
    const rec = await this.uow.trips.get(cmd.trip_id);
    if (!rec) return { ok: false, error: "Trip não encontrada", code: "NOT_FOUND" };
    const log = new InMemoryEventLog();
    const agg: TripAggregate = {
      trip: rec.trip,
      deliveries: new Map(rec.deliveries.map((d) => [d.delivery_id, d])),
    };
    const r = closeTripAutomatic(log, agg, cmd.occurred_at, this.policy, {
      ...e,
    });
    if (!r.ok) return { ok: false, error: r.error.message, code: r.error.code };
    await this.saveAgg(r.state, rec.version, log);
    return { ok: true, trip: r.state };
  }

  private async closeManual(
    cmd: Extract<Command, { type: "CloseTripManually" }>,
  ): Promise<AppResult> {
    assertCan(cmd.actor, "trip_close_manual");
    const rec = await this.uow.trips.get(cmd.trip_id);
    if (!rec) return { ok: false, error: "Trip não encontrada", code: "NOT_FOUND" };
    const log = new InMemoryEventLog();
    const agg: TripAggregate = {
      trip: rec.trip,
      deliveries: new Map(rec.deliveries.map((d) => [d.delivery_id, d])),
    };
    const r = closeTripManual(
      log,
      agg,
      cmd.occurred_at,
      cmd.actor.actor_id,
      cmd.reason,
      MANUAL_CLOSE_ROLES,
      cmd.actor.role === "lider_delivery" || cmd.actor.role === "gerente"
        ? cmd.actor.role
        : cmd.actor.role,
    );
    // closeTripManual checks authorizedRoles includes actorRole string - we pass role
    if (!r.ok) return { ok: false, error: r.error.message, code: r.error.code };
    await this.saveAgg(r.state, rec.version, log);
    return { ok: true, trip: r.state };
  }

  private async startHandoff(
    cmd: Extract<Command, { type: "StartHandoff" }>,
  ): Promise<AppResult> {
    assertCan(cmd.actor, "handoff");
    const log = new InMemoryEventLog();
    const r = createHandoff(log, {
      handoff_id: cmd.handoff_id,
      unit_id: cmd.unit_id,
      external_order_ref: cmd.external_order_ref,
      occurred_at: cmd.occurred_at,
      created_by: cmd.actor.actor_id,
    });
    if (!r.ok) return { ok: false, error: r.error.message, code: r.error.code };
    await this.uow.handoffs.save(r.state, 1, null);
    await this.uow.events.append(log.all());
    for (const de of log.all()) {
      const pub = domainEventToPublic(de, {
        unit_id: cmd.unit_id,
        correlation_id: cmd.handoff_id,
      });
      if (!pub) continue;
      await this.uow.outbox.enqueue({
        outbox_id: `obx_${randomUUID()}`,
        event: pub,
        status: "pending",
        attempts: 0,
        created_at: new Date().toISOString(),
      });
    }
    await this.uow.commit();
    return { ok: true, handoff: r.state };
  }

  private async confirmHandoffCmd(
    cmd: Extract<Command, { type: "ConfirmHandoff" }>,
  ): Promise<AppResult> {
    assertCan(cmd.actor, "handoff");
    // Campo impresso "Entregador" NÃO atribui rider / não cria trip
    void cmd.printed_entregador_field;
    const rec = await this.uow.handoffs.get(cmd.handoff_id);
    if (!rec) return { ok: false, error: "Handoff não encontrado", code: "NOT_FOUND" };
    const log = new InMemoryEventLog();
    let h = rec.handoff;
    if (cmd.external_courier_ref) {
      const arr = markCourierArrived(
        log,
        h,
        cmd.occurred_at,
        cmd.actor.actor_id,
        cmd.external_courier_ref,
      );
      if (arr.ok) h = arr.state;
    }
    const r = confirmHandoff(log, h, {
      occurred_at: cmd.occurred_at,
      conference_actor: cmd.conference_actor,
      handoff_actor: cmd.handoff_actor,
      courier_verified: cmd.courier_verified,
      courier_verification_method: cmd.courier_verification_method,
      external_courier_ref: cmd.external_courier_ref,
      volumes: cmd.volumes,
      order_identified: cmd.order_identified,
    });
    if (!r.ok) return { ok: false, error: r.error.message, code: r.error.code };
    await this.uow.handoffs.save(r.state, rec.version + 1, rec.version);
    await this.uow.events.append(log.all());
    for (const de of log.all()) {
      const pub = domainEventToPublic(de, {
        unit_id: cmd.unit_id,
        correlation_id: cmd.handoff_id,
      });
      if (!pub) continue;
      await this.uow.outbox.enqueue({
        outbox_id: `obx_${randomUUID()}`,
        event: pub,
        status: "pending",
        attempts: 0,
        created_at: new Date().toISOString(),
      });
    }
    await this.uow.commit();
    return { ok: true, handoff: r.state };
  }

  private async createOcc(
    cmd: Extract<Command, { type: "CreateOccurrence" }>,
  ): Promise<AppResult> {
    assertCan(cmd.actor, "occurrence_open");
    const log = new InMemoryEventLog();
    const occ = openOccurrence(log, {
      occurrence_id: cmd.occurrence_id,
      unit_id: cmd.unit_id,
      type: cmd.occurrence_type,
      source_channel: "ops",
      report: cmd.report,
      owner_role: cmd.actor.role,
      opened_by: cmd.actor.actor_id,
      occurred_at: cmd.occurred_at,
      blocks_availability: cmd.blocks_availability,
      related_trip_id: cmd.related_trip_id,
      related_delivery_id: cmd.related_delivery_id,
    });
    await this.uow.occurrences.save(occ, null);
    if (cmd.blocks_availability && cmd.related_trip_id) {
      const trip = await this.uow.trips.get(cmd.related_trip_id);
      if (trip) {
        let rider = await this.uow.riders.get(trip.trip.courier_actor_id);
        if (rider) {
          const v = rider.version;
          rider = setOccurrenceBlocking(rider, true, cmd.occurred_at);
          await this.uow.riders.save(rider, v);
        }
      }
    }
    await this.uow.events.append(log.all());
    await this.uow.commit();
    return { ok: true, occurrence: occ };
  }

  private async resolveOcc(
    cmd: Extract<Command, { type: "ResolveOccurrence" }>,
  ): Promise<AppResult> {
    assertCan(cmd.actor, "occurrence_close");
    const cur = await this.uow.occurrences.get(cmd.occurrence_id);
    if (!cur) return { ok: false, error: "Occurrence não encontrada", code: "NOT_FOUND" };
    const log = new InMemoryEventLog();
    const occ = resolveOccurrence(log, cur, {
      closed_by: cmd.actor.actor_id,
      occurred_at: cmd.occurred_at,
      state: cmd.state,
      executed_action: cmd.executed_action,
      evidence: cmd.evidence,
    });
    await this.uow.occurrences.save(occ, cur.version);
    if (cur.blocks_availability && cur.related_trip_id) {
      const trip = await this.uow.trips.get(cur.related_trip_id);
      if (trip) {
        let rider = await this.uow.riders.get(trip.trip.courier_actor_id);
        if (rider) {
          const v = rider.version;
          rider = setOccurrenceBlocking(rider, false, cmd.occurred_at);
          await this.uow.riders.save(rider, v);
        }
      }
    }
    await this.uow.events.append(log.all());
    await this.uow.commit();
    return { ok: true, occurrence: occ };
  }

  private async setPause(
    cmd: Extract<Command, { type: "SetRiderPause" }>,
  ): Promise<AppResult> {
    requireActor(cmd.actor);
    let rider = await this.uow.riders.get(cmd.rider_id);
    if (!rider) {
      rider = createRiderState(cmd.rider_id, cmd.unit_id, cmd.occurred_at);
    }
    const v = rider.version;
    rider = setRiderAvailability(
      rider,
      cmd.paused ? "pausa" : "disponivel",
      cmd.occurred_at,
    );
    await this.uow.riders.save(rider, rider.version === 1 ? null : v);
    await this.uow.commit();
    return { ok: true, rider };
  }

  private async setSupport(
    cmd: Extract<Command, { type: "SetRiderSupport" }>,
  ): Promise<AppResult> {
    requireActor(cmd.actor);
    let rider = await this.uow.riders.get(cmd.rider_id);
    if (!rider) {
      rider = createRiderState(cmd.rider_id, cmd.unit_id, cmd.occurred_at);
    }
    const v = rider.version;
    rider = setRiderAvailability(
      rider,
      cmd.support ? "apoio_expedicao" : "disponivel",
      cmd.occurred_at,
    );
    await this.uow.riders.save(rider, rider.version === 1 ? null : v);
    await this.uow.commit();
    return { ok: true, rider };
  }

  private async returnRequested(
    cmd: Extract<Command, { type: "RecordReturnRequested" }>,
  ): Promise<AppResult> {
    assertCan(cmd.actor, "delivery_confirm");
    const rec = await this.uow.trips.get(cmd.trip_id);
    if (!rec) return { ok: false, error: "Trip não encontrada", code: "NOT_FOUND" };
    const log = new InMemoryEventLog();
    const map = new Map(rec.deliveries.map((d) => [d.delivery_id, d]));
    const d = map.get(cmd.delivery_id);
    if (!d) return { ok: false, error: "Delivery não encontrada", code: "NOT_FOUND" };
    map.set(cmd.delivery_id, { ...d, state: "retorno_solicitado" });
    log.append({
      object_type: "delivery",
      object_id: cmd.delivery_id,
      event_type: "return_requested",
      occurred_at: cmd.occurred_at,
      origin: "device",
      actor_id: cmd.actor.actor_id,
      idempotency_key: `return_requested:${cmd.delivery_id}`,
      payload: {},
    });
    const agg = { trip: rec.trip, deliveries: map };
    await this.saveAgg(agg, rec.version, log);
    return { ok: true, trip: agg };
  }

  private async cancelDelivery(
    cmd: Extract<Command, { type: "CancelDelivery" }>,
  ): Promise<AppResult> {
    assertCan(cmd.actor, "trip_mutate");
    const rec = await this.uow.trips.get(cmd.trip_id);
    if (!rec) return { ok: false, error: "Trip não encontrada", code: "NOT_FOUND" };
    const log = new InMemoryEventLog();
    const map = new Map(rec.deliveries.map((d) => [d.delivery_id, d]));
    const d = map.get(cmd.delivery_id);
    if (!d) return { ok: false, error: "Delivery não encontrada", code: "NOT_FOUND" };
    map.set(cmd.delivery_id, {
      ...d,
      state: "cancelada",
      cancelled_reason: cmd.reason,
      active: true,
    });
    log.append({
      object_type: "delivery",
      object_id: cmd.delivery_id,
      event_type: "delivery_cancelled",
      occurred_at: cmd.occurred_at,
      origin: "ops_console",
      actor_id: cmd.actor.actor_id,
      idempotency_key: `delivery_cancelled:${cmd.delivery_id}`,
      payload: { reason: cmd.reason },
    });
    const agg = { trip: rec.trip, deliveries: map };
    await this.saveAgg(agg, rec.version, log);
    return { ok: true, trip: agg };
  }

  private async assignRider(
    cmd: Extract<Command, { type: "AssignInternalRider" }>,
  ): Promise<AppResult> {
    assertCan(cmd.actor, "trip_mutate");
    const rec = await this.uow.trips.get(cmd.trip_id);
    if (!rec) return { ok: false, error: "Trip não encontrada", code: "NOT_FOUND" };
    if (rec.trip.state !== "preparando_saida") {
      return {
        ok: false,
        error: "Só reatribui em preparando_saida",
        code: "INVALID_TRANSITION",
      };
    }
    const log = new InMemoryEventLog();
    const trip = { ...rec.trip, courier_actor_id: cmd.courier_actor_id };
    const agg: TripAggregate = {
      trip,
      deliveries: new Map(rec.deliveries.map((d) => [d.delivery_id, d])),
    };
    log.append({
      object_type: "trip",
      object_id: cmd.trip_id,
      event_type: "trip_created",
      occurred_at: cmd.occurred_at,
      origin: "ops_console",
      actor_id: cmd.actor.actor_id,
      idempotency_key: `rider_assigned:${cmd.trip_id}:${cmd.courier_actor_id}`,
      payload: {
        courier_actor_id: cmd.courier_actor_id,
        note: "assign_internal_rider",
      },
    });
    await this.saveAgg(agg, rec.version, log);
    return { ok: true, trip: agg };
  }
}
