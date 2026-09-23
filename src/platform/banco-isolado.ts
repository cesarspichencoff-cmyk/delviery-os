/**
 * Banco ISOLADO por execução, para suítes que sobem processo contra PostgreSQL.
 *
 * Criado, migrado pelo runner real e apagado no fim. Suíte que presume banco
 * vazio e roda num compartilhado reprova o produto por um fato do ambiente.
 * Aconteceu DUAS vezes com o `spine:processos`:
 *
 *  - no PB19, 25 mensagens alheias na OUTBOX ficaram na frente da dele;
 *  - na Q-016, depois que o worker passou a reconstruir a projeção do EVENT
 *    LOG no boot, um único fato de outra suíte no log compartilhado virou um
 *    escopo a mais, e o P5 — que espera exatamente dois — caiu. Reproduzido
 *    plantando um fato alheio num banco limpo: 7/7 sem ele, 6/7 com ele.
 *
 * A primeira correção tratou o sintoma daquela vez (esperar pela própria
 * mensagem). A segunda trata a classe: o teste não compartilha estado durável
 * com ninguém.
 *
 * Um módulo só para todas as suítes que precisam disso: duas noções de "banco
 * limpo" divergiriam, e a mais frouxa é a que ninguém nota.
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
 * É como se simula um ambiente que já existia antes de uma migration — a Q-016
 * usa para o histórico anterior à 0003: o runner real, as migrations reais, só
 * que paradas no ponto em que o histórico nasceu.
 */
export function migrationsAte(versao: string): string {
  const origem = diretorioDeMigrations();
  const destino = mkdtempSync(join(tmpdir(), "migrations-ate-"));
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

/**
 * @param prefixo nome da suíte, para um banco esquecido por uma execução morta
 *   ser atribuível a quem o criou.
 */
export async function bancoIsolado(urlBase: string, ate?: string, prefixo = "iso"): Promise<BancoIsolado> {
  const nome = `${prefixo}_${process.pid}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
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
