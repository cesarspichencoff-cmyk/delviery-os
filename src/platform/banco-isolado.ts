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
 * O CONTRATO DE PATRIMÔNIO — a suíte só apaga o que criou:
 *
 *  - o nome é próprio (prefixo da suíte, pid, instante, sorteio) e o banco
 *    nasce por `CREATE DATABASE`, que FALHA se o nome já existe. Colisão vira
 *    `ColisaoDeBanco` — nunca `DROP ... IF EXISTS` antes de criar, que é como
 *    uma suíte apaga o banco de outra achando que limpa o seu;
 *  - `descartar()` só apaga o banco que ESTE objeto criou, e uma vez só;
 *  - se algo falha DEPOIS de criar — migration, conexão —, o banco criado é
 *    apagado antes de a falha subir. Banco pela metade não fica para trás.
 *
 * O que ele não cobre, e está dito: processo morto por SIGKILL não roda
 * limpeza nenhuma, e o banco dele fica. A suíte nunca apaga "por prefixo"
 * para compensar — seria exatamente o jeito de apagar o que não criou.
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

export interface OpcoesDoBanco {
  /**
   * Nome exato, em vez do gerado. Existe para o controle de colisão: um nome
   * que já existe tem de ser RECUSADO, e o banco alheio, deixado como estava.
   */
  nome?: string;
}

/** O nome pedido já é de um banco que existia. Nada foi criado nem apagado. */
export class ColisaoDeBanco extends Error {
  constructor(readonly nome: string) {
    super(`o banco "${nome}" já existe e não foi criado por esta suíte — recusado, nada foi tocado`);
    this.name = "ColisaoDeBanco";
  }
}

const NOME_VALIDO = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * Cria o banco e devolve quem sabe apagá-lo. Núcleo único de `bancoIsolado`
 * e `bancoVazio`: o contrato de patrimônio mora aqui e só aqui.
 */
async function criar(
  urlBase: string,
  prefixo: string,
  opcoes: OpcoesDoBanco,
  preparar: (cliente: PgSqlClient) => Promise<void>,
): Promise<BancoIsolado> {
  const nome =
    opcoes.nome ??
    `${prefixo}_${process.pid}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  if (!NOME_VALIDO.test(nome)) throw new Error(`nome de banco inválido: ${JSON.stringify(nome)}`);

  const admin = await createPgClient({ url: urlCom(urlBase, "postgres"), max: 1 });
  try {
    await admin.query(`CREATE DATABASE ${nome}`);
  } catch (e) {
    await admin.close();
    // 42P04 = duplicate_database. Qualquer outra falha sobe como veio.
    if ((e as { code?: string }).code === "42P04") throw new ColisaoDeBanco(nome);
    throw e;
  }

  // Daqui em diante o banco é DESTA execução — e só a partir daqui ele pode
  // ser apagado por ela.
  let descartado = false;
  let cliente: PgSqlClient | null = null;
  const apagar = async (): Promise<void> => {
    if (descartado) return;
    descartado = true;
    if (cliente) await cliente.close().catch(() => undefined);
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
    } finally {
      await admin.close();
    }
  };

  try {
    const url = urlCom(urlBase, nome);
    cliente = await createPgClient({ url, max: 4 });
    await preparar(cliente);
    const c = cliente;
    return {
      nome,
      url,
      cliente: c,
      async migrarTudo() {
        const r = await runMigrations(c, diretorioDeMigrations());
        if (r.mismatch) throw new Error(`migration divergente: ${r.mismatch.version}`);
        return r.applied;
      },
      descartar: apagar,
    };
  } catch (e) {
    // Banco pela metade não fica para trás: a falha sobe DEPOIS da limpeza.
    await apagar().catch(() => undefined);
    throw e;
  }
}

/**
 * Banco migrado pelo runner real — todas as migrations, ou até `ate`.
 *
 * @param prefixo nome da suíte, para um banco esquecido por uma execução morta
 *   ser atribuível a quem o criou.
 */
export async function bancoIsolado(
  urlBase: string,
  ate?: string,
  prefixo = "iso",
  opcoes: OpcoesDoBanco = {},
): Promise<BancoIsolado> {
  return criar(urlBase, prefixo, opcoes, async (cliente) => {
    const parcial = ate ? migrationsAte(ate) : null;
    try {
      const m = await runMigrations(cliente, parcial ?? diretorioDeMigrations());
      if (m.mismatch) throw new Error(`migration divergente no banco isolado: ${m.mismatch.version}`);
    } finally {
      if (parcial) rmSync(parcial, { recursive: true, force: true });
    }
  });
}

/**
 * Banco VAZIO de verdade: nem schema, nem a tabela de controle que o runner
 * cria antes de tudo. É o alvo de um `pg_restore` — restaurar por cima de
 * qualquer coisa esconderia justamente o que o dump não traz de volta — e o
 * ponto de partida de quem aplica migrations por conta própria.
 */
export async function bancoVazio(urlBase: string, prefixo = "iso", opcoes: OpcoesDoBanco = {}): Promise<BancoIsolado> {
  return criar(urlBase, prefixo, opcoes, async () => undefined);
}
