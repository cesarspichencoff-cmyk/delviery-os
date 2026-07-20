/**
 * Health/status técnico da integração pública.
 * NÃO é pressão operacional / Capacidade Viva / Foco.
 */

export type IntegrationConsumerState = "disconnected" | "simulated" | "live";

export interface EntregasIntegrationHealth {
  /** Versão do módulo produtor */
  producer_version: string;
  /** Versão do catálogo de eventos */
  catalog_version: string;
  /** schema_version do envelope */
  schema_version: string;
  /** Hash congelado dos schemas */
  schemas_hash: string;
  /** Último evento publicado com sucesso (event_id) */
  last_published_event_id: string | null;
  last_published_event_type: string | null;
  last_published_at: string | null;
  /** Quantidade pendente / failed reenviável na outbox */
  outbox_pending_count: number;
  outbox_failed_count: number;
  outbox_dead_letter_count: number;
  /** Último erro técnico de publicação */
  last_error: string | null;
  last_error_at: string | null;
  /** Consumer: desligado | simulado | live (live sempre disabled nesta fase) */
  consumer_state: IntegrationConsumerState;
  consumer_live_enabled: false;
  /** Compatibilidade produtor↔catálogo */
  compatibility: "compatible" | "unknown" | "incompatible";
  /**
   * Atraso estimado em ms entre occurred_at do último pendente e agora.
   * null = sem pendências ou desconhecido — NUNCA fabricar 0 como “saudável” sem evidência.
   */
  estimated_lag_ms: number | null;
  /** Marcador: este objeto é técnico, não pressão operacional */
  kind: "technical_integration_health";
  operational_pressure: false;
}

export interface HealthSnapshotInput {
  producer_version: string;
  catalog_version: string;
  schema_version: string;
  schemas_hash: string;
  last_published_event_id: string | null;
  last_published_event_type: string | null;
  last_published_at: string | null;
  outbox_pending_count: number;
  outbox_failed_count: number;
  outbox_dead_letter_count: number;
  last_error: string | null;
  last_error_at: string | null;
  consumer_state: IntegrationConsumerState;
  /** occurred_at do pending mais antigo, se houver */
  oldest_pending_occurred_at: string | null;
  now?: string;
}

export function buildIntegrationHealth(
  input: HealthSnapshotInput,
): EntregasIntegrationHealth {
  let estimated_lag_ms: number | null = null;
  if (input.oldest_pending_occurred_at) {
    const now = Date.parse(input.now ?? new Date().toISOString());
    const then = Date.parse(input.oldest_pending_occurred_at);
    if (!Number.isNaN(now) && !Number.isNaN(then)) {
      estimated_lag_ms = Math.max(0, now - then);
    } else {
      estimated_lag_ms = null;
    }
  } else if (
    input.outbox_pending_count + input.outbox_failed_count === 0
  ) {
    // sem pendência: ausência de lag medido — null, não 0 forçado como métrica de pressão
    estimated_lag_ms = null;
  }

  return {
    producer_version: input.producer_version,
    catalog_version: input.catalog_version,
    schema_version: input.schema_version,
    schemas_hash: input.schemas_hash,
    last_published_event_id: input.last_published_event_id,
    last_published_event_type: input.last_published_event_type,
    last_published_at: input.last_published_at,
    outbox_pending_count: input.outbox_pending_count,
    outbox_failed_count: input.outbox_failed_count,
    outbox_dead_letter_count: input.outbox_dead_letter_count,
    last_error: input.last_error,
    last_error_at: input.last_error_at,
    consumer_state: input.consumer_state,
    consumer_live_enabled: false,
    compatibility: "compatible",
    estimated_lag_ms,
    kind: "technical_integration_health",
    operational_pressure: false,
  };
}
