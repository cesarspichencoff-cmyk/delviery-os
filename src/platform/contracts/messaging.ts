/**
 * Inbox, outbox e jobs — o contrato que liga os dois runtimes.
 *
 * Três mecanismos com papéis distintos, e a confusão entre eles é a origem da
 * maioria dos bugs de integração:
 *
 *  - **inbox**: o que ENTRA de fora (aparelho, agente de loja). Deduplica por
 *    chave de negócio. Sem ela, uma retentativa do celular após queda de rede
 *    vira dois fatos;
 *  - **outbox**: o que PRECISA SAIR depois que o fato foi gravado. Escrita na
 *    MESMA transação do fato. Sem isso, existe a janela em que o fato existe e
 *    o aviso nunca sai — ou o aviso sai e o fato não existe;
 *  - **jobs**: trabalho que alguém pediu para ser feito. Tem lease, retry e
 *    backoff porque quem executa pode morrer no meio.
 *
 * O runtime crítico grava nos três. O assíncrono consome outbox e jobs.
 */

export const MESSAGING_CONTRACT_VERSION = "messaging@1.0.0";

/* ------------------------------------------------------------------ *
 * Inbox
 * ------------------------------------------------------------------ */

export interface InboxRecord {
  /** Chave de negócio. É ela que deduplica, não o id técnico. */
  idempotency_key: string;
  source: string;
  kind: string;
  payload: Record<string, unknown>;
  /** Quando aconteceu no aparelho. */
  occurred_at: string;
  /** Quando o servidor recebeu. Nunca fundido com `occurred_at`. */
  received_at: string;
  /** Ordem local do dispositivo — permite ordenar sem confiar no relógio. */
  sequence_local?: number;
  device_id?: string;
  unit_id: string;
}

export type InboxResult =
  | { accepted: true; record: InboxRecord }
  | { accepted: false; reason: "duplicate"; existing_received_at: string }
  | { accepted: false; reason: "invalid"; detail: string };

/* ------------------------------------------------------------------ *
 * Outbox
 * ------------------------------------------------------------------ */

export const OUTBOX_STATES = ["pending", "processing", "done", "dead"] as const;
export type OutboxState = (typeof OUTBOX_STATES)[number];

export interface OutboxMessage {
  outbox_id: string;
  /** Agrupa mensagens que precisam ser entregues em ordem entre si. */
  stream: string;
  kind: string;
  payload: Record<string, unknown>;
  /** Mesma chave do fato que originou — permite auditar a ligação. */
  idempotency_key: string;
  correlation_id: string;
  created_at: string;
  state: OutboxState;
  attempts: number;
  /** Só fica elegível a partir daqui — é o que implementa o backoff. */
  available_at: string;
  locked_at?: string;
  locked_by?: string;
  processed_at?: string;
  last_error?: string;
}

/* ------------------------------------------------------------------ *
 * Jobs
 * ------------------------------------------------------------------ */

export const JOB_STATES = ["pending", "running", "done", "failed", "dead"] as const;
export type JobState = (typeof JOB_STATES)[number];

export interface Job {
  job_id: string;
  kind: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  state: JobState;
  attempts: number;
  max_attempts: number;
  available_at: string;
  locked_at?: string;
  locked_by?: string;
  /** Até quando o lease vale. Passou disso, outro worker pode pegar. */
  lease_expires_at?: string;
  processed_at?: string;
  last_error?: string;
  created_at: string;
}

/* ------------------------------------------------------------------ *
 * Política de retentativa
 * ------------------------------------------------------------------ */

export interface RetryPolicy {
  max_attempts: number;
  /** Espera base, dobrada a cada tentativa. */
  base_delay_ms: number;
  /** Teto: sem ele, a 12ª tentativa cairia daqui a semanas. */
  max_delay_ms: number;
  /** Duração do lease. Curto demais duplica trabalho; longo demais trava a
   *  fila quando um worker morre. */
  lease_ms: number;
}

export const DEFAULT_RETRY: RetryPolicy = {
  max_attempts: 8,
  base_delay_ms: 1_000,
  max_delay_ms: 300_000, // 5 min
  lease_ms: 60_000,
};

/**
 * Backoff exponencial com teto e jitter determinístico.
 *
 * O jitter existe para evitar o rebanho: sem ele, mil mensagens que falharam
 * juntas voltam juntas e derrubam o consumidor de novo. É derivado da chave,
 * e não aleatório, para o teste poder afirmar o valor.
 */
export function nextDelayMs(attempt: number, policy: RetryPolicy, key: string): number {
  const exp = Math.min(
    policy.base_delay_ms * Math.pow(2, Math.max(0, attempt - 1)),
    policy.max_delay_ms,
  );
  // Hash simples e estável da chave → jitter de até 20% para baixo.
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const jitterFactor = 0.8 + (h % 200) / 1000; // 0.80 … 0.999
  return Math.round(exp * jitterFactor);
}

export function nextAvailableAt(
  attempt: number,
  policy: RetryPolicy,
  key: string,
  now: Date,
): string {
  return new Date(now.getTime() + nextDelayMs(attempt, policy, key)).toISOString();
}

/** Decisão após uma falha: tenta de novo, ou vai para a dead-letter. */
export function decideAfterFailure(
  attempts: number,
  policy: RetryPolicy,
): "retry" | "dead" {
  return attempts >= policy.max_attempts ? "dead" : "retry";
}

/* ------------------------------------------------------------------ *
 * Portas
 * ------------------------------------------------------------------ */

export interface InboxRepository {
  /** Aceita ou recusa por duplicidade. Nunca lança por duplicata. */
  accept(record: InboxRecord): Promise<InboxResult>;
  find(idempotency_key: string): Promise<InboxRecord | null>;
}

export interface OutboxRepository {
  /** Enfileira. DEVE participar da transação do fato. */
  enqueue(message: OutboxMessage): Promise<void>;
  /**
   * Reserva mensagens para este worker, de forma atômica.
   *
   * "Atômica" aqui significa: dois workers chamando ao mesmo tempo nunca
   * recebem a mesma mensagem. No PostgreSQL isso é `FOR UPDATE SKIP LOCKED`;
   * em memória, o mesmo efeito sob o loop de eventos.
   */
  claim(worker_id: string, limit: number, now: Date): Promise<OutboxMessage[]>;
  markDone(outbox_id: string, now: Date): Promise<void>;
  markFailed(
    outbox_id: string,
    error: string,
    policy: RetryPolicy,
    now: Date,
  ): Promise<"retry" | "dead">;
  /** Mensagens em dead-letter, para inspeção e reprocessamento auditável. */
  deadLetters(limit: number): Promise<OutboxMessage[]>;
  /** Reprocessamento manual: volta para pending, zerando a espera. */
  requeue(outbox_id: string, actor_id: string, now: Date): Promise<boolean>;
  pendingCount(): Promise<number>;
}

export interface JobRepository {
  schedule(job: Job): Promise<void>;
  claim(worker_id: string, limit: number, policy: RetryPolicy, now: Date): Promise<Job[]>;
  markDone(job_id: string, now: Date): Promise<void>;
  markFailed(job_id: string, error: string, policy: RetryPolicy, now: Date): Promise<"retry" | "dead">;
  /** Devolve à fila os jobs cujo lease expirou — o worker morreu no meio. */
  reclaimExpired(now: Date): Promise<number>;
  deadLetters(limit: number): Promise<Job[]>;
  pendingCount(): Promise<number>;
}
