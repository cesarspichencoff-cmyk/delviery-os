/**
 * PostgreSQL da fronteira de procedência: registro de produtores (leitura) e
 * livro de admissões (append-only, migration 0010).
 *
 * O escritor atestado NÃO reescreve o SQL do event_log: ele entrega ao
 * PgTransactionalWriter de sempre uma transação que JÁ gravou a linha de
 * admissão. Admissão, fato e mensagem confirmam juntos ou não confirmam.
 * Um nonce reusado por outro envelope bate no índice único parcial, a
 * transação inteira volta, e o próximo tick o põe em quarentena.
 */
import type { EscritorTransacional } from "../ingest/ingest-service";
import type {
  AdmissaoAnterior,
  ChaveDeProdutor,
  LivroDeAdmissoes,
  ModoConcedivel,
  RegistroDeAdmissao,
  RegistroDeProdutores,
} from "../ingest/fronteira-de-procedencia";
import { PgTransactionalWriter } from "./pg-repositories";
import type { SqlClient, SqlRow, TransactionalSqlClient } from "./sql-client";

function data(v: unknown, coluna: string): Date {
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new Error("producer_key_" + coluna + "_invalida");
  return d;
}

function textos(v: unknown, coluna: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new Error("producer_key_" + coluna + "_invalida");
  }
  return v as string[];
}

export class PgRegistroDeProdutores implements RegistroDeProdutores {
  constructor(private readonly client: SqlClient) {}

  async buscar(producer_id: string, key_id: string): Promise<ChaveDeProdutor | null> {
    const linhas = await this.client.query<SqlRow>(
      `SELECT producer_id, key_id, unit_id, public_key, allowed_event_types,
              allowed_modes, not_before, not_after, revoked_at
         FROM platform.producer_key
        WHERE producer_id = $1 AND key_id = $2`,
      [producer_id, key_id],
    );
    if (!linhas.length) return null;
    const l = linhas[0];
    if (!(l.public_key instanceof Uint8Array)) throw new Error("producer_key_public_key_invalida");
    const modos = textos(l.allowed_modes, "allowed_modes");
    // O CHECK da 0010 já impede; conferir de novo custa nada e não depende
    // de o banco ter recebido a migration certa.
    if (modos.some((m) => m !== "simulated" && m !== "control")) {
      throw new Error("producer_key_modo_nao_concedivel");
    }
    return {
      producer_id: String(l.producer_id),
      key_id: String(l.key_id),
      unit_id: String(l.unit_id),
      public_key: new Uint8Array(l.public_key),
      allowed_event_types: textos(l.allowed_event_types, "allowed_event_types"),
      allowed_modes: modos as ModoConcedivel[],
      not_before: data(l.not_before, "not_before"),
      not_after: data(l.not_after, "not_after"),
      revoked_at: l.revoked_at === null || l.revoked_at === undefined
        ? null
        : data(l.revoked_at, "revoked_at"),
    };
  }
}

const INSERIR_ADMISSAO = `
  INSERT INTO platform.producer_admission
    (decision, reason, producer_id, key_id, nonce, unit_id, event_id, event_type,
     declared_mode, assigned_mode, envelope_sha256, source_ref, received_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  ON CONFLICT (source_ref, envelope_sha256) DO NOTHING`;

function valores(r: RegistroDeAdmissao): unknown[] {
  return [
    r.decision, r.reason, r.producer_id, r.key_id, r.nonce, r.unit_id, r.event_id,
    r.event_type, r.declared_mode, r.assigned_mode, r.envelope_sha256, r.source_ref,
    r.received_at,
  ];
}

export class PgLivroDeAdmissoes implements LivroDeAdmissoes {
  constructor(private readonly client: TransactionalSqlClient) {}

  async decisaoAnterior(source_ref: string, envelope_sha256: string) {
    const l = await this.client.query<SqlRow>(
      `SELECT decision, reason FROM platform.producer_admission
        WHERE source_ref = $1 AND envelope_sha256 = $2`,
      [source_ref, envelope_sha256],
    );
    if (!l.length) return null;
    const decision = l[0].decision === "admitted" ? "admitted" : "quarantined";
    return { decision, reason: String(l[0].reason) } as const;
  }

  private async admitida(coluna: "nonce" | "event_id", producer_id: string, valor: string) {
    const l = await this.client.query<SqlRow>(
      `SELECT envelope_sha256, source_ref FROM platform.producer_admission
        WHERE decision = 'admitted' AND producer_id = $1 AND ${coluna} = $2`,
      [producer_id, valor],
    );
    return l.length
      ? ({ envelope_sha256: String(l[0].envelope_sha256), source_ref: String(l[0].source_ref) } as AdmissaoAnterior)
      : null;
  }

  admitidaPorNonce(producer_id: string, nonce: string) {
    return this.admitida("nonce", producer_id, nonce);
  }

  admitidaPorEvento(producer_id: string, event_id: string) {
    return this.admitida("event_id", producer_id, event_id);
  }

  async quarentenar(r: RegistroDeAdmissao): Promise<void> {
    if (r.decision !== "quarantined") throw new Error("quarentena_com_decisao_errada");
    await this.client.query(INSERIR_ADMISSAO, valores(r));
  }

  async admitirSemFato(r: RegistroDeAdmissao): Promise<void> {
    if (r.decision !== "admitted") throw new Error("admissao_com_decisao_errada");
    await this.client.query(INSERIR_ADMISSAO, valores(r));
  }

  escritor(r: RegistroDeAdmissao): EscritorTransacional {
    if (r.decision !== "admitted") throw new Error("escritor_atestado_sem_admissao");
    const client = this.client;
    return new PgTransactionalWriter({
      transaction: <T>(fn: (tx: SqlClient) => Promise<T>) =>
        client.transaction(async (tx) => {
          await tx.query(INSERIR_ADMISSAO, valores(r));
          return fn(tx);
        }),
    });
  }
}
