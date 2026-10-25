/**
 * Facade do piloto: ApplicationService + UnitOfWork injetável + sessão por token.
 * O backend arquivo continua default; a facade não conhece mais o formato do store.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { canonicalInboundFingerprint, type DurableInboundReceipt } from "../persistence/inbound-receipt";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createPilotPolicy } from "../foundation/policy";
import type { UnitOfWork } from "../persistence/ports";
import {
  createFilePilotUnitOfWorkSource,
  type PilotUnitOfWorkSource,
} from "./pilot-storage";
import {
  createFilePilotReadyOrderStore,
  type PilotReadyOrderStore,
} from "./ready-orders";
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

// Narrowing do valor persistido: strings arbitrarias nunca viram Channel.
function canalProprioValidado(v: string | undefined): "proprio" | "app" | undefined {
  return v === "proprio" || v === "app" ? v : undefined;
}

export class PilotApplicationFacade {
  private uow: UnitOfWork;
  private readonly storage: PilotUnitOfWorkSource;
  private svc: EntregasApplicationService;
  /** Legacy non-HTTP access, never authority for concurrent requests. */
  private actor: ActorContext | null = null;
  private readonly actorScope = new AsyncLocalStorage<{ readonly actor: ActorContext | null }>();
  private get activeActor(): ActorContext | null {
    const scope = this.actorScope.getStore();
    return scope === undefined ? this.actor : scope.actor;
  }
  /** Snapshot one identity for the entire asynchronous HTTP request. */
  withActor<T>(actor: ActorContext | null, work: () => Promise<T>): Promise<T> {
    const snapshot = actor ? Object.freeze({ ...actor }) : null;
    return this.actorScope.run({ actor: snapshot }, work);
  }
  private last_error: string | null = null;
  private last_human_error: string | null = null;
  private tripCache = new Map<string, TripAggregate>();
  private handoffCache = new Map<string, Handoff>();
  private occCache = new Map<string, Occurrence>();
  private riderCache = new Map<string, RiderOperationalState>();
  private commandIds = new Set<string>();
  /** Serializacao intra-processo: FileUoW nao e seguro em escritas paralelas. */
  private commandTail: Promise<void> = Promise.resolve();
  private readonly readyOrders: PilotReadyOrderStore;

  constructor(
    private readonly cfg: PilotConfig,
    private readonly log: PilotLogger,
    storage?: PilotUnitOfWorkSource,
    readyOrders?: PilotReadyOrderStore,
  ) {
    mkdirSync(cfg.data_dir, { recursive: true });
    const defaultDataFile = join(cfg.data_dir, "store.json");
    this.storage =
      storage ?? createFilePilotUnitOfWorkSource(defaultDataFile);
    this.readyOrders =
      readyOrders ??
      createFilePilotReadyOrderStore(join(cfg.data_dir, "ready_orders.json"));
    const policy = createPilotPolicy({ max_stops: cfg.max_stops });
    this.uow = this.storage.open();
    this.svc = new EntregasApplicationService(this.uow, policy, cfg.source_mode);
  }

  /** Reabre o backend configurado (arquivo após restore; backend externo após reconnect). */
  reloadStore(): void {
    this.uow = this.storage.open();
    this.svc = new EntregasApplicationService(
      this.uow,
      createPilotPolicy({ max_stops: this.cfg.max_stops }),
      this.cfg.source_mode,
    );
    this.tripCache.clear();
    this.handoffCache.clear();
    this.occCache.clear();
    this.riderCache.clear();
  }

  get dataPath(): string {
    if (!this.storage.dataPath) {
      throw new Error(
        "backup/restore de arquivo indisponível para este backend de persistência",
      );
    }
    return this.storage.dataPath;
  }

  get supportsFileBackup(): boolean {
    return Boolean(this.storage.dataPath);
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
    const loginActor = { actor_id: user.actor_id, role: user.role };
    if (this.actorScope.getStore() === undefined) this.actor = loginActor;
    this.log.info("session_login", `${user.label} entrou no piloto.`, undefined, {
      actor_id: user.actor_id,
    });
    return { ok: true, human: `Olá, ${user.label}.`, actor: loginActor };
  }

  logout(): void {
    this.actor = null;
  }

  /**
   * Vincula o ator DESTA requisição — inclusive `null`.
   *
   * `login()` só sabe entrar; não sabe sair. Num servidor, isso significa que
   * uma requisição sem token herdaria o ator da requisição anterior, porque
   * `this.actor` continuava preenchido. Era o furo de sessão grudenta.
   *
   * `bindActor` é o oposto: ela é chamada em TODA requisição, e passar `null`
   * é um caso de uso normal, não um erro. Sem ator vinculado, a facade não
   * responde por ninguém.
   *
   * Não escreve log: acontece uma vez por requisição, e logar aqui encheria o
   * arquivo do piloto de ruído sem informação.
   */
  bindActor(actor: ActorContext | null): void {
    this.actor = actor;
  }

  getActor(): ActorContext | null {
    return this.activeActor;
  }

  /**
   * Leitura mínima para o controle nativo de captura.
   * A autoridade é o mesmo TripRepository que os comandos gravam.
   */
  async readTripCaptureState(trip_id: string): Promise<{
    trip_id: string;
    unit_id: string;
    courier_actor_id: string;
    state: string;
  } | null> {
    const rec = await this.uow.trips.get(trip_id);
    if (!rec) return null;
    return {
      trip_id: rec.trip.trip_id,
      unit_id: rec.trip.unit_id,
      courier_actor_id: String(rec.trip.courier_actor_id),
      state: rec.trip.state,
    };
  }

  async registerReadyOrder(
    order_ref: string,
    label: string,
    channel?: string,
  ): Promise<{ ok: boolean; human: string }> {
    if (!this.activeActor) {
      return { ok: false, human: "É preciso entrar com seu acesso antes." };
    }
    if (!["operador_expedicao", "lider_delivery", "gerente"].includes(this.activeActor.role)) {
      this.log.warn("auth_failed", "Sem permissão para registrar pedido.", this.activeActor.role, {
        actor_id: this.activeActor.actor_id,
      });
      return { ok: false, human: "Seu perfil não pode registrar pedidos prontos." };
    }
    const added = await this.readyOrders.add({
      order_ref,
      label,
      channel,
      created_at: new Date().toISOString(),
    });
    if (added.duplicate) {
      this.log.warn("duplicate_order", "Pedido já estava na fila de prontos.", order_ref);
      return { ok: false, human: "Este pedido já está na lista de prontos." };
    }
    return { ok: true, human: `Pedido ${order_ref} na fila de prontos.` };
  }

  // Legacy interface captures the actor at invocation, not after awaiting I/O.
  async execute(cmd: Command | Record<string, unknown>): Promise<AppResult> {
    return this.executeAs(this.activeActor, cmd);
  }

  // A identidade ja autenticada e capturada ANTES da espera pela fila.
  // Recibo opcional: somente a rota de eventos verificada deve fornece-lo.
  async executeAs(
    actor: ActorContext | null,
    cmd: Command | Record<string, unknown>,
    inbound?: { event_id: string; idempotency_key: string; device_id: string | null },
  ): Promise<AppResult> {
    const verifiedActor = actor ? Object.freeze({ ...actor }) : null;
    const previous = this.commandTail;
    let unlock!: () => void;
    this.commandTail = new Promise<void>((resolve) => { unlock = resolve; });
    await previous;
    try {
      return await this.executeAsSerial(verifiedActor, cmd, inbound);
    } finally {
      unlock();
    }
  }

  private async executeAsSerial(
    actor: ActorContext | null,
    cmd: Command | Record<string, unknown>,
    inbound?: { event_id: string; idempotency_key: string; device_id: string | null },
  ): Promise<AppResult> {
    if (!actor) {
      this.last_human_error = "É preciso entrar com seu acesso antes de agir.";
      this.last_error = "NO_SESSION";
      this.log.warn("auth_failed", this.last_human_error);
      return { ok: false, error: this.last_human_error, code: "NO_SESSION" };
    }

    const command_id = String((cmd as { command_id?: string }).command_id || "");
    if (!inbound && command_id && this.commandIds.has(command_id)) {
      this.last_human_error = "Esta ação já foi registrada. Não envie de novo.";
      this.last_error = "DUPLICATE_COMMAND";
      this.log.warn("conflict", this.last_human_error, command_id, {
        actor_id: actor.actor_id,
      });
      return { ok: false, error: this.last_human_error, code: "DUPLICATE_COMMAND" };
    }

    const full = {
      ...cmd,
      // Idempotency key vinda do envelope de evento validado pelo HTTP.
      ...(inbound ? { idempotency_key: inbound.idempotency_key } : {}),
      // A sessão é a autoridade. Actor e unidade vindos do corpo são dados
      // não confiáveis e nunca podem elevar papel nem atravessar unidade.
      actor: actor,
      unit_id: this.cfg.unit_id,
    } as Command;

    try {
      // A informacao de canal guardada na fila de pedidos prontos e mais
      // confiavel que o campo enviado pelo navegador. A interface legada
      // pode omitir channel, portanto o guarda do dominio isolado nao basta.
      let validated = full;
      if (full.type === "CreateTrip" || full.type === "AddDeliveryToTrip") {
        const stored = new Map(
          (await this.readyOrders.list()).map((o) => [o.order_ref, o.channel]),
        );
        const deliveries =
          full.type === "CreateTrip" ? full.deliveries : [full];
        for (const delivery of deliveries) {
          if (!stored.has(delivery.order_ref)) continue;
          const channel = stored.get(delivery.order_ref);
          if (
            channel !== undefined &&
            (channel !== "proprio" && channel !== "app" ||
              (delivery.channel !== undefined && delivery.channel !== channel))
          ) {
            this.last_error = "NON_OWN_ORDER_IN_TRIP";
            this.last_human_error =
              "Origem do pedido nao permite viagem de motoboy proprio. Confira a fila e use Handoff quando for courier externo.";
            return {
              ok: false,
              error: this.last_human_error,
              code: this.last_error,
            };
          }
        }
        if (full.type === "CreateTrip") {
          validated = {
            ...full,
            deliveries: full.deliveries.map((d) => ({
              ...d,
              channel: canalProprioValidado(stored.get(d.order_ref)) ?? d.channel,
            })),
          };
        } else {
          validated = {
            ...full,
            channel: canalProprioValidado(stored.get(full.order_ref)) ?? full.channel,
          };
        }
      }
      let service = this.svc;
      let receipt: DurableInboundReceipt | undefined;
      if (inbound) {
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(inbound.event_id) ||
            !/^[A-Za-z0-9_-]{1,128}$/.test(inbound.idempotency_key) ||
            !command_id || !/^[A-Za-z0-9_-]{1,128}$/.test(command_id)) {
          return { ok:false, code:"INVALID_EVENT_IDENTITY", error:"Identidade do evento invalida" };
        }
        // UoW propria do evento: recibo e dominio fazem commit juntos.
        // Neste piloto o backend file e monoprocesso; PG sem role RLS de
        // recibos nao deve conseguir confirmar evento.
        const transaction = this.storage.open();
        service = new EntregasApplicationService(
          transaction, createPilotPolicy({ max_stops: this.cfg.max_stops }),
          this.cfg.source_mode,
        );
        receipt = {
          unit_id: this.cfg.unit_id, event_id: inbound.event_id,
          idempotency_key: inbound.idempotency_key,
          actor_id: actor.actor_id, actor_role: actor.role,
          device_id: inbound.device_id,
          command_id, command_type: validated.type,
          fingerprint: canonicalInboundFingerprint({
            event_id: inbound.event_id,
            idempotency_key: inbound.idempotency_key,
            // O recibo identifica o comando ORIGINAL sob autoridade da
            // sessao. Nao incluir enriquecimento mutavel da fila readyOrders:
            // apos um commit, a fila pode ser consumida e o mesmo reenvio
            // precisa conservar o fingerprint do primeiro envio.
            command: full as unknown as Record<string, unknown>,
            unit_id: this.cfg.unit_id,
            actor_id: actor.actor_id, actor_role: actor.role,
            device_id: inbound.device_id,
          }),
          outcome: "applied", code: null, recorded_at: new Date().toISOString(),
        };
      }
      // Comando legado continua no servico da fachada, sem recibo artificial.
      // A rota HTTP usa a UoW exclusiva e um recibo atomico por evento.
      const result = inbound
        ? await service.execute(validated, receipt)
        : await this.svc.execute(validated);
      if (inbound) this.reloadStore();
      if (!result.ok) {
        this.last_error = result.error ?? "rejeitado";
        this.last_human_error = result.error ?? "Ação não concluída.";
        this.log.warn(
          "command_failed",
          this.last_human_error,
          result.code || result.error,
          { actor_id: actor.actor_id, meta: { type: full.type } },
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
      if (!inbound && command_id) this.commandIds.add(command_id);
      this.last_error = null;
      this.last_human_error = null;
      if (result.code === "REPLAY_APPLIED") return result;
      if (result.trip) {
        this.tripCache.set(result.trip.trip.trip_id, result.trip);
        const used = new Set(
          [...result.trip.deliveries.values()].map((d) => d.order_ref),
        );
        await this.readyOrders.removeByOrderRefs([...used]);
      }
      if (result.handoff) this.handoffCache.set(result.handoff.handoff_id, result.handoff);
      if (result.occurrence)
        this.occCache.set(result.occurrence.occurrence_id, result.occurrence);
      if (result.rider) this.riderCache.set(result.rider.rider_id, result.rider);
      this.log.info("command_ok", `Ação ${full.type} concluída.`, undefined, {
        actor_id: actor.actor_id,
        meta: { type: full.type, command_id },
      });
      return result;
    } catch (e) {
      const technical = e instanceof Error ? e.message : String(e);
      this.last_error = technical;
      this.last_human_error = "Não foi possível concluir a ação. Tente de novo ou avise o responsável.";
      this.log.error("command_failed", this.last_human_error, technical, {
        actor_id: actor.actor_id,
      });
      if (/version conflict|Concurrency/i.test(technical)) {
        this.log.warn("conflict", "Conflito de versão nos dados.", technical);
      }
      if (/persist|ENOENT|EPERM|JSON/i.test(technical)) {
        this.log.error("persistence_error", "Problema ao gravar dados.", technical);
      }
      return inbound
        ? {ok:false, error:this.last_human_error, code:"COMMIT_UNCONFIRMED_RETRY", retryable:true}
        : { ok: false, error: this.last_human_error, code: "EXCEPTION" };
    }
  }

  /**
   * Eventos de uma viagem, para a timeline do console.
   * Devolve o log cru; a traducao para linguagem de operacao e a limpeza de
   * dado sensivel acontecem em trip-timeline.ts.
   */
  async listTripEvents(trip_id: string) {
    const all = await this.uow.events.listAll();
    const rec = await this.uow.trips.get(trip_id);
    const deliveryIds = new Set((rec?.deliveries ?? []).map((d) => d.delivery_id));
    return all.filter(
      (e) =>
        (e.object_type === "trip" && e.object_id === trip_id) ||
        (e.object_type === "delivery" && deliveryIds.has(e.object_id)),
    );
  }

  async snapshot(): Promise<PilotSnapshot> {
    const [
      tripRecords,
      handoffRecords,
      occurrenceRecords,
      riderRecords,
      readyOrders,
    ] = await Promise.all([
      this.uow.trips.list(),
      this.uow.handoffs.list(),
      this.uow.occurrences.list(),
      this.uow.riders.list(),
      this.readyOrders.list(),
    ]);

    const trips = tripRecords.map((rec) => ({
      trip_id: rec.trip.trip_id,
      state: rec.trip.state,
      courier_actor_id: String(rec.trip.courier_actor_id),
      deliveries: [...rec.deliveries]
        .sort((a, b) => a.planned_stop_order - b.planned_stop_order)
        .map((d) => ({
          delivery_id: d.delivery_id,
          order_ref: d.order_ref,
          state: d.state,
          active: d.active,
          planned_stop_order: d.planned_stop_order,
        })),
    }));

    const banner = resolveBanner(this.cfg);

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
      actor: this.activeActor,
      session_required: true,
      trips,
      handoffs: handoffRecords.map(({ handoff: h }) => ({
        handoff_id: h.handoff_id,
        external_order_ref: h.external_order_ref,
        state: h.state,
        confirmed: h.confirmed,
        courier_verified: h.courier_verified,
      })),
      occurrences: occurrenceRecords.map((o) => ({
        occurrence_id: o.occurrence_id,
        state: o.state,
        report: o.report,
        blocks_availability: o.blocks_availability,
      })),
      riders: riderRecords.map((r) => ({
        rider_id: String(r.rider_id),
        availability: r.availability,
        occurrence_blocking_availability: r.occurrence_blocking_availability,
        active_trip_id: r.active_trip_id,
      })),
      ready_orders: readyOrders.map((o) => ({
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
