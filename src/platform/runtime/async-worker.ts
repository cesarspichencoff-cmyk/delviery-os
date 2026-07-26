/**
 * Runtime ASSÍNCRONO.
 *
 * Consome a outbox e executa jobs. Pode cair, reiniciar e acumular backlog
 * sem afetar a rua — é para isso que ele existe separado.
 *
 * Duas garantias que o laço implementa, e que são a razão de ele não ser um
 * `setInterval` ingênuo:
 *
 *  - **um item processado duas vezes não duplica efeito.** O handler recebe a
 *    chave de idempotência e é obrigado a usá-la. O laço não tem como impedir
 *    um efeito externo repetido; o que ele garante é que a informação para
 *    evitá-lo sempre chega;
 *  - **worker que morre no meio não trava a fila.** O lease vence e o item
 *    volta. Não conta tentativa: o job não falhou, o processo sumiu.
 */

import type {
  Job,
  JobRepository,
  OutboxMessage,
  OutboxRepository,
  RetryPolicy,
} from "../contracts/messaging";
import { DEFAULT_RETRY } from "../contracts/messaging";
import type { DependencyHealth, RuntimeHealth, RuntimeIdentity } from "../contracts/runtime";
import { composeHealth, shutdown, type ShutdownResult } from "../contracts/runtime";

export type OutboxHandler = (
  msg: OutboxMessage,
) => Promise<void> | void;

export type JobHandler = (job: Job) => Promise<void> | void;

export interface AsyncRuntimeDeps {
  identity: Omit<RuntimeIdentity, "kind" | "started_at">;
  outbox: OutboxRepository;
  jobs: JobRepository;
  /** Por `kind`. Um kind sem handler vai para dead-letter com motivo claro. */
  outboxHandlers: Record<string, OutboxHandler>;
  jobHandlers: Record<string, JobHandler>;
  policy?: RetryPolicy;
  batchSize?: number;
  worker_id: string;
  now?: () => Date;
}

export interface DrainResult {
  outbox_processed: number;
  outbox_failed: number;
  outbox_dead: number;
  jobs_processed: number;
  jobs_failed: number;
  jobs_dead: number;
  reclaimed: number;
}

export class AsyncRuntime {
  private readonly startedAt: string;
  private readonly now: () => Date;
  private readonly policy: RetryPolicy;
  private readonly batchSize: number;
  private draining = false;
  private inFlight = 0;

  constructor(private readonly deps: AsyncRuntimeDeps) {
    this.now = deps.now ?? (() => new Date());
    this.policy = deps.policy ?? DEFAULT_RETRY;
    this.batchSize = deps.batchSize ?? 25;
    this.startedAt = this.now().toISOString();
  }

  get identity(): RuntimeIdentity {
    return { ...this.deps.identity, kind: "async", started_at: this.startedAt };
  }

  /**
   * Uma passada completa: recupera o abandonado, consome a outbox, executa
   * jobs. Chamada em laço pelo processo, ou uma vez pelo teste.
   */
  async tick(): Promise<DrainResult> {
    const r: DrainResult = {
      outbox_processed: 0,
      outbox_failed: 0,
      outbox_dead: 0,
      jobs_processed: 0,
      jobs_failed: 0,
      jobs_dead: 0,
      reclaimed: 0,
    };
    if (this.draining) return r;

    // Primeiro o que ficou preso: senão um worker morto segura o item até o
    // fim do mundo enquanto a fila anda por cima dele.
    r.reclaimed = await this.deps.jobs.reclaimExpired(this.now());

    const mensagens = await this.deps.outbox.claim(this.deps.worker_id, this.batchSize, this.now());
    for (const m of mensagens) {
      this.inFlight += 1;
      try {
        const handler = this.deps.outboxHandlers[m.kind];
        if (!handler) throw new Error(`sem handler para kind "${m.kind}"`);
        await handler(m);
        await this.deps.outbox.markDone(m.outbox_id, this.now());
        r.outbox_processed += 1;
      } catch (e) {
        const motivo = e instanceof Error ? e.message : String(e);
        const decisao = await this.deps.outbox.markFailed(
          m.outbox_id,
          motivo,
          this.policy,
          this.now(),
        );
        if (decisao === "dead") r.outbox_dead += 1;
        else r.outbox_failed += 1;
      } finally {
        this.inFlight -= 1;
      }
    }

    const jobs = await this.deps.jobs.claim(
      this.deps.worker_id,
      this.batchSize,
      this.policy,
      this.now(),
    );
    for (const j of jobs) {
      this.inFlight += 1;
      try {
        const handler = this.deps.jobHandlers[j.kind];
        if (!handler) throw new Error(`sem handler para kind "${j.kind}"`);
        await handler(j);
        await this.deps.jobs.markDone(j.job_id, this.now());
        r.jobs_processed += 1;
      } catch (e) {
        const motivo = e instanceof Error ? e.message : String(e);
        const decisao = await this.deps.jobs.markFailed(j.job_id, motivo, this.policy, this.now());
        if (decisao === "dead") r.jobs_dead += 1;
        else r.jobs_failed += 1;
      } finally {
        this.inFlight -= 1;
      }
    }

    return r;
  }

  async health(): Promise<RuntimeHealth> {
    const at = this.now().toISOString();
    const dependencies: DependencyHealth[] = [];

    // O assíncrono não tem dependência ESSENCIAL: por desenho, ele pode estar
    // sem trabalho, sem consumidor e sem pressa. Backlog alto é informação,
    // não falha — e é assim que ele aparece no painel.
    const outboxPend = await this.deps.outbox.pendingCount();
    const jobsPend = await this.deps.jobs.pendingCount();
    const deadOutbox = (await this.deps.outbox.deadLetters(1)).length;
    const deadJobs = (await this.deps.jobs.deadLetters(1)).length;

    dependencies.push({
      name: "backlog",
      state: outboxPend + jobsPend > 1000 ? "degraded" : "healthy",
      essential: false,
      detail: `${outboxPend} mensagens, ${jobsPend} jobs`,
      checked_at: at,
    });

    if (deadOutbox || deadJobs) {
      // Dead-letter existindo é degradação: alguém precisa olhar. Não é
      // bloqueio — a fila continua andando para o resto.
      dependencies.push({
        name: "dead_letter",
        state: "degraded",
        essential: false,
        detail: "há itens em dead-letter aguardando decisão humana",
        checked_at: at,
      });
    }

    if (this.draining) {
      dependencies.push({
        name: "aceitacao",
        state: "read_only",
        essential: false,
        detail: `encerrando; ${this.inFlight} em andamento`,
        checked_at: at,
      });
    }

    return composeHealth({ identity: this.identity, dependencies, now: this.now() });
  }

  async stop(timeoutMs = 25_000): Promise<ShutdownResult> {
    return shutdown(
      {
        drain: () => {
          this.draining = true;
        },
        close: async () => {
          // Espera o que está em curso. Interromper aqui deixaria o item com
          // lease vivo e ninguém trabalhando nele até vencer.
          const limite = Date.now() + timeoutMs;
          while (this.inFlight > 0 && Date.now() < limite) {
            await new Promise((r) => setTimeout(r, 20));
          }
        },
      },
      timeoutMs,
    );
  }
}
