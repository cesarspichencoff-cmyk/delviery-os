/**
 * Implementações PostgreSQL das portas de mensageria.
 *
 * As versões em memória (`memory-queues.ts`) descrevem a semântica; estas
 * fazem o banco garanti-la. Onde a memória depende de a thread ser uma só,
 * aqui o SQL precisa dizer explicitamente o que quer:
 *
 *  - `ON CONFLICT DO NOTHING` decide duplicidade no banco, não com um SELECT
 *    seguido de INSERT — entre os dois cabe outro processo;
 *  - `FOR UPDATE SKIP LOCKED` reserva sem que dois workers levem o mesmo item
 *    e sem que um espere o outro;
 *  - a devolução de lease vencido é um UPDATE condicional, e NÃO incrementa
 *    tentativa: o processo morreu, o trabalho não falhou.
 *
 * Nenhuma classe daqui conhece o driver — só a porta `SqlClient`.
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
  JobState,
  OutboxState,
} from "../contracts/messaging";
import { decideAfterFailure, nextAvailableAt } from "../contracts/messaging";
import type { SqlClient, SqlRow } from "./sql-client";

/** Converte TIMESTAMPTZ para ISO-8601 UTC, ou undefined. */
function iso(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) return v.toISOString();
  return new Date(String(v)).toISOString();
}

function isoObrigatorio(v: unknown): string {
  const s = iso(v);
  if (!s) throw new Error("carimbo de tempo obrigatório ausente");
  return s;
}

/* ------------------------------------------------------------------ *
 * Inbox
 * ------------------------------------------------------------------ */

export class PgInboxRepository implements InboxRepository {
  constructor(private readonly sql: SqlClient) {}

  async accept(record: InboxRecord): Promise<InboxResult> {
    if (!record.idempotency_key?.trim()) {
      return { accepted: false, reason: "invalid", detail: "idempotency_key ausente" };
    }
    if (!record.unit_id?.trim()) {
      return { accepted: false, reason: "invalid", detail: "unit_id ausente" };
    }

    // Uma ida só ao banco. Verificar antes e inserir depois abriria a janela
    // em que dois envios do mesmo aparelho passam pela verificação juntos.
    const linhas = await this.sql.query<SqlRow>(
      `INSERT INTO platform.inbox
         (idempotency_key, unit_id, source, kind, payload, occurred_at, received_at, sequence_local, device_id)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING received_at`,
      [
        record.idempotency_key,
        record.unit_id,
        record.source,
        record.kind,
        JSON.stringify(record.payload ?? {}),
        record.occurred_at,
        record.received_at,
        record.sequence_local ?? null,
        record.device_id ?? null,
      ],
    );

    if (linhas.length) return { accepted: true, record };

    // Não inseriu: já existia. Devolver QUANDO chegou da primeira vez é o que
    // permite ao cliente entender que sua retentativa foi reconhecida.
    const anterior = await this.sql.query<SqlRow>(
      `SELECT received_at FROM platform.inbox WHERE idempotency_key = $1`,
      [record.idempotency_key],
    );
    return {
      accepted: false,
      reason: "duplicate",
      existing_received_at: isoObrigatorio(anterior[0]?.received_at),
    };
  }

  async find(idempotency_key: string): Promise<InboxRecord | null> {
    const r = await this.sql.query<SqlRow>(
      `SELECT idempotency_key, unit_id, source, kind, payload, occurred_at,
              received_at, sequence_local, device_id
         FROM platform.inbox WHERE idempotency_key = $1`,
      [idempotency_key],
    );
    if (!r.length) return null;
    const l = r[0];
    return {
      idempotency_key: String(l.idempotency_key),
      unit_id: String(l.unit_id),
      source: String(l.source),
      kind: String(l.kind),
      payload: (l.payload ?? {}) as Record<string, unknown>,
      occurred_at: isoObrigatorio(l.occurred_at),
      received_at: isoObrigatorio(l.received_at),
      sequence_local: l.sequence_local === null ? undefined : Number(l.sequence_local),
      device_id: l.device_id === null ? undefined : String(l.device_id),
    };
  }
}

/* ------------------------------------------------------------------ *
 * Outbox
 * ------------------------------------------------------------------ */

