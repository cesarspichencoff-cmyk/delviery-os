/**
 * Q-026 — o leitor INCREMENTAL em PostgreSQL de verdade (descartável, migrations reais).
 *
 * Somente testes. A porta canônica (`lerRealidadeDeEntregas`) é a referência e
 * não muda; a replay da Q-016 não muda.
 *
 * G1  paridade na loja rica: leitura inteira + VM em quatro filtros + filtro de unidade;
 * G2  escritor concorrente confirmando entre lotes e entre as consultas de aparelho:
 *     a leitura fica no instante em que começou; a seguinte vê as quatro escritas;
 * G3  erro do PostgreSQL no meio do cursor: rejeita, ROLLBACK, conexão limpa;
 * G4  erro do JavaScript no meio do cursor: idem, e as medidas não são entregues;
 * G5  statement_timeout dentro da transação: idem;
 * G6  READ ONLY de verdade: escrita dentro da transação é recusada (25006);
 * G7  falha DEPOIS do COMMIT (instante infinito no último lote): as duas portas falham igual;
 * G8  lotes limitados: nenhum FETCH passa do lote; contagem exata de FETCH;
 * G9  instante preso durante a leitura e solto depois (backend_xmin);
 * G10 medidas batem com a Q-016: UNKNOWN, quarentena e linhas lidas.
 *
 * Uso: DELIVERYOS_PG_URL=postgres://<admin>@<host>/postgres \
 *        Q026_INC_LONGA=120000 npx tsx tests/product/run-q026-leitor-incremental-pg.ts
 * Sem DELIVERYOS_PG_URL: sai 78, PULADO em voz alta — nunca verde.
 */

import assert from "node:assert/strict";

