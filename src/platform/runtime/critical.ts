/**
 * Runtime CRÍTICO.
 *
 * É o processo que a operação não pode perder: viagem, GPS, ocorrência, event
 * log, outbox. Ele **sobe e atende com CRM, Copiloto e IA completamente
 * ausentes** — essa é a propriedade que define a arquitetura, e é testada.
 *
 * O que ele nunca faz: esperar de forma síncrona por qualquer coisa da lista
 * de módulos assíncronos. Quando precisa avisar alguém, escreve na outbox e
 * segue. Quem entrega é outro processo, depois.
 */

import type { DependencyHealth, RuntimeHealth, RuntimeIdentity } from "../contracts/runtime";
import { composeHealth, shutdown, type ShutdownResult } from "../contracts/runtime";
import type { OutboxRepository, InboxRepository } from "../contracts/messaging";
import type { FactSink } from "../persistence/platform-uow";

export interface CriticalRuntimeDeps {
  identity: Omit<RuntimeIdentity, "kind" | "started_at">;
  facts: FactSink;
  outbox: OutboxRepository;
  inbox: InboxRepository;
  /** Verificação de escrita. `false` significa: não consigo persistir. */
  probeStorage: () => Promise<boolean>;
  /**
   * Saúde do consumidor assíncrono, se conhecida.
   *
   * Ausente ou `false` NÃO bloqueia: degrada. A rua continua; o backlog
   * espera. Bloquear aqui inverteria a arquitetura inteira.
   */
  probeAsyncConsumer?: () => Promise<boolean>;
  now?: () => Date;
}

export class CriticalRuntime {
  private readonly startedAt: string;
  private readonly now: () => Date;
  private draining = false;

  constructor(private readonly deps: CriticalRuntimeDeps) {
    this.now = deps.now ?? (() => new Date());
    this.startedAt = this.now().toISOString();
  }

  get identity(): RuntimeIdentity {
    return { ...this.deps.identity, kind: "critical", started_at: this.startedAt };
  }

  /** true enquanto aceita trabalho novo. */
  get accepting(): boolean {
    return !this.draining;
  }

  async health(): Promise<RuntimeHealth> {
    const at = this.now().toISOString();
    const dependencies: DependencyHealth[] = [];

    // Armazenamento é a ÚNICA dependência essencial do crítico. Se ele não
    // grava, não existe resposta honesta que não seja "bloqueado".
    let storageOk = false;
    try {
      storageOk = await this.deps.probeStorage();
    } catch {
      storageOk = false;
    }
    dependencies.push({
      name: "storage",
      state: storageOk ? "healthy" : "blocked",
      essential: true,
      detail: storageOk ? undefined : "não é possível persistir fatos",
      checked_at: at,
    });

    // Backlog é sinal, não falha. Fila crescendo com consumidor fora do ar é
    // exatamente o comportamento projetado.
    const pendentes = await this.deps.outbox.pendingCount();

    if (this.deps.probeAsyncConsumer) {
      let asyncOk = false;
      try {
        asyncOk = await this.deps.probeAsyncConsumer();
      } catch {
        asyncOk = false;
      }
      dependencies.push({
        name: "async_consumer",
        state: asyncOk ? "healthy" : "unavailable",
        essential: false,
        detail: asyncOk ? undefined : `consumidor fora do ar; ${pendentes} na fila`,
        checked_at: at,
      });
    }

    if (this.draining) {
      dependencies.push({
        name: "aceitacao",
        state: "read_only",
        essential: false,
        detail: "encerrando: não aceita trabalho novo",
        checked_at: at,
      });
    }

    return composeHealth({ identity: this.identity, dependencies, now: this.now() });
  }

  /** Encerramento gracioso: para de aceitar, termina o que está em curso. */
  async stop(timeoutMs = 25_000, onClose?: () => Promise<void> | void): Promise<ShutdownResult> {
    return shutdown(
      {
        drain: () => {
          this.draining = true;
        },
        close: async () => {
          if (onClose) await onClose();
        },
      },
      timeoutMs,
    );
  }
}

/**
 * Módulos que o runtime crítico carrega. Lista fechada, e é ela que o teste
 * estrutural usa para provar que nada de CRM/Copiloto/IA entrou aqui.
 */
export const CRITICAL_MODULES = [
  "core",
  "identity",
  "entregas",
  "sources",
  "orders",
  "shared-contracts",
  "infrastructure",
] as const;
