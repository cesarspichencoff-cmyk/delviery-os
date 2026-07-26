/**
 * Inbox, outbox e jobs em memória.
 *
 * Implementa exatamente as mesmas portas que a versão PostgreSQL, com a mesma
 * semântica de claim/lease/retry/dead-letter. Serve para dois usos reais:
 *
 *  - o runtime crítico roda **sem banco** em desenvolvimento e em recuperação
 *    (o fallback que o contrato manda preservar);
 *  - a lógica de fila fica provável sem depender de um Postgres de pé, o que
 *    mantém a suíte executável em qualquer máquina.
 *
 * O que ela NÃO substitui: durabilidade. Reiniciar o processo esvazia tudo.
 * Por isso o runtime remoto exige PostgreSQL, e o boot recusa subir sem ele.
 */

import type {
  InboxRecord,
  InboxRepository,
  InboxResult,
  Job,
  JobRepository,
  OutboxMessage,
  OutboxRepository,
  RetryPolicy,
} from "../contracts/messaging";
import { decideAfterFailure, nextAvailableAt } from "../contracts/messaging";

export class MemoryInboxRepository implements InboxRepository {
  private readonly byKey = new Map<string, InboxRecord>();

  async accept(record: InboxRecord): Promise<InboxResult> {
    if (!record.idempotency_key?.trim()) {
      return { accepted: false, reason: "invalid", detail: "idempotency_key obrigatória" };
    }
    if (!record.unit_id?.trim()) {
      return { accepted: false, reason: "invalid", detail: "unit_id obrigatória" };
    }
    const existing = this.byKey.get(record.idempotency_key);
    if (existing) {
      // Duplicata não é erro: é o reenvio esperado depois de queda de rede.
      return { accepted: false, reason: "duplicate", existing_received_at: existing.received_at };
    }
    this.byKey.set(record.idempotency_key, record);
    return { accepted: true, record };
  }

  async find(idempotency_key: string): Promise<InboxRecord | null> {
    return this.byKey.get(idempotency_key) ?? null;
  }

  size(): number {
    return this.byKey.size;
  }
}

export class MemoryOutboxRepository implements OutboxRepository {
  private readonly rows = new Map<string, OutboxMessage>();

  async enqueue(message: OutboxMessage): Promise<void> {
    if (this.rows.has(message.outbox_id)) return; // idempotente
    this.rows.set(message.outbox_id, { ...message });
  }

  /**
   * Reserva atômica. O equivalente a `FOR UPDATE SKIP LOCKED`: como o loop de
   * eventos do Node é single-threaded, marcar `processing` antes de devolver
   * garante que uma segunda chamada não veja as mesmas linhas.
   */
  async claim(worker_id: string, limit: number, now: Date): Promise<OutboxMessage[]> {
    const elegiveis = [...this.rows.values()]
      .filter((m) => m.state === "pending" && Date.parse(m.available_at) <= now.getTime())
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .slice(0, limit);

    for (const m of elegiveis) {
      m.state = "processing";
      m.locked_at = now.toISOString();
      m.locked_by = worker_id;
    }
    return elegiveis.map((m) => ({ ...m }));
  }

  async markDone(outbox_id: string, now: Date): Promise<void> {
    const m = this.rows.get(outbox_id);
    if (!m) return;
    m.state = "done";
    m.processed_at = now.toISOString();
    m.locked_at = undefined;
    m.locked_by = undefined;
  }

  async markFailed(
    outbox_id: string,
    error: string,
    policy: RetryPolicy,
    now: Date,
  ): Promise<"retry" | "dead"> {
    const m = this.rows.get(outbox_id);
    if (!m) return "dead";
    m.attempts += 1;
    m.last_error = error;
    m.locked_at = undefined;
    m.locked_by = undefined;

    const decision = decideAfterFailure(m.attempts, policy);
    if (decision === "dead") {
      // Dead-letter NÃO é descarte: a mensagem fica, com o erro, para alguém
      // olhar e decidir. Apagar aqui perderia o efeito que nunca aconteceu.
      m.state = "dead";
      m.processed_at = now.toISOString();
    } else {
      m.state = "pending";
      m.available_at = nextAvailableAt(m.attempts, policy, m.idempotency_key, now);
    }
    return decision;
  }