import { lerRealidadeDeEntregas, type RealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import {
  LOTE_PADRAO,
  lerRealidadeDeEntregasIncremental,
  type MedidasDaLeituraIncremental,
  type OpcoesDaLeituraIncremental,
} from "../../src/platform/leitura/realidade-de-entregas-incremental";
import { createPgClient, type SqlClient, type SqlRow, type TransactionalSqlClient } from "../../src/platform/persistence/sql-client";
import { lerFatosParaReplay } from "../../src/platform/projections/replay-do-event-log";
import { TIPOS_DA_OPERACAO_VIVA } from "../../src/platform/runtime/handler-operacao-viva";
import { forma, iguais } from "./q026-leitor-incremental-comparacao";
import { AGORA_DA_LOJA, semearLoja, type Loja } from "./q026-leitor-incremental-fixture";

const URL_BASE = (process.env.DELIVERYOS_PG_URL ?? "").trim();
if (!URL_BASE) {
  console.error("PULADO: DELIVERYOS_PG_URL ausente. Nenhuma prova do leitor incremental rodou — isto nao e verde.");
  process.exit(78);
}
const LONGA = Number(process.env.Q026_INC_LONGA ?? 120000);
const CURTAS = Number(process.env.Q026_INC_CURTAS ?? 2000);
assert.ok(Number.isInteger(LONGA) && LONGA >= 0 && Number.isInteger(CURTAS) && CURTAS >= 0, "tamanhos inválidos");
const AGORA = AGORA_DA_LOJA;
const UNIDADES = [null, "ITAIM", "LAB-BANCADA", "CURTAS", "SEM-UNIDADE"] as const;

let passaram = 0;
const falhas: string[] = [];
async function teste(nome: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passaram += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message.split("\n").slice(0, 6).join(" | ") : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

/* ------------------------------------------------------------------ *
 * O cliente do leitor, com ganchos — muda QUANDO algo acontece, não o que ele envia
 * ------------------------------------------------------------------ */

interface Ganchos {
  /** Antes da q-ésima consulta da transação do leitor; recebe a própria transação. */
  antes?: (sql: string, q: number, tx: SqlClient) => Promise<void>;
  /** Troca o SQL da q-ésima consulta (injeção de falha REAL do servidor). */
  trocar?: (sql: string, q: number) => string;
  /** Depois da q-ésima consulta, com as linhas devolvidas. */
  depois?: (sql: string, q: number, linhas: readonly SqlRow[]) => Promise<void>;
}

function comGanchos(base: TransactionalSqlClient, g: Ganchos): TransactionalSqlClient {
  return {
    query: (s, p) => base.query(s, p),
    close: () => base.close(),
    transaction: <T,>(fn: (tx: SqlClient) => Promise<T>) =>
      base.transaction(async (tx) => {
        let q = 0;
        const interceptado: SqlClient = {
          query: async <R extends SqlRow = SqlRow>(s: string, p?: readonly unknown[]): Promise<R[]> => {
            q += 1;
            await g.antes?.(s, q, tx);
            const linhas = await tx.query<R>(g.trocar ? g.trocar(s, q) : s, p);
            await g.depois?.(s, q, linhas);
            return linhas;
          },
        };
        return fn(interceptado);
      }),
  };
}

const ehFetch = (s: string) => /^FETCH FORWARD /.test(s.trim());

async function incremental(c: TransactionalSqlClient, o: Partial<OpcoesDaLeituraIncremental> = {}) {
  let medidas: MedidasDaLeituraIncremental | null = null;
  const r = await lerRealidadeDeEntregasIncremental(c, { agora: AGORA, ...o, medir: (m) => (medidas = m) });
  assert.ok(medidas, "medidas não entregues");
  return { r, m: medidas as MedidasDaLeituraIncremental };
}

/** A conexão (pool de UMA) depois de uma falha: fora de transação, sem cursor, sem instante preso. */
async function conexaoLimpa(c: TransactionalSqlClient, observador: SqlClient): Promise<void> {
  const [l] = await c.query<{ iso: string; cursores: number; pid: number }>(
    `SELECT current_setting('transaction_isolation') AS iso, (SELECT count(*)::int FROM pg_cursors) AS cursores, pg_backend_pid() AS pid`,
  );
  assert.ok(l);
  assert.equal(l.iso, "read committed", "a conexão continuou na transação REPEATABLE READ");
  assert.equal(l.cursores, 0, "cursor vazou da transação");
  const [a] = await observador.query<{ state: string; xmin: string | null }>(
    `SELECT state, backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid = $1`,
    [l.pid],
  );
  assert.ok(a);
  assert.equal(a.state, "idle", `estado da sessão: ${a.state}`);
  assert.equal(a.xmin, null, "o horizonte do VACUUM ficou preso depois da falha");
}

async function gravarGps(w: SqlClient, i: number, occurred: string): Promise<void> {
  await w.query(
    `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type, payload,
       occurred_at, recorded_at, origin, idempotency_key, contract_version, source_mode, sequence_local, device_id, clock_trust)
     VALUES ($1,'ITAIM','trip','Q026-ONE-LONG','gps_batch_received','{}'::jsonb,$2,$2,'device',$1,
             'gps_batch_received@1.0.0','simulated',$3,'DEV-01','trusted')`,
    [`concorrente-${i}`, occurred, 900000 + i],
  );
}

/* ------------------------------------------------------------------ *
 * Casos
 * ------------------------------------------------------------------ */

void (async () => {
  console.log(`\nQ-026 — LEITOR INCREMENTAL EM POSTGRESQL (descartável, migrations reais) · viagem longa ${LONGA} · curtas ${CURTAS}`);
  const t0 = Date.now();
  const loja: Loja = await semearLoja(URL_BASE, { longa: LONGA, viagens_curtas: CURTAS });
  const observador = await createPgClient({ url: loja.banco.url, max: 1 });
  console.log(`  loja semeada em ${((Date.now() - t0) / 1000).toFixed(1)} s · ${loja.linhas} linhas dos tipos`);
  let canonica: RealidadeDeEntregas | null = null;
  try {
    await teste("G1 paridade na loja rica: leitura inteira e VM em cinco filtros; filtro de unidade; conteúdo não vazio", async () => {
      canonica = await lerRealidadeDeEntregas(loja.banco.cliente, { agora: AGORA });
      const { r, m } = await incremental(loja.banco.cliente);
      iguais(canonica, r, "loja", AGORA, UNIDADES);
      const viagens = canonica.projecoes.flatMap((p) => p.viagens);
      // Loja determinística: 71 viagens do log misto (+1 se houver a longa) e as curtas.
      assert.equal(viagens.length, CURTAS + 71 + (LONGA > 0 ? 1 : 0), "número de viagens da loja mudou");
      assert.equal(canonica.aparelhos.length, loja.aparelhos, "os do log misto + o silencioso + o revogado");
      assert.ok(canonica.aparelhos.some((a) => a.revogado_em !== null) && canonica.aparelhos.some((a) => a.ultimo_lote === null));
      assert.ok(canonica.aparelhos.some((a) => a.fila_offline !== null));
      assert.equal(canonica.historico_sem_modo, 1);
      assert.ok(canonica.projecoes.some((p) => p.viagens.length === 0), "escopo só com fato sem viagem");
      assert.deepEqual([...new Set(canonica.projecoes.map((p) => p.source_mode))].sort(), ["control", "real", "simulated"]);
      if (LONGA > 0) assert.equal(viagens.find((v) => v.trip_id === "Q026-ONE-LONG")?.eventos.length, LONGA);
      for (const unidade of ["ITAIM", "LAB-BANCADA", "CURTAS", "NAO-EXISTE"]) {
        const c = await lerRealidadeDeEntregas(loja.banco.cliente, { agora: AGORA, unit_id: unidade });
        const i = await incremental(loja.banco.cliente, { unit_id: unidade });
        iguais(c, i.r, `unidade ${unidade}`, AGORA, UNIDADES);
      }
      console.log(`      ${viagens.length} viagens · ${canonica.projecoes.length} escopos · ${canonica.aparelhos.length} aparelhos · ${m.linhas} linhas em ${m.lotes} lotes de ${m.lote} · instante ${m.instantaneo_ms.toFixed(0)} ms`);
    });

    await teste("G10 medidas batem com a Q-016: linhas, UNKNOWN e quarentena (que a porta não expõe)", async () => {
      const q016 = await lerFatosParaReplay(loja.banco.cliente, TIPOS_DA_OPERACAO_VIVA);
      const { m } = await incremental(loja.banco.cliente);
      assert.equal(m.linhas, q016.lidas);
      assert.equal(m.linhas, loja.linhas);
      assert.equal(m.sem_modo, q016.sem_modo);
      assert.equal(m.corrompidas, q016.corrompidas.length);
      assert.deepEqual(q016.corrompidas.map((c) => c.event_id).sort(), ["bad-sequence-ui", "instante-infinito"]);
      assert.equal(m.aptos, q016.aptos.length);
    });

    await teste("G8 lotes limitados: nenhum FETCH passa do lote e a contagem de FETCH é exata (lotes 1, 257, 1024, 5000)", async () => {
      for (const lote of [257, 1024, 5000]) {
        const tamanhos: number[] = [];
        const c = comGanchos(loja.banco.cliente, { depois: async (s, _q, linhas) => void (ehFetch(s) && tamanhos.push(linhas.length)) });
        const { m } = await incremental(c, { lote });
        assert.ok(tamanhos.every((n) => n <= lote), `FETCH acima do lote ${lote}`);
        assert.equal(tamanhos.length, Math.ceil(loja.linhas / lote) + 1, "o último FETCH volta vazio");
        assert.equal(tamanhos.at(-1), 0);
        assert.equal(m.maior_lote, Math.min(lote, loja.linhas));
      }
      // Lote 1 numa loja pequena: paridade com uma linha por FETCH.
      const pequena = await semearLoja(URL_BASE, { longa: 0, viagens_curtas: 0, prefixo: "q026incp" });
      try {
        const c = await lerRealidadeDeEntregas(pequena.banco.cliente, { agora: AGORA });
        const { r, m } = await incremental(pequena.banco.cliente, { lote: 1 });
        iguais(c, r, "lote 1", AGORA, UNIDADES);
        assert.equal(m.lotes, pequena.linhas);
      } finally {
        await pequena.banco.descartar();
      }
    });

    await teste("G9 o instante fica preso durante a leitura (backend_xmin) e é solto depois", async () => {
      let pid = 0;
      let durante: string | null = null;
      const c = comGanchos(loja.banco.cliente, {
        antes: async (s, q, tx) => {
          if (q === 3 && ehFetch(s)) {
            const [l] = await tx.query<{ pid: number }>(`SELECT pg_backend_pid() AS pid`);
            pid = l!.pid;
            const [a] = await observador.query<{ xmin: string | null }>(`SELECT backend_xmin::text AS xmin FROM pg_stat_activity WHERE pid = $1`, [pid]);
            durante = a?.xmin ?? null;
          }
        },
      });
      await incremental(c);
      assert.ok(pid > 0 && durante !== null, "o instante não estava preso no meio do cursor");
      const [a] = await observador.query<{ xmin: string | null; state: string }>(
        `SELECT backend_xmin::text AS xmin, state FROM pg_stat_activity WHERE pid = $1`,
        [pid],
      );
      assert.ok(a);
      assert.equal(a.xmin, null, "o horizonte ficou preso depois do COMMIT");
      assert.equal(a.state, "idle");
    });
  } finally {
    await observador.close();
    await loja.banco.descartar();
  }

  await teste("G2 escritor concorrente entre lotes e entre as consultas de aparelho: a leitura fica no seu instante; a seguinte vê as quatro escritas", async () => {
    const l = await semearLoja(URL_BASE, { longa: 20000, viagens_curtas: 0, prefixo: "q026incc" });
    const w = await createPgClient({ url: l.banco.url, max: 1 });
    try {
      const antes = await lerRealidadeDeEntregas(l.banco.cliente, { agora: AGORA });
      let escritas = 0;
      let fetches = 0;
      const escrever = async () => {
        escritas += 1;
        await gravarGps(w, escritas, `2026-10-10T12:00:0${escritas}.000Z`);
      };
      const c = comGanchos(l.banco.cliente, {
        antes: async (s) => {
          if (ehFetch(s)) {
            fetches += 1;
            if (fetches === 2 || fetches === 5) await escrever();
          }
          if (/DISTINCT ON \(device_id\)/.test(s)) await escrever();
          if (/count\(\*\)::int AS n/.test(s)) await escrever();
        },
      });
      const { r } = await incremental(c, { lote: 1024 });
      assert.equal(escritas, 4, "as quatro escritas não aconteceram");
      iguais(antes, r, "incremental durante as escritas x canônica antes", AGORA, UNIDADES);
      const depoisC = await lerRealidadeDeEntregas(l.banco.cliente, { agora: AGORA });
      const depoisI = await incremental(l.banco.cliente, { lote: 1024 });
      iguais(depoisC, depoisI.r, "as duas depois", AGORA, UNIDADES);
      const dev = (x: RealidadeDeEntregas) => x.aparelhos.find((a) => a.device_id === "DEV-01")!;
      const longa = (x: RealidadeDeEntregas) => x.projecoes.flatMap((p) => p.viagens).find((v) => v.trip_id === "Q026-ONE-LONG")!;
      assert.equal(dev(depoisC).fatos_por_modo.simulated, dev(antes).fatos_por_modo.simulated + 4);
      assert.equal(longa(depoisI.r).eventos.length, longa(antes).eventos.length + 4);
      assert.notDeepEqual(dev(depoisC).ultimo_lote, dev(antes).ultimo_lote);
      assert.notDeepEqual(forma(depoisI.r), forma(r), "a leitura seguinte não mudou");
    } finally {
      await w.close();
      await l.banco.descartar();
    }
  });

  const pequenaParaFalhas = await semearLoja(URL_BASE, { longa: 5000, viagens_curtas: 0, prefixo: "q026incf" });
  const observadorF = await createPgClient({ url: pequenaParaFalhas.banco.url, max: 1 });
  try {
    await teste("G3 erro do PostgreSQL no meio do cursor (FETCH de cursor inexistente): rejeita, ROLLBACK, conexão limpa", async () => {
      const leitor = await createPgClient({ url: pequenaParaFalhas.banco.url, max: 1 });
      try {
        let fetches = 0;
        const c = comGanchos(leitor, {
          trocar: (s) => (ehFetch(s) && ++fetches === 3 ? "FETCH FORWARD 10 FROM cursor_que_nao_existe" : s),
        });
        await assert.rejects(() => incremental(c), (e: unknown) => (e as { code?: string }).code === "34000");
        await conexaoLimpa(leitor, observadorF);
      } finally {
        await leitor.close();
      }
    });

    await teste("G4 erro do JavaScript no meio do cursor: rejeita, ROLLBACK, conexão limpa, medidas não entregues", async () => {
      const leitor = await createPgClient({ url: pequenaParaFalhas.banco.url, max: 1 });
      try {
        let fetches = 0;
        let medidas = false;
        const c = comGanchos(leitor, {
          depois: async (s) => {
            if (ehFetch(s) && ++fetches === 2) throw new Error("falha simulada no consumidor");
          },
        });
        await assert.rejects(
          () => lerRealidadeDeEntregasIncremental(c, { agora: AGORA, medir: () => (medidas = true) }),
          /falha simulada no consumidor/,
        );
        assert.equal(medidas, false, "medidas entregues de uma leitura que falhou");
        await conexaoLimpa(leitor, observadorF);
      } finally {
        await leitor.close();
      }
    });

    await teste("G5 statement_timeout dentro da transação (57014): rejeita, ROLLBACK, conexão limpa", async () => {
      const leitor = await createPgClient({ url: pequenaParaFalhas.banco.url, max: 1, statementTimeoutMs: 300 });
      try {
        let fetches = 0;
        const c = comGanchos(leitor, {
          antes: async (s, _q, tx) => {
            if (ehFetch(s) && ++fetches === 2) await tx.query("SELECT pg_sleep(2)");
          },
        });
        await assert.rejects(() => incremental(c), (e: unknown) => (e as { code?: string }).code === "57014");
        await conexaoLimpa(leitor, observadorF);
      } finally {
        await leitor.close();
      }
    });

    await teste("G6 READ ONLY imposto pelo servidor: escrita dentro da transação é recusada (25006) e nada é gravado", async () => {
      const leitor = await createPgClient({ url: pequenaParaFalhas.banco.url, max: 1 });
      try {
        const [{ n: antes }] = await leitor.query<{ n: number }>(`SELECT count(*)::int AS n FROM platform.event_log`);
        let fetches = 0;
        const c = comGanchos(leitor, {
          antes: async (s, _q, tx) => {
            if (ehFetch(s) && ++fetches === 2) await gravarGps(tx, 1, "2026-10-10T12:00:00.000Z");
          },
        });
        await assert.rejects(() => incremental(c), (e: unknown) => (e as { code?: string }).code === "25006");
        const [{ n: depois }] = await leitor.query<{ n: number }>(`SELECT count(*)::int AS n FROM platform.event_log`);
        assert.equal(depois, antes);
        await conexaoLimpa(leitor, observadorF);
      } finally {
        await leitor.close();
      }
    });
  } finally {
    await observadorF.close();
    await pequenaParaFalhas.banco.descartar();
  }

  await teste("G7 falha DEPOIS do COMMIT (instante infinito no último lote de um aparelho): as duas portas falham igual", async () => {
    const l = await semearLoja(URL_BASE, { longa: 0, viagens_curtas: 0, prefixo: "q026inci" });
    try {
      await l.banco.cliente.query(
        `INSERT INTO platform.event_log (event_id, unit_id, object_type, object_id, event_type, payload,
           occurred_at, recorded_at, origin, idempotency_key, contract_version, source_mode, sequence_local, device_id, clock_trust)
         VALUES ('gps-infinito','ITAIM','trip','T-INF2','gps_batch_received','{}','infinity','2026-10-10T23:00:00Z',
                 'device','gps-infinito','gps_batch_received@1.0.0','simulated',1,'DEV-02','trusted')`,
      );
      const erroDe = async (f: () => Promise<unknown>) => {
        try {
          await f();
          return "devolveu leitura";
        } catch (e) {
          return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        }
      };
      const ec = await erroDe(() => lerRealidadeDeEntregas(l.banco.cliente, { agora: AGORA }));
      const ei = await erroDe(() => lerRealidadeDeEntregasIncremental(l.banco.cliente, { agora: AGORA }));
      assert.match(ec, /RangeError: Invalid time value/);
      assert.equal(ei, ec);
      console.log(`      as duas: "${ec}" (achado: a porta canônica cai inteira por um último lote ilegível)`);
    } finally {
      await l.banco.descartar();
    }
  });

  const total = passaram + falhas.length;
  if (falhas.length) {
    console.error(`\nQ026_LEITOR_INCREMENTAL_PG: ${passaram}/${total} PASS`);
    for (const f of falhas) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`\nQ026_LEITOR_INCREMENTAL_PG: ${passaram}/${total} PASS (lote padrão ${LOTE_PADRAO})`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