function paraOutbox(l: SqlRow): OutboxMessage {
  return {
    outbox_id: String(l.outbox_id),
    stream: String(l.stream),
    kind: String(l.kind),
    payload: (l.payload ?? {}) as Record<string, unknown>,
    idempotency_key: String(l.idempotency_key),
    correlation_id: l.correlation_id === null ? "" : String(l.correlation_id),
    created_at: isoObrigatorio(l.created_at),
    state: String(l.state) as OutboxState,
    attempts: Number(l.attempts),
    available_at: isoObrigatorio(l.available_at),
    locked_at: iso(l.locked_at),
    locked_by: l.locked_by === null ? undefined : String(l.locked_by),
    processed_at: iso(l.processed_at),
    last_error: l.last_error === null ? undefined : String(l.last_error),
  };
}

const COLUNAS_OUTBOX = `outbox_id, stream, kind, payload, idempotency_key, correlation_id,
                        state, attempts, created_at, available_at, locked_at, locked_by,
                        processed_at, last_error`;

/**
 * As mesmas colunas, qualificadas pelo alias.
 *
 * Obrigatorio no `UPDATE ... FROM cte ... RETURNING`: a CTE tambem carrega a
 * coluna de identificador, e o PostgreSQL recusa a referencia ambigua.
 */
const COLUNAS_OUTBOX_ALIAS = COLUNAS_OUTBOX.split(",")
  .map((c) => `o.${c.trim()}`)
  .join(", ");

export class PgOutboxRepository implements OutboxRepository {
  constructor(private readonly sql: SqlClient) {}

  /**
   * Enfileira.
   *
   * Recebe o `SqlClient` da TRANSAÇÃO do fato quando construído dentro dela —
   * é assim que fato e mensagem confirmam juntos. Construir este repositório
   * com o cliente do pool e chamá-lo "dentro" de uma transação lógica é o erro
   * que quebra a garantia sem dar sinal.
   */
  async enqueue(message: OutboxMessage): Promise<void> {
    await this.sql.query(
      `INSERT INTO platform.outbox
         (outbox_id, stream, kind, payload, idempotency_key, correlation_id,
          state, attempts, created_at, available_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (outbox_id) DO NOTHING`,
      [
        message.outbox_id,
        message.stream,
        message.kind,
        JSON.stringify(message.payload ?? {}),
        message.idempotency_key,
        message.correlation_id || null,
        message.state ?? "pending",
        message.attempts ?? 0,
        message.created_at,
        message.available_at ?? message.created_at,
      ],
    );
  }

  async claim(worker_id: string, limit: number, now: Date): Promise<OutboxMessage[]> {
    const linhas = await this.sql.query<SqlRow>(
      `WITH pego AS (
         SELECT outbox_id FROM platform.outbox
          WHERE state = 'pending' AND available_at <= $3
          ORDER BY created_at, outbox_id
          FOR UPDATE SKIP LOCKED
          LIMIT $2
       )
       UPDATE platform.outbox o
          SET state = 'processing', locked_by = $1, locked_at = $3
         FROM pego WHERE o.outbox_id = pego.outbox_id
       RETURNING ${COLUNAS_OUTBOX_ALIAS}`,
      [worker_id, limit, now.toISOString()],
    );
    return linhas.map(paraOutbox);
  }

  async markDone(outbox_id: string, now: Date): Promise<void> {
    await this.sql.query(
      `UPDATE platform.outbox
          SET state='done', processed_at=$2, locked_by=NULL, locked_at=NULL, last_error=NULL
        WHERE outbox_id=$1`,
      [outbox_id, now.toISOString()],
    );
  }

  async markFailed(
    outbox_id: string,
    error: string,
    policy: RetryPolicy,
    now: Date,
  ): Promise<"retry" | "dead"> {
    // O incremento acontece no banco para que a contagem sobreviva a dois
    // workers decidindo ao mesmo tempo.
    const r = await this.sql.query<SqlRow>(
      `UPDATE platform.outbox SET attempts = attempts + 1, last_error = $2
        WHERE outbox_id = $1 RETURNING attempts, idempotency_key`,
      [outbox_id, error.slice(0, 2000)],
    );
    if (!r.length) return "retry";

    const tentativas = Number(r[0].attempts);
    const decisao = decideAfterFailure(tentativas, policy);

    if (decisao === "dead") {
      await this.sql.query(
        `UPDATE platform.outbox SET state='dead', locked_by=NULL, locked_at=NULL, processed_at=$2
          WHERE outbox_id=$1`,
        [outbox_id, now.toISOString()],
      );
      return "dead";
    }

    await this.sql.query(
      `UPDATE platform.outbox
          SET state='pending', locked_by=NULL, locked_at=NULL, available_at=$2
        WHERE outbox_id=$1`,
      [outbox_id, nextAvailableAt(tentativas, policy, String(r[0].idempotency_key), now)],
    );
    return "retry";
  }

