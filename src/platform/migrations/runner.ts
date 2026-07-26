/**
 * Executor de migrations.
 *
 * Aplica os arquivos `NNNN_*.sql` em ordem, uma vez cada, registrando em
 * `platform.schema_migration`. Três propriedades importam mais que o resto:
 *
 *  - **ordem**: por nome, e o nome começa com número. Ordem de leitura de
 *    diretório varia entre sistemas de arquivos, e um schema aplicado fora de
 *    ordem falha em um sistema e passa em outro;
 *  - **uma vez**: o que já está registrado não roda de novo;
 *  - **checksum**: se um arquivo já aplicado mudou de conteúdo, o executor
 *    PARA. É o sintoma de que duas máquinas têm schemas diferentes achando que
 *    têm o mesmo — e continuar seria escolher qual delas vai quebrar primeiro.
 *
 * Cada migration roda em sua própria transação: uma falha no meio não deixa
 * meia migration aplicada, e as anteriores continuam válidas.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqlClient, TransactionalSqlClient } from "../persistence/sql-client";

export interface MigrationFile {
  version: string;
  path: string;
  sql: string;
  checksum: string;
}

export interface MigrationOutcome {
  applied: string[];
  skipped: string[];
  /** Preenchido quando o executor parou por divergência. */
  mismatch?: { version: string; esperado: string; encontrado: string };
}

export function sha256(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex").slice(0, 16);
}

export function loadMigrations(dir: string): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort() // o prefixo numérico é o que torna a ordem determinística
    .map((f) => {
      const path = join(dir, f);
      // Normaliza a quebra de linha ANTES do hash: o mesmo arquivo checado no
      // Windows e no Linux tem bytes diferentes e conteúdo idêntico. Sem isto,
      // trocar de máquina viraria "migration divergente".
      const sql = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
      return { version: f.replace(/\.sql$/, ""), path, sql, checksum: sha256(sql) };
    });
}

/** Cria a tabela de controle. É a única coisa que roda fora de migration. */
async function garantirTabelaDeControle(sql: SqlClient): Promise<void> {
  await sql.query(`CREATE SCHEMA IF NOT EXISTS platform`);
  await sql.query(
    `CREATE TABLE IF NOT EXISTS platform.schema_migration (
       version    TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       checksum   TEXT NOT NULL
     )`,
  );
}

export async function runMigrations(
  client: TransactionalSqlClient,
  dir: string,
): Promise<MigrationOutcome> {
  await garantirTabelaDeControle(client);

  const registradas = new Map<string, string>();
  for (const l of await client.query<{ version: string; checksum: string }>(
    `SELECT version, checksum FROM platform.schema_migration`,
  )) {
    registradas.set(String(l.version), String(l.checksum));
  }

  const resultado: MigrationOutcome = { applied: [], skipped: [] };

  for (const m of loadMigrations(dir)) {
    const jaAplicada = registradas.get(m.version);

    if (jaAplicada !== undefined) {
      // A migration 0002 registra a si mesma com um marcador em vez de hash,
      // porque ela escreve a própria linha. Nesses casos não há o que comparar.
      const comparavel = /^[0-9a-f]{16}$/.test(jaAplicada);
      if (comparavel && jaAplicada !== m.checksum) {
        resultado.mismatch = {
          version: m.version,
          esperado: jaAplicada,
          encontrado: m.checksum,
        };
        // Parar aqui é deliberado: aplicar as seguintes por cima de um schema
        // que já divergiu produz um estado que ninguém consegue reconstruir.
        return resultado;
      }
      resultado.skipped.push(m.version);
      continue;
    }

    await client.transaction(async (tx) => {
      await tx.query(m.sql);
      await tx.query(
        `INSERT INTO platform.schema_migration (version, checksum)
         VALUES ($1, $2) ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum`,
        [m.version, m.checksum],
      );
    });
    resultado.applied.push(m.version);
  }

  return resultado;
}
