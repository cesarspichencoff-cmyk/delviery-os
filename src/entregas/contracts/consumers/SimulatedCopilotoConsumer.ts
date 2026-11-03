/**
 * Consumidor ESTRITAMENTE simulado do DELIVERYOS COPILOTO.
 *
 * Pode importar APENAS contratos públicos:
 * - EntregasEventFeed
 * - eventos / validate / types
 *
 * PROIBIDO importar:
 * - camada de domínio interna do módulo
 * - outbox / sessão de publicação
 * - repositórios / banco
 * - motor de capacidade ou UI de outros módulos
 */
import type { EntregasEventFeed } from "../EntregasEventFeed";
import type { EntregasPublicEvent } from "../events/types";
import { validatePublicEvent } from "../events/validate";
import { isPublicEventType } from "../events/catalog";
import { PUBLIC_EVENTS_SCHEMA_VERSION } from "../events/types";

/**
 * Snapshot canônico e limitado dos eventos públicos. A comparação de duplicatas
 * não depende da ordem das propriedades e nunca persiste a referência do emissor.
 */
function snapshotPublicEvent(event: EntregasPublicEvent):
  { event: EntregasPublicEvent; fingerprint: string } | null {
  let visitedNodes = 0;
  const seen = new WeakSet<object>();
  function normalized(value: unknown, depth: number): unknown {
    if (++visitedNodes > 1024 || depth > 12) throw new Error("EVENT_TOO_COMPLEX");
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("NON_FINITE");
    if (["bigint", "symbol", "function"].includes(typeof value)) throw new Error("NON_JSON_VALUE");
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) throw new Error("CYCLIC_EVENT");
    if (!Array.isArray(value)) {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null)
        throw new Error("NON_PLAIN_JSON_VALUE");
    }
    seen.add(value);
    const result = Array.isArray(value)
      ? value.map((item) => normalized(item, depth + 1))
      : Object.fromEntries(Object.entries(value)
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, item]) => [key, normalized(item, depth + 1)]));
    seen.delete(value);
    return result;
  }
  function freeze(value: unknown): void {
    if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
  }
  try {
    const fingerprint = JSON.stringify(normalized(event, 0));
    if (!fingerprint || fingerprint.length > 32768) return null;
    const copy = JSON.parse(fingerprint) as EntregasPublicEvent;
    freeze(copy);
    return { event: copy, fingerprint };
  } catch {
    return null;
  }
}

export interface SimulatedApplyResult {
  applied: boolean;
  reason?: string;
  isolated?: boolean;
}

/**
 * Estado derivado apenas dos eventos públicos consumidos.
 * Não escreve de volta no Entregas.
 */
export class SimulatedCopilotoConsumer {
  readonly name = "simulated-deliveryos-copiloto";
  /** Efeitos por idempotency_key — reenvio não duplica */
  private readonly effects = new Map<string, { event: EntregasPublicEvent; fingerprint: string }>();
  private readonly appliedOrder: EntregasPublicEvent[] = [];
  private readonly isolated: Array<{ raw: unknown; reason: string }> = [];
  private checkpoint: string | null = null;
  // Retomar de cursor sem histórico durável NÃO reconstrói a Trip inteira.
  private historyComplete = true;

  get appliedCount(): number {
    return this.effects.size;
  }

  get appliedEvents(): readonly EntregasPublicEvent[] {
    // Nunca entregar a coleção mutável interna nem histórico parcial.
    return Object.freeze(this.historyComplete ? [...this.appliedOrder] : []);
  }

  get isolatedEvents(): readonly { raw: unknown; reason: string }[] {
    return Object.freeze(this.isolated.map(x => Object.freeze({ raw: null, reason: x.reason })));
  }

  get lastCheckpoint(): string | null {
    return this.checkpoint;
  }

  get historyIsComplete(): boolean {
    return this.historyComplete;
  }

  /**
   * Aplica um evento já obtido do feed.
   * Evento incompatível / desconhecido → isolado, não derruba o consumer.
   */
  apply(raw: unknown): SimulatedApplyResult {
    // Entrada não confiável deve ser finita e serializável ANTES da varredura
    // recursiva do contrato público (evita ciclo, tamanho excessivo e exceção).
    try {
      const envelope = JSON.stringify(raw);
      if (!envelope || envelope.length > 32768) {
        this.isolated.push({ raw: null, reason: "unsafe_event_envelope" });
        return { applied: false, reason: "unsafe_event_envelope", isolated: true };
      }
    } catch {
      this.isolated.push({ raw: null, reason: "unsafe_event_envelope" });
      return { applied: false, reason: "unsafe_event_envelope", isolated: true };
    }
    let v: ReturnType<typeof validatePublicEvent>;
    try {
      v = validatePublicEvent(raw);
    } catch {
      this.isolated.push({ raw: null, reason: "schema_validation_error" });
      return { applied: false, reason: "schema_validation_error", isolated: true };
    }
    if (!v.ok) {
      // Nunca reter payload bruto inválido: pode carregar dados pessoais.
      this.isolated.push({ raw: null, reason: "schema_invalid" });
      return { applied: false, reason: "schema_invalid", isolated: true };
    }
    const event = v.event;

    if (event.schema_version !== PUBLIC_EVENTS_SCHEMA_VERSION) {
      this.isolated.push({ raw: null, reason: "incompatible_schema" });
      return { applied: false, reason: "incompatible_schema", isolated: true };
    }

    if (!isPublicEventType(event.event_type)) {
      this.isolated.push({ raw: null, reason: "unknown_event_type" });
      return { applied: false, reason: "unknown_event_type", isolated: true };
    }

    const snapshot = snapshotPublicEvent(event);
    if (!snapshot) {
      this.isolated.push({ raw: null, reason: "event_not_safe_json" });
      return { applied: false, reason: "event_not_safe_json", isolated: true };
    }
    const priorKey = this.effects.get(event.idempotency_key);
    if (priorKey) {
      if (priorKey.fingerprint === snapshot.fingerprint)
        return { applied: false, reason: "duplicate_idempotency" };
      this.isolated.push({ raw: null, reason: "idempotency_key_collision" });
      return { applied: false, reason: "idempotency_key_collision", isolated: true };
    }
    if ([...this.effects.values()].some((entry) => entry.event.event_id === event.event_id)) {
      this.isolated.push({ raw: null, reason: "event_id_collision" });
      return { applied: false, reason: "event_id_collision", isolated: true };
    }

    this.effects.set(snapshot.event.idempotency_key, snapshot);
    this.appliedOrder.push(snapshot.event);
    this.checkpoint = snapshot.event.event_id;
    return { applied: true };
  }