  async deadLetters(limit: number): Promise<OutboxMessage[]> {
    const r = await this.sql.query<SqlRow>(
      `SELECT ${COLUNAS_OUTBOX} FROM platform.outbox
        WHERE state='dead' ORDER BY created_at LIMIT $1`,
      [limit],
    );
    return r.map(paraOutbox);
  }

  /**
   * Reprocessamento manual.
   *
   * Registra QUEM mandou reprocessar na auditoria. Tirar algo da dead-letter
   * é decisão humana com consequência externa — pode disparar de novo um
   * efeito que já aconteceu — e precisa de dono.
   */
  async requeue(outbox_id: string, actor_id: string, now: Date): Promise<boolean> {
    const r = await this.sql.query<SqlRow>(
      `UPDATE platform.outbox
          SET state='pending', attempts=0, available_at=$2, locked_by=NULL,
              locked_at=NULL, processed_at=NULL
        WHERE outbox_id=$1 AND state='dead'
        RETURNING outbox_id`,
      [outbox_id, now.toISOString()],
    );
    if (!r.length) return false;

    await this.sql.query(
      `INSERT INTO platform.audit (actor_id, action, object_type, object_id, granted, detail, at)
       VALUES ($1,'outbox_requeue','outbox',$2,true,$3::jsonb,$4)`,
      [actor_id, outbox_id, JSON.stringify({ motivo: "reprocessamento manual" }), now.toISOString()],
    );
    return true;
  }

  async pendingCount(): Promise<number> {
    const r = await this.sql.query<SqlRow>(
      `SELECT count(*)::int AS n FROM platform.outbox WHERE state='pending'`,
    );
    return Number(r[0]?.n ?? 0);
  }
}

/* ------------------------------------------------------------------ *
 * Jobs
 * ------------------------------------------------------------------ */

function paraJob(l: SqlRow): Job {
  return {
    job_id: String(l.job_id),
    kind: String(l.kind),
    payload: (l.payload ?? {}) as Record<string, unknown>,
    idempotency_key: String(l.idempotency_key),
    state: String(l.state) as JobState,
    attempts: Number(l.attempts),
    max_attempts: Number(l.max_attempts),
    available_at: isoObrigatorio(l.available_at),
    locked_at: iso(l.locked_at),
    locked_by: l.locked_by === null ? undefined : String(l.locked_by),
    lease_expires_at: iso(l.lease_expires_at),
    processed_at: iso(l.processed_at),
    last_error: l.last_error === null ? undefined : String(l.last_error),
    created_at: isoObrigatorio(l.created_at),
  };
}

const COLUNAS_JOB = `job_id, kind, payload, idempotency_key, state, attempts, max_attempts,
                     created_at, available_at, locked_at, locked_by, lease_expires_at,
                     processed_at, last_error`;

/** Idem: qualificadas para o RETURNING do claim. */
const COLUNAS_JOB_ALIAS = COLUNAS_JOB.split(",")
  .map((c) => `j.${c.trim()}`)
  .join(", ");

export class PgJobRepository implements JobRepository {
  constructor(private readonly sql: SqlClient) {}

