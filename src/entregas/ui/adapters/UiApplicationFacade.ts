/**
 * Facade de UI → EntregasApplicationService.
 * Proibido: adapter de arquivo durável, repositories, event store, máquina de estados no front.
 */
import { createPilotPolicy, type PilotPolicy } from "../../foundation/policy";
import { asInternalRiderActorId, asExternalCourierRef } from "../../foundation/brands";
import { MemoryUnitOfWork } from "../../persistence/memory-uow";
import { EntregasApplicationService } from "../../operational/application-service";
import type { ActorContext, OperationalRole } from "../../operational/auth";
import type { Command } from "../../operational/commands";
import type { AppResult } from "../../operational/application-service";
import type { TripAggregate } from "../../foundation/trip-machine";
import type { Handoff } from "../../foundation/types";
import type { Occurrence } from "../../operational/occurrence";
import type { RiderOperationalState } from "../../operational/rider-state";

export interface UiSnapshot {
  demo_banner: "AMBIENTE DE DEMONSTRAÇÃO";
  module_name: "ENTREGAS";
  brand_provisional: "TATA";
  policy: { max_stops: number; policy_bundle_id: string };
  actor: ActorContext;
  trips: Array<{
    trip_id: string;
    state: string;
    courier_actor_id: string;
    deliveries: Array<{
      delivery_id: string;
      order_ref: string;
      state: string;
      active: boolean;
      planned_stop_order: number;
    }>;
  }>;
  handoffs: Array<{
    handoff_id: string;
    external_order_ref: string;
    state: string;
    confirmed: boolean;
    courier_verified: boolean;
  }>;
  occurrences: Array<{
    occurrence_id: string;
    state: string;
    report: string;
    blocks_availability: boolean;
  }>;
  riders: Array<{
    rider_id: string;
    availability: string;
    occurrence_blocking_availability: boolean;
    active_trip_id?: string;
  }>;
  ready_orders: Array<{ order_ref: string; label: string }>;
  connection: "online" | "offline" | "syncing";
  pending_sync: number;
  last_error: string | null;
}

/**
 * Demo facade em memória — simula sessão de UI sem escrita durável de arquivo.
 * Toda mutação passa por ApplicationService.execute(command).
 */
export class UiApplicationFacade {
  readonly demo_banner = "AMBIENTE DE DEMONSTRAÇÃO" as const;
  private uow: MemoryUnitOfWork;
  private svc: EntregasApplicationService;
  private policy: PilotPolicy;
  private actor: ActorContext;
  private connection: "online" | "offline" | "syncing" = "online";
  private pending_sync = 0;
  private last_error: string | null = null;
  private ready_orders: Array<{ order_ref: string; label: string }> = [];
  /** cache de snapshots pós-comando */
  private tripCache = new Map<string, TripAggregate>();
  private handoffCache = new Map<string, Handoff>();
  private occCache = new Map<string, Occurrence>();
  private riderCache = new Map<string, RiderOperationalState>();

  constructor(policy?: PilotPolicy) {
    this.policy = policy ?? createPilotPolicy({ max_stops: 5 });
    this.uow = new MemoryUnitOfWork();
    this.svc = new EntregasApplicationService(this.uow, this.policy);
    this.actor = { actor_id: "ops-demo", role: "operador_expedicao" };
  }

  setActor(actor_id: string, role: OperationalRole): void {
    this.actor = { actor_id, role };
  }

  setConnection(c: "online" | "offline" | "syncing"): void {
    this.connection = c;
  }

  getPolicyMaxStops(): number {
    return this.policy.max_stops;
  }

  seedDemo(): void {
    this.ready_orders = [
      { order_ref: "P-101", label: "Pedido P-101 · Pinheiros" },
      { order_ref: "P-102", label: "Pedido P-102 · Itaim" },
      { order_ref: "P-103", label: "Pedido P-103 · Vila Olímpia" },
      { order_ref: "P-104", label: "Pedido P-104 · Jardins" },
      { order_ref: "IF-9001", label: "iFood IF-9001 (expedição)" },
    ];
  }

  async execute(cmd: Command | Record<string, unknown>): Promise<AppResult> {
    if (this.connection === "offline") {
      this.pending_sync += 1;
      this.last_error = null;
      // ainda tenta domínio local (demo offline = fila visual)
    }
    const full = {
      ...cmd,
      actor: (cmd as { actor?: ActorContext }).actor ?? this.actor,
    } as Command;
    const result = await this.svc.execute(full);
    if (!result.ok) {
      this.last_error = result.error ?? "rejeitado";
      return result;
    }
    this.last_error = null;
    if (result.trip) this.tripCache.set(result.trip.trip.trip_id, result.trip);
    if (result.handoff) this.handoffCache.set(result.handoff.handoff_id, result.handoff);
    if (result.occurrence)
      this.occCache.set(result.occurrence.occurrence_id, result.occurrence);
    if (result.rider) this.riderCache.set(result.rider.rider_id, result.rider);
    if (this.connection === "offline") {
      /* pending already counted */
    } else if (this.pending_sync > 0 && this.connection === "online") {
      this.connection = "syncing";
      this.pending_sync = Math.max(0, this.pending_sync - 1);
      this.connection = "online";
    }
    return result;
  }

  async snapshot(): Promise<UiSnapshot> {
    const trips = [...this.tripCache.values()].map((agg) => ({
      trip_id: agg.trip.trip_id,
      state: agg.trip.state,
      courier_actor_id: String(agg.trip.courier_actor_id),
      deliveries: [...agg.deliveries.values()]
        .sort((a, b) => a.planned_stop_order - b.planned_stop_order)
        .map((d) => ({
          delivery_id: d.delivery_id,
          order_ref: d.order_ref,
          state: d.state,
          active: d.active,
          planned_stop_order: d.planned_stop_order,
        })),
    }));
    return {
      demo_banner: "AMBIENTE DE DEMONSTRAÇÃO",
      module_name: "ENTREGAS",
      brand_provisional: "TATA",
      policy: {
        max_stops: this.policy.max_stops,
        policy_bundle_id: this.policy.policy_bundle_id,
      },
      actor: this.actor,
      trips,
      handoffs: [...this.handoffCache.values()].map((h) => ({
        handoff_id: h.handoff_id,
        external_order_ref: h.external_order_ref,
        state: h.state,
        confirmed: h.confirmed,
        courier_verified: h.courier_verified,
      })),
      occurrences: [...this.occCache.values()].map((o) => ({
        occurrence_id: o.occurrence_id,
        state: o.state,
        report: o.report,
        blocks_availability: o.blocks_availability,
      })),
      riders: [...this.riderCache.values()].map((r) => ({
        rider_id: String(r.rider_id),
        availability: r.availability,
        occurrence_blocking_availability: r.occurrence_blocking_availability,
        active_trip_id: r.active_trip_id,
      })),
      ready_orders: this.ready_orders,
      connection: this.connection,
      pending_sync: this.pending_sync,
      last_error: this.last_error,
    };
  }

  // helpers de comando tipados para a UI
  asRider(id: string) {
    return asInternalRiderActorId(id);
  }
  asCourierRef(id: string) {
    return asExternalCourierRef(id);
  }
}
