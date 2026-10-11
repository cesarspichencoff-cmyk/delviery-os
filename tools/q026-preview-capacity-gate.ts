/**
 * Q-026 PREVIEW-ONLY CAPACITY PREFLIGHT (research; no runtime changes).
 *
 * Calculate a conservative PostgreSQL connection ceiling for replicas of
 * the Product System HTTP reader. It does NOT inspect the server, reserve
 * leases, or implement cluster-global admission. This check is deliberately
 * fail-closed when any material value is missing.
 *
 * Never put DB credentials/URLs in its input or output.
 */
export interface CapacidadeDeclaradaQ026 {
  readonly workers: number;
  /** Explicitly deployed DELIVERYOS_ENTREGAS_MAX_INFLIGHT: 1, 2 or 4. */
  readonly admissionPerWorker: number;
  /** Live PostgreSQL SHOW max_connections, not a guessed provider tier. */
  readonly pgMaxConnections: number;
  /** Actual PostgreSQL reserved connections (role/pooler dependent). */
  readonly pgReservedConnections: number;
  /** All other services sharing this PostgreSQL, including observability. */
  readonly otherServicesConnections: number;
  /** Explicit cushion for maintenance and failed/reconnecting clients. */
  readonly safetyHeadroomConnections: number;
  /**
   * Other connections owned by EACH Product System worker, in addition to
   * reader and cancel pools. Must be explicitly supplied, even if zero.
   */
  readonly otherConnectionsPerWorker: number;
}

export interface OrcamentoDeConexoesQ026 {
  readonly sufficient_on_declared_assumptions: boolean;
  readonly workers: number;
  readonly http_admission_local: number;
  readonly potential_http_admitted_across_workers: number;
  readonly reader_pool_limit_per_worker: 2;
  readonly canceller_pool_limit_per_worker: 1;
  readonly max_pool_connections_across_workers: number;
  readonly total_budgeted_connections: number;
  readonly postgres_max_connections: number;
  readonly capacity_remaining: number;
  readonly warning: string;
}

const fields = [
  "workers",
  "admissionPerWorker",
  "pgMaxConnections",
  "pgReservedConnections",
  "otherServicesConnections",
  "safetyHeadroomConnections",
  "otherConnectionsPerWorker",
] as const;

function integerInRange(n: unknown, min: number, max: number, field: string): number {
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < min || n > max) {
    throw Error("Q026_CAPACITY_INVALID_" + field);
  }
  return n;
}

export function verificarOrcamentoQ026(raw: unknown): OrcamentoDeConexoesQ026 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw Error("Q026_CAPACITY_INPUT_REQUIRED");
  const o = raw as Record<string,unknown>;
  const provided = Object.keys(o).sort();
  if (provided.join("\n") !== [...fields].sort().join("\n"))
    throw Error("Q026_CAPACITY_EXPLICIT_FIELDS_REQUIRED");
  const workers=integerInRange(o.workers,1,1024,"workers");
  const admissionPerWorker=integerInRange(o.admissionPerWorker,1,4,"admissionPerWorker");
  if (![1,2,4].includes(admissionPerWorker))
    throw Error("Q026_CAPACITY_INVALID_admissionPerWorker");
  const pgMaxConnections=integerInRange(o.pgMaxConnections,1,1000000,"pgMaxConnections");
  const pgReservedConnections=integerInRange(o.pgReservedConnections,0,pgMaxConnections,"pgReservedConnections");
  const otherServicesConnections=integerInRange(o.otherServicesConnections,0,pgMaxConnections,"otherServicesConnections");
  const safetyHeadroomConnections=integerInRange(o.safetyHeadroomConnections,1,pgMaxConnections,"safetyHeadroomConnections");
  const otherConnectionsPerWorker=integerInRange(o.otherConnectionsPerWorker,0,pgMaxConnections,"otherConnectionsPerWorker");
  // The candidate Product System has a reader pool max=2 and an independent
  // cancel pool max=1 when its deadline flag is enabled. Each worker creates
  // its OWN pools. This does not model transaction CPU, waiting clients or
  // distributed admission; those are explicitly separate constraints.
  const perWorker=2+1+otherConnectionsPerWorker;
  const maxPoolConnectionsAcrossWorkers=workers*perWorker;
  const totalBudgetedConnections=maxPoolConnectionsAcrossWorkers+
    otherServicesConnections+pgReservedConnections+safetyHeadroomConnections;
  const capacityRemaining=pgMaxConnections-totalBudgetedConnections;
  return {
    sufficient_on_declared_assumptions:capacityRemaining>=0,
    workers,
    http_admission_local:admissionPerWorker,
    potential_http_admitted_across_workers:workers*admissionPerWorker,
    reader_pool_limit_per_worker:2,
    canceller_pool_limit_per_worker:1,
    max_pool_connections_across_workers:maxPoolConnectionsAcrossWorkers,
    total_budgeted_connections:totalBudgetedConnections,
    postgres_max_connections:pgMaxConnections,
    capacity_remaining:capacityRemaining,
    warning:"APENAS ORCAMENTO DECLARADO: NAO AUTORIZA DEPLOY, NAO PROVA TLS/ROLE, CONEXOES REAIS, LATENCIA OU ADMISAO GLOBAL",
  };
}
