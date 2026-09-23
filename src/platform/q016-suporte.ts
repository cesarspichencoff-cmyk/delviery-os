/**
 * Suporte de teste da Q-016: banco ISOLADO por execução.
 *
 * Criado, migrado pelo runner real e apagado no fim. Suíte que presume banco
 * vazio e roda num compartilhado reprova o produto por um fato do ambiente —
 * foi o que o `spine:processos` fez no PB19, com 25 mensagens alheias na
 * frente da dele.
 *
 * Um módulo só para os dois runners da Q-016 (contrato e processos): duas
 * noções de "banco limpo" divergiriam, e a mais frouxa é a que ninguém nota.
 */

import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runMigrations } from "./migrations/runner";
import { diretorioDeMigrations } from "./migrations/localizar";
import { createPgClient, type PgSqlClient } from "./persistence/sql-client";

export function urlCom(base: string, banco: string): string {
  const u = new URL(base);
  u.pathname = `/${banco}`;
  return u.toString();
}

/**
 * Diretório com as migrations ATÉ uma versão, inclusive.
 *
 * É como se simula um ambiente que já existia antes da 0003: o runner real,
 * as migrations reais, só que paradas no ponto em que o histórico nasceu.
 */
export function migrationsAte(versao: string): string {
  const origem = diretorioDeMigrations();
  const destino = mkdtempSync(join(tmpdir(), "q016-migrations-"));
  for (const f of readdirSync(origem).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort()) {
    if (f.replace(/\.sql$/, "") > versao) continue;
    copyFileSync(join(origem, f), join(destino, f));
  }
  return destino;
}

export interface BancoIsolado {
  nome: string;
  url: string;
  cliente: PgSqlClient;
  migrarTudo(): Promise<string[]>;
  descartar(): Promise<void>;
}

export async function bancoIsolado(urlBase: string, ate?: string): Promise<BancoIsolado> {
  const nome = `q016_${process.pid}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const admin = await createPgClient({ url: urlCom(urlBase, "postgres"), max: 1 });
  await admin.query(`CREATE DATABASE ${nome}`);
  const url = urlCom(urlBase, nome);
  const cliente = await createPgClient({ url, max: 4 });
  const parcial = ate ? migrationsAte(ate) : null;
  const m = await runMigrations(cliente, parcial ?? diretorioDeMigrations());
  if (parcial) rmSync(parcial, { recursive: true, force: true });
  if (m.mismatch) throw new Error(`migration divergente no banco isolado: ${m.mismatch.version}`);
  return {
    nome,
    url,
    cliente,
    async migrarTudo() {
      const r = await runMigrations(cliente, diretorioDeMigrations());
      if (r.mismatch) throw new Error(`migration divergente: ${r.mismatch.version}`);
      return r.applied;
    },
    async descartar() {
      await cliente.close();
      await admin.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
      await admin.close();
    },
  };
}