  /**
   * Consome via EntregasEventFeed apenas — retoma do checkpoint.
   */
  async pullFromFeed(
    feed: EntregasEventFeed,
    limit = 100,
  ): Promise<{ pulled: number; applied: number; isolated: number }> {
    const { events } = await feed.poll(this.checkpoint, limit);
    let applied = 0;
    let isolated = 0;
    for (const e of events) {
      const r = this.apply(e);
      if (r.applied) applied++;
      else if (r.isolated) {
        isolated++;
        // Nunca avançar o cursor além de um registro inválido/conflitante.
        break;
      }
    }
    return { pulled: events.length, applied, isolated };
  }

  /** Reinício do consumer — só checkpoint; não toca o Entregas */
  restartFromCheckpoint(checkpoint: string | null): void {
    this.checkpoint = checkpoint;
    this.historyComplete = checkpoint === null;
    // Um cursor sozinho não prova o histórico anterior; reprocessar do início
    // (checkpoint=null) é necessário para exibir a Trip após reinício.
    this.effects.clear();
    this.appliedOrder.length = 0;
    this.isolated.length = 0;
  }

  /**
   * Correlacao somente por contratos publicos; nunca ler o dominio Entregas.
   * Eventos de chegada/entrega carregam delivery_id, sem trip_id obrigatorio.
   * Aresta delivery_added fornece a relacao observada; unidade e source_mode
   * particionam a identidade. Atribuicao ambigua e rejeitada.
   */
  eventsForTrip(
    trip_id: string,
    scope?: { unit_id: string; source_mode?: EntregasPublicEvent["source_mode"] },
  ): EntregasPublicEvent[] {
    if (!this.historyComplete) return [];
    // A trip_id collision across store/mode must not merge operational histories.
    const keyScope = (e: EntregasPublicEvent) =>
      JSON.stringify([e.unit_id, e.source_mode ?? null]);
    const scopes = new Set(this.appliedOrder
      .filter(e => e.trip_id === trip_id).map(keyScope));
    const requested = scope
      ? JSON.stringify([scope.unit_id, scope.source_mode ?? null])
      : scopes.size === 1 ? [...scopes][0] : null;
    if (requested === null || !scopes.has(requested)) return [];
    const scopedEvents = this.appliedOrder.filter(e => keyScope(e) === requested);
    const owners = new Map<string, Set<string>>();
    const key = (event: EntregasPublicEvent): string =>
      JSON.stringify([event.unit_id, event.source_mode ?? null, event.delivery_id]);
    for (const event of scopedEvents) {
      if (event.event_type !== "delivery_added" || !event.trip_id || !event.delivery_id) continue;
      const k = key(event);
      const seen = owners.get(k) ?? new Set<string>();
      seen.add(event.trip_id);
      owners.set(k, seen);
    }
    // Nao inferir vinculo retroativo: o registro publico da aresta precisa
    // preceder o evento da entrega. A ambiguidade global continua fail-closed.
    const linkedSoFar = new Map<string, Set<string>>();
    return scopedEvents.filter((event) => {
      if (event.event_type === "delivery_added" && event.trip_id && event.delivery_id) {
        const k = key(event);
        const seen = linkedSoFar.get(k) ?? new Set<string>();
        seen.add(event.trip_id);
        linkedSoFar.set(k, seen);
      }
      if (event.trip_id) return event.trip_id === trip_id;
      if (!event.delivery_id) return false;
      const k = key(event);
      const allOwners = owners.get(k);
      const precedingOwners = linkedSoFar.get(k);
      return allOwners?.size === 1 && allOwners.has(trip_id) &&
        precedingOwners?.size === 1 && precedingOwners.has(trip_id);
    });
  }

  reset(): void {
    this.effects.clear();
    this.appliedOrder.length = 0;
    this.isolated.length = 0;
    this.checkpoint = null;
    this.historyComplete = true;
  }
}
