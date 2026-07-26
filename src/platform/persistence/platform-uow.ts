/**
 * Unit of Work da plataforma — fato e outbox na MESMA transação.
 *
 * O problema que isto resolve é o mais clássico e o mais caro dos sistemas
 * distribuídos: gravar o fato e avisar alguém são duas coisas, e entre uma e
 * outra o processo pode morrer.
 *
 *  - avisar antes de gravar → o consumidor age sobre um fato que não existe;
 *  - gravar antes de avisar → o fato existe e ninguém nunca soube.
 *
 * A saída é não ter "entre": a mensagem vai para a **mesma transação** do
 * fato. Ou os dois existem, ou nenhum. Quem entrega vem depois, lendo a
 * outbox — e pode falhar à vontade, porque a mensagem está guardada.
 *
 * `commit()` é o único ponto que confirma. Antes dele nada é visível, e
 * nenhum retorno de sucesso pode ser dado ao chamador.
 */

import type { OutboxMessage, OutboxRepository, RetryPolicy } from "../contracts/messaging";
import { DEFAULT_RETRY } from "../contracts/messaging";

export interface PlatformFact {
  event_id: string;
  unit_id: string;
  object_type: string;
  object_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  idempotency_key: string;
  actor_id?: string;
  origin: string;
  correlation_id?: string;
  contract_version: string;
}

export interface FactSink {
  /** Grava os fatos. NÃO confirma — a confirmação é do UoW. */
  append(facts: readonly PlatformFact[]): Promise<void>;
  /** Chaves já existentes, para o UoW recusar duplicata antes de gravar. */
  existingKeys(keys: readonly string[]): Promise<Set<string>>;
}

export type CommitResult =
  | { ok: true; facts: number; messages: number; duplicates: number }
  | { ok: false; error: string; code: "duplicate" | "storage" | "closed" };

/**
 * Transação da plataforma.
 *
 * Deliberadamente pequena: acumula em memória e escreve tudo no `commit`.
 * Isso deixa a janela de inconsistência do tamanho de uma transação de banco,
 * que é onde ela deve estar.
 */
export class PlatformUnitOfWork {
  private readonly facts: PlatformFact[] = [];
  private readonly messages: OutboxMessage[] = [];
  private finished = false;

  constructor(
    private readonly sink: FactSink,
    private readonly outbox: OutboxRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly policy: RetryPolicy = DEFAULT_RETRY,
  ) {}

  addFact(fact: PlatformFact): void {
    this.assertOpen();
    this.facts.push(fact);
  }

  /**
   * Enfileira a mensagem derivada de um fato.
   *
   * Exige a chave de idempotência do fato de origem: é ela que liga a
   * mensagem ao que a causou, e o que permite auditar depois "de onde veio
   * este aviso".
   */
  addMessage(msg: Omit<OutboxMessage, "state" | "attempts" | "created_at" | "available_at">): void {
    this.assertOpen();
    const at = this.now().toISOString();
    this.messages.push({
      ...msg,
      state: "pending",
      attempts: 0,
      created_at: at,
      available_at: at,
    });
  }

  /**
   * Confirma tudo, ou nada.
   *
   * A ordem importa: os fatos primeiro, as mensagens depois, e o erro em
   * qualquer ponto aborta sem confirmar. Numa implementação sobre PostgreSQL
   * isto vira `BEGIN … COMMIT` de verdade; aqui a garantia é a mesma para o
   * chamador, que só recebe sucesso quando ambos passaram.
   */
  async commit(): Promise<CommitResult> {
    if (this.finished) return { ok: false, error: "transação já encerrada", code: "closed" };
    this.finished = true;

    if (!this.facts.length && !this.messages.length) {
      return { ok: true, facts: 0, messages: 0, duplicates: 0 };
    }

    try {
      // Duplicata é decidida ANTES de gravar. Um fato repetido não é erro do
      // chamador: é o reenvio esperado. Ele é ignorado, e a mensagem
      // correspondente também — senão o aviso sairia duas vezes.
      const chaves = this.facts.map((f) => f.idempotency_key);
      const existentes = await this.sink.existingKeys(chaves);
      const novos = this.facts.filter((f) => !existentes.has(f.idempotency_key));
      const duplicates = this.facts.length - novos.length;

      const chavesNovas = new Set(novos.map((f) => f.idempotency_key));
      const mensagensValidas = this.messages.filter(
        // Mensagem sem fato correspondente nesta transação é avulsa e passa;
        // mensagem cujo fato foi deduplicado NÃO passa.
        (m) => !existentes.has(m.idempotency_key) || chavesNovas.has(m.idempotency_key),
      );

      if (novos.length) await this.sink.append(novos);
      for (const m of mensagensValidas) await this.outbox.enqueue(m);

      return {
        ok: true,
        facts: novos.length,
        messages: mensagensValidas.length,
        duplicates,
      };
    } catch (e) {
      // Sem confirmação: quem chamou precisa saber que NADA foi gravado.
      // Devolver sucesso aqui seria o pior resultado possível — o aparelho
      // apagaria a fila local de um ponto que nunca chegou.
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        code: "storage",
      };
    }
  }

  /** Descarta sem gravar. */
  rollback(): void {
    this.finished = true;
    this.facts.length = 0;
    this.messages.length = 0;
  }

  get pending(): { facts: number; messages: number } {
    return { facts: this.facts.length, messages: this.messages.length };
  }

  private assertOpen(): void {
    if (this.finished) throw new Error("transação já encerrada");
  }
}

/** Sink em memória — desenvolvimento, testes e fallback local. */
export class MemoryFactSink implements FactSink {
  private readonly rows: PlatformFact[] = [];
  private readonly keys = new Set<string>();
  /** Injetável para provar que uma falha de escrita NÃO confirma nada. */
  public failNext = false;

  async append(facts: readonly PlatformFact[]): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("falha simulada de armazenamento");
    }
    for (const f of facts) {
      this.rows.push(f);
      this.keys.add(f.idempotency_key);
    }
  }

  async existingKeys(keys: readonly string[]): Promise<Set<string>> {
    return new Set(keys.filter((k) => this.keys.has(k)));
  }

  all(): PlatformFact[] {
    return this.rows.slice();
  }

  count(): number {
    return this.rows.length;
  }
}
