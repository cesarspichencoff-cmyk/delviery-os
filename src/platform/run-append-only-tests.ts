/**
 * APPEND-ONLY DO EVENT LOG — contra UPDATE, DELETE e TRUNCATE.
 * ============================================================================
 * `platform.event_log` promete ser append-only (L3), e a Q-016 fez dele a
 * fonte que governa a reconstrução da Operação Viva. A promessa vivia numa
 * trigger da 0001:
 *
 *   BEFORE UPDATE OR DELETE ON platform.event_log FOR EACH ROW
 *
 * `TRUNCATE` não dispara trigger de linha. A proteção cobria editar e apagar
 * linha a linha — e deixava apagar TUDO de uma vez, sem erro.
 *
 * FASE 1 — O BURACO, REPRODUZIDO ANTES DE FECHAR
 * ----------------------------------------------
 * Num banco ISOLADO com as migrations oficiais até a 0003 — o schema que
 * existia até esta missão —, pelo runner real:
 *
 *   A0  o canal executa SQL, e o banco está exatamente na 0003;
 *   A1  havia linhas: três fatos válidos entram;
 *   A2  UPDATE é recusado pela trava, e a linha não muda;
 *   A3  DELETE é recusado pela trava, e as três continuam lá;
 *   A4  O BURACO: TRUNCATE passa sem erro, e a tabela fica vazia.
 *
 * A1 e A0 são o que dá sentido a A4: sem linhas antes, "ficou vazia" não
 * prova nada; sem canal que executa, "não deu erro" também não.
 *
 * Esta seção fica aqui depois da correção, de propósito: é o controle
 * positivo de tudo que vier depois. A mesma operação, pelo mesmo cliente,
 * contra o schema que não tem a correção — se a recusa posterior não vier da
 * correção, este bloco é que muda.
 *
 * Nunca toca o banco compartilhado: exige `DELIVERYOS_PG_URL` só para chegar
 * ao SERVIDOR, e cria (e apaga) bancos próprios (`banco-isolado.ts`). Sem a
 * variável, PULA EM VOZ ALTA (CLAUDE.md §10).
 */

import assert from "node:assert/strict";

import { bancoIsolado, type BancoIsolado } from "./banco-isolado";

const URL_SERVIDOR = (process.env.DELIVERYOS_PG_URL ?? "").trim();
/** O schema que existia antes desta missão. */
const ATE_0003 = "0003_event_log_source_mode";

console.log("\n=== APPEND-ONLY DO EVENT LOG ===\n");

if (!URL_SERVIDOR) {
  console.log("PULADO: DELIVERYOS_PG_URL não definida — nenhum banco foi exercitado.");
  process.exit(0);
}

let passaram = 0;
const falhas: string[] = [];

async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passaram += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

/* ------------------------------------------------------------------ *
 * Operações — executadas, nunca inferidas do catálogo
 * ------------------------------------------------------------------ */

/** Fatos válidos, com modo declarado (`simulated`: nada aqui é da rua). */
async function inserirFatos(b: BancoIsolado, prefixo: string, n: number): Promise<void> {
  for (let i = 1; i <= n; i += 1) {
    await b.cliente.query(
      `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type,
          payload, occurred_at, origin, idempotency_key, contract_version, source_mode)
       VALUES ($1, 'AO-U', 'trip', 't-ao', 'trip_created', $2::jsonb, $3, 'system', $4,
               'trip_created@1.0.0', 'simulated')`,
      [`ev-${prefixo}-${i}`, JSON.stringify({ n: i }), `2026-09-23T10:0${i}:00Z`, `k-${prefixo}-${i}`],
    );
  }
}

async function linhas(b: BancoIsolado): Promise<number> {
  const r = await b.cliente.query<{ n: string }>(`SELECT count(*) AS n FROM platform.event_log`);
  return Number(r[0].n);
}

/** Executa e devolve a mensagem do erro — ou `null` se o banco ACEITOU. */
async function tentar(b: BancoIsolado, sql: string): Promise<string | null> {
  try {
    await b.cliente.query(sql);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function versoes(b: BancoIsolado): Promise<string[]> {
  const r = await b.cliente.query<{ version: string }>(
    `SELECT version FROM platform.schema_migration WHERE version NOT LIKE 'probe:%' ORDER BY version`,
  );
  return r.map((x) => String(x.version));
}

/* ================================================================== */

void (async () => {
  console.log("1. ANTES — o schema ate a 0003, o que existia ate esta missao");
  const antes = await bancoIsolado(URL_SERVIDOR, ATE_0003, "ao");
  try {
    await teste("A0 o canal executa SQL, e o banco está exatamente na 0003", async () => {
      const r = await antes.cliente.query<{ canal: string }>(`SELECT 'canal_ok' AS canal`);
      assert.equal(r[0]?.canal, "canal_ok", "o canal não devolveu o que executou");
      assert.deepEqual(
        await versoes(antes),
        ["0001_platform_foundation", "0002_event_log_contexto_dispositivo", ATE_0003],
        "o banco de 'antes' não está na 0003 — a reprodução mediria outro schema",
      );
    });

    await teste("A1 havia linhas: três fatos válidos entram", async () => {
      await inserirFatos(antes, "antes", 3);
      assert.equal(await linhas(antes), 3);
    });

    await teste("A2 UPDATE é recusado pela trava, e a linha não muda", async () => {
      const erro = await tentar(antes, `UPDATE platform.event_log SET event_type = 'alterado'`);
      assert.match(String(erro), /append-only: UPDATE nao e permitido/, `UPDATE não foi recusado: ${String(erro)}`);
      const r = await antes.cliente.query<{ t: string }>(
        `SELECT DISTINCT event_type AS t FROM platform.event_log`,
      );
      assert.deepEqual(r.map((x) => x.t), ["trip_created"], "uma linha mudou");
    });

    await teste("A3 DELETE é recusado pela trava, e as três continuam lá", async () => {
      const erro = await tentar(antes, `DELETE FROM platform.event_log`);
      assert.match(String(erro), /append-only: DELETE nao e permitido/, `DELETE não foi recusado: ${String(erro)}`);
      assert.equal(await linhas(antes), 3);
    });

    await teste("A4 O BURACO: TRUNCATE passa sem erro, e a tabela fica vazia", async () => {
      const erro = await tentar(antes, `TRUNCATE platform.event_log`);
      assert.equal(erro, null, `TRUNCATE foi recusado no schema antigo — o buraco não é o descrito: ${String(erro)}`);
      assert.equal(await linhas(antes), 0, "TRUNCATE aceito, mas as linhas ficaram");
    });
  } finally {
    await antes.descartar();
  }

  const total = passaram + falhas.length;
  console.log(`\n${passaram}/${total} provas contra PostgreSQL real, em bancos isolados`);
  for (const f of falhas) console.log(`  XX ${f}`);
  if (falhas.length) {
    console.error("\nAPPEND_ONLY_RED");
    process.exit(1);
  }
  console.log("\nAPPEND_ONLY_GREEN");
})().catch((e: unknown) => {
  console.error("falha ao executar a suíte de append-only:", e);
  process.exit(1);
});
