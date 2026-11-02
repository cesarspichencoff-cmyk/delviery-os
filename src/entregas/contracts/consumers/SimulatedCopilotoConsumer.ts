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
  private readonly effects = new Map<string, EntregasPublicEvent>();
  private readonly appliedOrder: EntregasPublicEvent[] = [];
  private readonly isolated: Array<{ raw: unknown; reason: string }> = [];
  private checkpoint: string | null = null;

  get appliedCount(): number {
    return this.effects.size;
  }

  get appliedEvents(): readonly EntregasPublicEvent[] {
    return this.appliedOrder;
  }

  get isolatedEvents(): readonly { raw: unknown; reason: string }[] {
    return this.isolated;
  }

  get lastCheckpoint(): string | null {
    return this.checkpoint;
  }

  /**
   * Aplica um evento já obtido do feed.
   * Evento incompatível / desconhecido → isolado, não derruba o consumer.
   */
  apply(raw: unknown): SimulatedApplyResult {
    const v = validatePublicEvent(raw);
    if (!v.ok) {
      this.isolated.push({
        raw,
        reason: `schema_invalid: ${v.issues.map((i) => i.message).join("; ")}`,
      });
      return { applied: false, reason: "schema_invalid", isolated: true };
    }
    const event = v.event;

    if (event.schema_version !== PUBLIC_EVENTS_SCHEMA_VERSION) {
      this.isolated.push({
        raw: event,
        reason: `incompatible_schema:${event.schema_version}`,
      });
      return { applied: false, reason: "incompatible_schema", isolated: true };
    }

    if (!isPublicEventType(event.event_type)) {
      this.isolated.push({ raw: event, reason: "unknown_event_type" });
      return { applied: false, reason: "unknown_event_type", isolated: true };
    }

    if (this.effects.has(event.idempotency_key)) {
      return { applied: false, reason: "duplicate_idempotency" };
    }
    if ([...this.effects.values()].some((e) => e.event_id === event.event_id)) {
      return { applied: false, reason: "duplicate_event_id" };
    }

    this.effects.set(event.idempotency_key, event);
    this.appliedOrder.push(event);
    this.checkpoint = event.event_id;
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
      else if (r.isolated) isolated++;
    }
    return { pulled: events.length, applied, isolated };
  }

  /** Reinício do consumer — só checkpoint; não toca o Entregas */
  restartFromCheckpoint(checkpoint: string | null): void {
    this.checkpoint = checkpoint;
    // efeitos em memória perdidos no "restart" — re-pull aplica de novo idempotente
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
  eventsForTrip(trip_id: string): EntregasPublicEvent[] {
    const owners = new Map<string, Set<string>>();
    const key = (event: EntregasPublicEvent): string =>
      JSON.stringify([event.unit_id, event.source_mode ?? null, event.delivery_id]);
    for (const event of this.appliedOrder) {
      if (event.event_type !== "delivery_added" || !event.trip_id || !event.delivery_id) continue;
      const k = key(event);
      const seen = owners.get(k) ?? new Set<string>();
      seen.add(event.trip_id);
      owners.set(k, seen);
    }
    // Nao inferir vinculo retroativo: o registro publico da aresta precisa
    // preceder o evento da entrega. A ambiguidade global continua fail-closed.
    const linkedSoFar = new Map<string, Set<string>>();
    return this.appliedOrder.filter((event) => {
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
  }
}
