/**
 * Facade do piloto: ApplicationService + FileUnitOfWork + sessão por token.
 * Sem seed de demo. Persistência single-instance local.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createPilotPolicy } from "../foundation/policy";
import { openFileUnitOfWork, FileUnitOfWork } from "../persistence/file-store";
import { EntregasApplicationService, type AppResult } from "../operational/application-service";
import type { ActorContext, OperationalRole } from "../operational/auth";
import type { Command } from "../operational/commands";
import type { TripAggregate } from "../foundation/trip-machine";
import type { Handoff } from "../foundation/types";
import type { Occurrence } from "../operational/occurrence";
import type { RiderOperationalState } from "../operational/rider-state";
import type { PilotConfig } from "./pilot-config";
import { resolveBanner, findUserByToken } from "./pilot-config";
import type { PilotLogger } from "./pilot-log";

export interface PilotSnapshot {
  mode: "pilot";
  banner: string;
  demo_banner: string; // reutilizado pela UI existente
  module_name: "ENTREGAS";
  brand_provisional: "TATA";
  unit_id: string;
  unit_name: string;
  timezone: string;
  policy: { max_stops: number; policy_bundle_id: string };
  actor: ActorContext | null;
  session_required: true;
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
  ready_orders: Array<{ order_ref: string; label: string; channel?: string }>;
  connection: "online" | "offline" | "syncing";
  pending_sync: number;
  last_error: string | null;
  last_human_error: string | null;
  features: PilotConfig["features"];
}

interface ReadyStore {
  orders: Array<{ order_ref: string; label: string; channel?: string; created_at: string }>;
}

export class PilotApplicationFacade {
  private uow: FileUnitOfWork;
  private svc: EntregasApplicationService;
  private actor: ActorContext | null = null;
  private last_error: string | null = null;
  private last_human_error: string | null = null;
  private tripCache = new Map<string, TripAggregate>();
  private handoffCache = new Map<string, Handoff>();
  private occCache = new Map<string, Occurrence>();
  private riderCache = new Map<string, RiderOperationalState>();
  private commandIds = new Set<string>();
  private dataFile: string;
  private readyFile: string;

  constructor(
    private readonly cfg: PilotConfig,
    private readonly log: PilotLogger,
  ) {
    mkdirSync(cfg.data_dir, { recursive: true });
    this.dataFile = join(cfg.data_dir, "store.json");
    this.readyFile = join(cfg.data_dir, "ready_orders.json");
    if (!existsSync(this.readyFile)) {
      writeFileSync(
        this.readyFile,
        JSON.stringify({ orders: [] } satisfies ReadyStore),
        "utf8",
      );
    }
    const policy = createPilotPolicy({ max_stops: cfg.max_stops });
    this.uow = openFileUnitOfWork(this.dataFile);
    this.svc = new EntregasApplicationService(this.uow, policy);
    this.hydrateFromDisk();
  }

  private hydrateFromDisk(): void {
    try {
      if (!existsSync(this.dataFile)) return;
      const data = JSON.parse(readFileSync(this.dataFile, "utf8")) as {
        trips?: Record<string, { trip: { trip_id: string }; deliveries: Record<string, unknown> }>;
        handoffs?: Record<string, { handoff: Handoff }>;
        occurrences?: Record<string, Occurrence>;
        riders?: Record<string, RiderOperationalState>;
      };
      // caches parciais: recarregados ao executar; snapshot usa uow após load
      void data;
    } catch (e) {
      this.log.error(
        "persistence_error",
        "Falha ao ler dados salvos.",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  /** Reinicia UoW a partir do arquivo (após restore) */
  reloadStore(): void {
    this.uow = openFileUnitOfWork(this.dataFile);
    this.svc = new EntregasApplicationService(
      this.uow,
      createPilotPolicy({ max_stops: this.cfg.max_stops }),
    );
    this.tripCache.clear();
    this.handoffCache.clear();
    this.occCache.clear();
    this.riderCache.clear();
    this.hydrateFromDisk();
  }

  get dataPath(): string {
    return this.dataFile;
  }

  login(token: string): { ok: boolean; human: string; actor?: ActorContext } {
    const user = findUserByToken(this.cfg, token);
    if (!user) {
      this.log.warn("session_rejected", "Token inválido. Peça um acesso ao responsável pelo piloto.");
      return {
        ok: false,
        human: "Acesso não autorizado. Use o token fornecido pelo responsável pelo piloto.",
      };
    }
    this.actor = { actor_id: user.actor_id, role: user.role };
    this.log.info("session_login", `${user.label} entrou no piloto.`, undefined, {
      actor_id: user.actor_id,
    });
    return { ok: true, human: `Olá, ${user.label}.`, actor: this.actor };
  }

  logout(): void {
    this.actor = null;
  }

  getActor(): ActorContext | null {
    return this.actor;
  }

  private loadReady(): ReadyStore {
    try {
      return JSON.parse(readFileSync(this.readyFile, "utf8")) as ReadyStore;
    } catch {
      return { orders: [] };
    }
  }

  private saveReady(s: ReadyStore): void {
    writeFileSync(this.readyFile, JSON.stringify(s, null, 2), "utf8");
  }

  registerReadyOrder(order_ref: string, label: string, channel?: string): { ok: boolean; human: string } {
    if (!this.actor) {
      return { ok: false, human: "É preciso entrar com seu acesso antes." };
    }
    if (!["operador_expedicao", "lider_delivery", "gerente"].includes(this.actor.role)) {
      this.log.warn("auth_failed", "Sem permissão para registrar pedido.", this.actor.role, {
        actor_id: this.actor.actor_id,
      });
      return { ok: false, human: "Seu perfil não pode registrar pedidos prontos." };
    }
    const store = this.loadReady();
    if (store.orders.some((o) => o.order_ref === order_ref)) {
      this.log.warn("duplicate_order", "Pedido já estava na fila de prontos.", order_ref);
      return { ok: false, human: "Este pedido já está na lista de prontos." };
    }
    store.orders.push({
      order_ref,
      label,
      channel,
      created_at: new Date().toISOString(),
    });
    this.saveReady(store);
    return { ok: true, human: `Pedido ${order_ref} na fila de prontos.` };
  }

  async execute(cmd: Command | Record<string, unknown>): Promise<AppResult> {
    if (!this.actor) {
      this.last_human_error = "É preciso entrar com seu acesso antes de agir.";
      this.last_error = "NO_SESSION";
      this.log.warn("auth_failed", this.last_human_error);
      return { ok: false, error: this.last_human_error, code: "NO_SESSION" };
    }

    const command_id = String((cmd as { command_id?: string }).command_id || "");
    if (command_id && this.commandIds.has(command_id)) {
      this.last_human_error = "Esta ação já foi registrada. Não envie de novo.";
      this.last_error = "DUPLICATE_COMMAND";
      this.log.warn("conflict", this.last_human_error, command_id, {
        actor_id: this.actor.actor_id,
      });
      return { ok: false, error: this.last_human_error, code: "DUPLICATE_COMMAND" };
    }

    const full = {
      ...cmd,
      actor: (cmd as { actor?: ActorContext }).actor ?? this.actor,
      unit_id: (cmd as { unit_id?: string }).unit_id ?? this.cfg.unit_id,
    } as Command;

    try {
      const result = await this.svc.execute(full);
      if (!result.ok) {
        this.last_error = result.error ?? "rejeitado";
        this.last_human_error = result.error ?? "Ação não concluída.";
        this.log.warn(
          "command_failed",
          this.last_human_error,
          result.code || result.error,
          { actor_id: this.actor.actor_id, meta: { type: full.type } },
        );
        if (/já|duplic|terminal|repassado/i.test(result.error || "")) {
          if (full.type === "ConfirmHandoff") {
            this.log.warn("duplicate_ifood_release", this.last_human_error);
          }
          if (full.type === "ConfirmDelivery") {
            this.log.warn("duplicate_delivery", this.last_human_error);
          }
        }
        return result;
      }
      if (command_id) this.commandIds.add(command_id);
      this.last_error = null;
      this.last_human_error = null;
      if (result.trip) {
        this.tripCache.set(result.trip.trip.trip_id, result.trip);
        const used = new Set(
          [...result.trip.deliveries.values()].map((d) => d.order_ref),
        );
        const ready = this.loadReady();
        ready.orders = ready.orders.filter((o) => !used.has(o.order_ref));
        this.saveReady(ready);
      }
      if (result.handoff) this.handoffCache.set(result.handoff.handoff_id, result.handoff);
      if (result.occurrence)
        this.occCache.set(result.occurrence.occurrence_id, result.occurrence);
      if (result.rider) this.riderCache.set(result.rider.rider_id, result.rider);
      this.log.info("command_ok", `Ação ${full.type} concluída.`, undefined, {
        actor_id: this.actor.actor_id,
        meta: { type: full.type, command_id },
      });
      return result;
    } catch (e) {
      const technical = e instanceof Error ? e.message : String(e);
      this.last_error = technical;
      this.last_human_error = "Não foi possível concluir a ação. Tente de novo ou avise o responsável.";
      this.log.error("command_failed", this.last_human_error, technical, {
        actor_id: this.actor.actor_id,
      });
      if (/version conflict|Concurrency/i.test(technical)) {
        this.log.warn("conflict", "Conflito de versão nos dados.", technical);
      }
      if (/persist|ENOENT|EPERM|JSON/i.test(technical)) {
        this.log.error("persistence_error", "Problema ao gravar dados.", technical);
      }
      return { ok: false, error: this.last_human_error, code: "EXCEPTION" };
    }
  }

  async snapshot(): Promise<PilotSnapshot> {
    // reconstruir trips do cache + uow conhecidos
    const tripIds = new Set(this.tripCache.keys());
    try {
      if (existsSync(this.dataFile)) {
        const data = JSON.parse(readFileSync(this.dataFile, "utf8")) as {
          trips?: Record<string, unknown>;
          handoffs?: Record<string, { handoff: Handoff }>;
          occurrences?: Record<string, Occurrence>;
          riders?: Record<string, RiderOperationalState>;
        };
        Object.keys(data.trips || {}).forEach((id) => tripIds.add(id));
        for (const [id, h] of Object.entries(data.handoffs || {})) {
          this.handoffCache.set(id, h.handoff);
        }
        for (const [id, o] of Object.entries(data.occurrences || {})) {
          this.occCache.set(id, o);
        }
        for (const [id, r] of Object.entries(data.riders || {})) {
          this.riderCache.set(id, r);
        }
      }
    } catch {
      /* */
    }

    const trips = [];
    for (const id of tripIds) {
      let agg = this.tripCache.get(id);
      if (!agg) {
        const rec = await this.uow.trips.get(id);
        if (rec) {
          const map = new Map(
            (rec.deliveries || []).map((d) => [d.delivery_id, d] as const),
          );
          agg = { trip: rec.trip, deliveries: map };
          this.tripCache.set(id, agg);
        }
      }
      if (!agg) continue;
      trips.push({
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
      });
    }

    const banner = resolveBanner(this.cfg);
    const ready = this.loadReady();

    return {
      mode: "pilot",
      banner,
      demo_banner: banner,
      module_name: "ENTREGAS",
      brand_provisional: "TATA",
      unit_id: this.cfg.unit_id,
      unit_name: this.cfg.unit_name,
      timezone: this.cfg.timezone,
      policy: {
        max_stops: this.cfg.max_stops,
        policy_bundle_id: `pilot-${this.cfg.unit_id}`,
      },
      actor: this.actor,
      session_required: true,
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
      ready_orders: ready.orders.map((o) => ({
        order_ref: o.order_ref,
        label: o.label,
        channel: o.channel,
      })),
      connection: "online",
      pending_sync: 0,
      last_error: this.last_error,
      last_human_error: this.last_human_error,
      features: this.cfg.features,
    };
  }
}