  async schedule(job: Job): Promise<void> {
    // A chave de idempotência é UNIQUE no schema: agendar o mesmo trabalho
    // duas vezes é ignorado, e não duplicado.
    await this.sql.query(
      `INSERT INTO platform.job
         (job_id, kind, payload, idempotency_key, state, attempts, max_attempts, created_at, available_at)
       VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        job.job_id,
        job.kind,
        JSON.stringify(job.payload ?? {}),
        job.idempotency_key,
        job.state ?? "pending",
        job.attempts ?? 0,
        job.max_attempts,
        job.created_at,
        job.available_at ?? job.created_at,
      ],
    );
  }

  async claim(worker_id: string, limit: number, policy: RetryPolicy, now: Date): Promise<Job[]> {
    const expira = new Date(now.getTime() + policy.lease_ms).toISOString();
    const r = await this.sql.query<SqlRow>(
      `WITH pego AS (
         SELECT job_id FROM platform.job
          WHERE state='pending' AND available_at <= $3
          ORDER BY created_at, job_id
          FOR UPDATE SKIP LOCKED
          LIMIT $2
       )
       UPDATE platform.job j
          SET state='running', locked_by=$1, locked_at=$3, lease_expires_at=$4,
              attempts = j.attempts + 1
         FROM pego WHERE j.job_id = pego.job_id
       RETURNING ${COLUNAS_JOB_ALIAS}`,
      [worker_id, limit, now.toISOString(), expira],
    );
    return r.map(paraJob);
  }

  async markDone(job_id: string, now: Date): Promise<void> {
    await this.sql.query(
      `UPDATE platform.job
          SET state='done', processed_at=$2, locked_by=NULL, locked_at=NULL,
              lease_expires_at=NULL, last_error=NULL
        WHERE job_id=$1`,
      [job_id, now.toISOString()],
    );
  }

  async markFailed(
    job_id: string,
    error: string,
    policy: RetryPolicy,
    now: Date,
  ): Promise<"retry" | "dead"> {
    const r = await this.sql.query<SqlRow>(
      `SELECT attempts, max_attempts, idempotency_key FROM platform.job WHERE job_id=$1`,
      [job_id],
    );
    if (!r.length) return "retry";

    // A tentativa já foi contada no claim — quem pega, gasta. Contar de novo
    // aqui faria cada falha valer por duas e cortar o retry pela metade.
    const tentativas = Number(r[0].attempts);
    const teto = Math.min(Number(r[0].max_attempts), policy.max_attempts);
    const decisao = decideAfterFailure(tentativas, { ...policy, max_attempts: teto });

    if (decisao === "dead") {
      await this.sql.query(
        `UPDATE platform.job
            SET state='dead', last_error=$2, processed_at=$3, locked_by=NULL,
                locked_at=NULL, lease_expires_at=NULL
          WHERE job_id=$1`,
        [job_id, error.slice(0, 2000), now.toISOString()],
      );
      return "dead";
    }

    await this.sql.query(
      `UPDATE platform.job
          SET state='pending', last_error=$2, available_at=$3, locked_by=NULL,
              locked_at=NULL, lease_expires_at=NULL
        WHERE job_id=$1`,
      [
        job_id,
        error.slice(0, 2000),
        nextAvailableAt(tentativas, policy, String(r[0].idempotency_key), now),
      ],
    );
    return "retry";
  }

  /**
   * Devolve à fila o que ficou preso.
   *
   * NÃO incrementa `attempts`. Lease vencido significa que o worker sumiu — o
   * trabalho sequer chegou a falhar. Cobrar tentativa aqui mataria por
   * dead-letter um job que nunca foi executado, e faria uma reinicialização de
   * máquina parecer um erro de negócio.
   */
  async reclaimExpired(now: Date): Promise<number> {
    const r = await this.sql.query<SqlRow>(
      `UPDATE platform.job
          SET state='pending', locked_by=NULL, locked_at=NULL,
              lease_expires_at=NULL, available_at=$1
        WHERE state='running' AND lease_expires_at IS NOT NULL AND lease_expires_at <= $1
        RETURNING job_id`,
      [now.toISOString()],
    );
    return r.length;
  }

  async deadLetters(limit: number): Promise<Job[]> {
    const r = await this.sql.query<SqlRow>(
      `SELECT ${COLUNAS_JOB} FROM platform.job WHERE state='dead' ORDER BY created_at LIMIT $1`,
      [limit],
    );
    return r.map(paraJob);
  }

  async pendingCount(): Promise<number> {
    const r = await this.sql.query<SqlRow>(
      `SELECT count(*)::int AS n FROM platform.job WHERE state='pending'`,
    );
    return Number(r[0]?.n ?? 0);
  }
}

/* ------------------------------------------------------------------ *
 * Fato + mensagem na mesma transação
 * ------------------------------------------------------------------ */

export interface FactRecord {
  event_id: string;
  unit_id: string;
  object_type: string;
  object_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  recorded_at?: string;
  origin: string;
  actor_id?: string;
  device_id?: string;
  idempotency_key: string;
  correlation_id?: string;
  sequence_local?: number;
  contract_version: string;
}

/**
 * Grava fatos e enfileira mensagens numa transação só.
 *
 * É a razão de o outbox existir. Duas escritas separadas produzem, na queda
 * entre elas, um dos dois piores resultados possíveis: o fato existe e o aviso
 * nunca sai, ou o aviso saiu e o fato não existe. Nenhum retry conserta o
 * segundo.
 */
export class PgTransactionalWriter {
  constructor(
    private readonly client: { transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> },
  ) {}

  async commit(
    facts: readonly FactRecord[],
    messages: readonly OutboxMessage[],
  ): Promise<{ ok: true; facts: number; messages: number } | { ok: false; code: string; detail: string }> {
    try {
      return await this.client.transaction(async (tx) => {
        let gravados = 0;
        for (const f of facts) {
          const r = await tx.query<SqlRow>(
            `INSERT INTO platform.event_log
               (event_id, unit_id, object_type, object_id, event_type, payload, occurred_at,
                recorded_at, origin, actor_id, device_id, idempotency_key, correlation_id,
                sequence_local, contract_version)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             ON CONFLICT (idempotency_key) DO NOTHING
             RETURNING event_id`,
            [
              f.event_id,
              f.unit_id,
              f.object_type,
              f.object_id,
              f.event_type,
              JSON.stringify(f.payload ?? {}),
              f.occurred_at,
              f.recorded_at ?? new Date().toISOString(),
              f.origin,
              f.actor_id ?? null,
              f.device_id ?? null,
              f.idempotency_key,
              f.correlation_id ?? null,
              f.sequence_local ?? null,
              f.contract_version,
            ],
          );
          gravados += r.length;
        }

        // A outbox usa o MESMO `tx`: é isso, e só isso, que torna a garantia
        // real. Um repositório construído com o cliente do pool aqui dentro
        // escreveria fora da transação sem produzir erro nenhum.
        const outbox = new PgOutboxRepository(tx);
        for (const m of messages) await outbox.enqueue(m);

        return { ok: true as const, facts: gravados, messages: messages.length };
      });
    } catch (e) {
      return {
        ok: false as const,
        code: "storage",
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

/* ------------------------------------------------------------------ *
 * Sink de fatos
 * ------------------------------------------------------------------ */

/**
 * Grava fatos no event log.
 *
 * Recebe o cliente da transação em curso — nunca o pool — porque `append` é,
 * por contrato, a metade que ainda NÃO confirmou. Confirmar é do Unit of Work.
 */
export class PgFactSink {
  constructor(private readonly sql: SqlClient) {}

  async append(facts: readonly PlatformFactLike[]): Promise<void> {
    for (const f of facts) {
      await this.sql.query(
        `INSERT INTO platform.event_log
           (event_id, unit_id, object_type, object_id, event_type, payload, occurred_at,
            origin, actor_id, idempotency_key, correlation_id, contract_version)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          f.event_id,
          f.unit_id,
          f.object_type,
          f.object_id,
          f.event_type,
          JSON.stringify(f.payload ?? {}),
          f.occurred_at,
          f.origin,
          f.actor_id ?? null,
          f.idempotency_key,
          f.correlation_id ?? null,
          f.contract_version,
        ],
      );
    }
  }

  /**
   * Quais destas chaves já existem.
   *
   * Uma consulta só com `= ANY($1)`. Uma consulta por chave transformaria um
   * lote de sincronização do celular — que chega com dezenas de eventos — em
   * dezenas de idas ao banco.
   */
  async existingKeys(keys: readonly string[]): Promise<Set<string>> {
    if (!keys.length) return new Set();
    const r = await this.sql.query<SqlRow>(
      `SELECT idempotency_key FROM platform.event_log WHERE idempotency_key = ANY($1)`,
      [keys],
    );
    return new Set(r.map((l) => String(l.idempotency_key)));
  }
}

/** Forma mínima de um fato — evita import circular com o Unit of Work. */
export interface PlatformFactLike {
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