  async deadLetters(limit: number): Promise<OutboxMessage[]> {
    return [...this.rows.values()]
      .filter((m) => m.state === "dead")
      .slice(0, limit)
      .map((m) => ({ ...m }));
  }

  async requeue(outbox_id: string, actor_id: string, now: Date): Promise<boolean> {
    const m = this.rows.get(outbox_id);
    if (!m || m.state !== "dead") return false;
    m.state = "pending";
    m.attempts = 0;
    m.available_at = now.toISOString();
    m.processed_at = undefined;
    // Mantém `last_error` com a marca de quem reprocessou: o histórico do
    // problema não some porque alguém apertou o botão.
    m.last_error = `${m.last_error ?? ""} | reprocessado por ${actor_id} em ${now.toISOString()}`.trim();
    return true;
  }

  async pendingCount(): Promise<number> {
    return [...this.rows.values()].filter((m) => m.state === "pending").length;
  }

  all(): OutboxMessage[] {
    return [...this.rows.values()].map((m) => ({ ...m }));
  }
}

export class MemoryJobRepository implements JobRepository {
  private readonly rows = new Map<string, Job>();
  private readonly byKey = new Map<string, string>();

  async schedule(job: Job): Promise<void> {
    // Chave de negócio única: agendar o mesmo trabalho duas vezes não cria
    // dois efeitos.
    if (this.byKey.has(job.idempotency_key)) return;
    this.byKey.set(job.idempotency_key, job.job_id);
    this.rows.set(job.job_id, { ...job });
  }

  async claim(worker_id: string, limit: number, policy: RetryPolicy, now: Date): Promise<Job[]> {
    const elegiveis = [...this.rows.values()]
      .filter((j) => j.state === "pending" && Date.parse(j.available_at) <= now.getTime())
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .slice(0, limit);

    for (const j of elegiveis) {
      j.state = "running";
      j.locked_at = now.toISOString();
      j.locked_by = worker_id;
      j.lease_expires_at = new Date(now.getTime() + policy.lease_ms).toISOString();
    }
    return elegiveis.map((j) => ({ ...j }));
  }

  async markDone(job_id: string, now: Date): Promise<void> {
    const j = this.rows.get(job_id);
    if (!j) return;
    j.state = "done";
    j.processed_at = now.toISOString();
    j.locked_at = undefined;
    j.locked_by = undefined;
    j.lease_expires_at = undefined;
  }

  async markFailed(
    job_id: string,
    error: string,
    policy: RetryPolicy,
    now: Date,
  ): Promise<"retry" | "dead"> {
    const j = this.rows.get(job_id);
    if (!j) return "dead";
    j.attempts += 1;
    j.last_error = error;
    j.locked_at = undefined;
    j.locked_by = undefined;
    j.lease_expires_at = undefined;

    const limite = Math.min(policy.max_attempts, j.max_attempts);
    const decision = j.attempts >= limite ? "dead" : "retry";
    if (decision === "dead") {
      j.state = "dead";
      j.processed_at = now.toISOString();
    } else {
      j.state = "pending";
      j.available_at = nextAvailableAt(j.attempts, policy, j.idempotency_key, now);
    }
    return decision;
  }

  /**
   * Devolve à fila o que ficou preso.
   *
   * É o mecanismo que salva o trabalho quando um worker morre no meio: o
   * lease vence e outro pega. Repare que **não conta tentativa** — o job não
   * falhou, o worker sumiu. Contar aqui gastaria as tentativas de um job
   * perfeitamente bom toda vez que um contêiner reiniciasse.
   */
  async reclaimExpired(now: Date): Promise<number> {
    let n = 0;
    for (const j of this.rows.values()) {
      if (j.state === "running" && j.lease_expires_at && Date.parse(j.lease_expires_at) <= now.getTime()) {
        j.state = "pending";
        j.locked_at = undefined;
        j.locked_by = undefined;
        j.lease_expires_at = undefined;
        j.available_at = now.toISOString();
        n += 1;
      }
    }
    return n;
  }

  async deadLetters(limit: number): Promise<Job[]> {
    return [...this.rows.values()].filter((j) => j.state === "dead").slice(0, limit).map((j) => ({ ...j }));
  }

  async pendingCount(): Promise<number> {
    return [...this.rows.values()].filter((j) => j.state === "pending").length;
  }

  get(job_id: string): Job | undefined {
    const j = this.rows.get(job_id);
    return j ? { ...j } : undefined;
  }
}
