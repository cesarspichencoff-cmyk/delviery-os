/**
 * Saída mínima da fila de prontos — o que o piloto entrega a quem OBSERVA.
 *
 * Mesma porta do snapshot (`PilotReadyOrderStore.list()`), outra projeção.
 * Por linha, só: pedido, canal, instante do registro e modo declarado no
 * registro (ausente = null, nunca real). Rótulo (pode ter endereço) e autor do
 * registro não saem daqui, em hipótese nenhuma.
 *
 * Em volta das linhas: unidade, origem, instante da observação e
 * disponibilidade. Fila ilegível é `unavailable` com total null — nunca zero.
 * Linha com instante ilegível fica fora e é contada.
 *
 * A marca (`facts_watermark`) é o `event_id` do último fato publicado na outbox
 * entre os tipos de que o estado atual depende (`delivery_ready`,
 * `delivery_removed`, `trip_started` — declarados em `covered_types`). Lida
 * DEPOIS da fila: todo pedido que saiu da fila antes da leitura tem o fato até a
 * marca, e toda saída ou retirada anterior também. Se a plataforma ainda não
 * tem a marca, os fatos dela estão atrasados em relação à fila — e isso tem de
 * aparecer, não virar um estado completo inventado.
 *
 * Função pura: nenhum relógio, nenhum I/O.
 */
import type { PilotReadyOrder } from "./ready-orders";

export const READY_QUEUE_OBSERVATION_SCHEMA = "deliveryos.ready-queue-observation.v1";

/** Os tipos cuja publicação a marca cobre: os que o estado atual do pronto lê. */
export const FACTS_WATERMARK_TYPES: readonly string[] = ["delivery_ready", "delivery_removed", "trip_started"];

/**
 * Gerente e líder (os papéis das leituras do Copiloto no piloto) e o papel de
 * máquina do observador local (Q-028), que só chega a esta saída.
 */
export const READY_QUEUE_OBSERVER_ROLES: readonly string[] = ["gerente", "lider_delivery", "observador_fila"];

const MODOS: readonly string[] = ["real", "simulated", "control"];

export interface ReadyQueueEntry {
  readonly order_ref: string;
  readonly registered_at: string;
  readonly channel: string | null;
  readonly source_mode: "real" | "simulated" | "control" | null;
}

export interface ReadyQueueObservation {
  readonly schema: typeof READY_QUEUE_OBSERVATION_SCHEMA;
  readonly unit_id: string;
  readonly origin: {
    readonly system: "entregas-pilot";
    readonly storage_backend: string;
    readonly process_started_at: string;
  };
  readonly observed_at: string;
  readonly availability: "available" | "unavailable";
  readonly reason: string | null;
  readonly total: number | null;
  readonly invalid_entries: number | null;
  readonly entries: readonly ReadyQueueEntry[];
  readonly facts_watermark: {
    readonly availability: "available" | "unavailable";
    readonly covered_types: readonly string[];
    readonly last_event_id: string | null;
  };
}

export type ReadyQueueRead =
  | { readonly ok: true; readonly orders: readonly PilotReadyOrder[] }
  | { readonly ok: false; readonly reason: string };

export type FactsWatermarkRead =
  | { readonly ok: true; readonly last_event_id: string | null }
  | { readonly ok: false };

/** Instante canônico (ISO em UTC), ou null se ilegível. */
function instante(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function buildReadyQueueObservation(input: {
  unit_id: string;
  storage_backend: string;
  process_started_at: string;
  observed_at: string;
  read: ReadyQueueRead;
  watermark: FactsWatermarkRead;
}): ReadyQueueObservation {
  const facts_watermark = input.watermark.ok
    ? { availability: "available" as const, covered_types: [...FACTS_WATERMARK_TYPES],
        last_event_id: input.watermark.last_event_id }
    : { availability: "unavailable" as const, covered_types: [...FACTS_WATERMARK_TYPES], last_event_id: null };
  const base = {
    schema: READY_QUEUE_OBSERVATION_SCHEMA as typeof READY_QUEUE_OBSERVATION_SCHEMA,
    unit_id: input.unit_id,
    origin: {
      system: "entregas-pilot" as const,
      storage_backend: input.storage_backend,
      process_started_at: input.process_started_at,
    },
    observed_at: input.observed_at,
  };
  if (!input.read.ok) {
    return { ...base, availability: "unavailable", reason: input.read.reason, total: null,
      invalid_entries: null, entries: [], facts_watermark };
  }
  const entries: ReadyQueueEntry[] = [];
  let invalid = 0;
  for (const o of input.read.orders) {
    const order_ref = typeof o.order_ref === "string" ? o.order_ref.trim() : "";
    const registered_at = instante(o.created_at);
    if (!order_ref || registered_at === null) { invalid += 1; continue; }
    // Lista explícita: nada de espalhar o registro. Rótulo e autor ficam fora.
    entries.push({
      order_ref,
      registered_at,
      channel: typeof o.channel === "string" && o.channel.trim() ? o.channel : null,
      source_mode: typeof o.source_mode === "string" && MODOS.includes(o.source_mode)
        ? o.source_mode as ReadyQueueEntry["source_mode"] : null,
    });
  }
  entries.sort((a, b) => a.registered_at.localeCompare(b.registered_at) || a.order_ref.localeCompare(b.order_ref));
  return { ...base, availability: "available", reason: null, total: entries.length,
    invalid_entries: invalid, entries, facts_watermark };
}
