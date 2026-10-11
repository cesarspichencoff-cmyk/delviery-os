/**
 * Q-026 — UMA leitura, num processo próprio, para separar o custo do LOTE do
 * custo do EMBRULHO cancelável que a rota HTTP da candidata #77 usa.
 * Somente teste, banco descartável já semeado.
 *
 * A rota real chama `leitorRrCancelavel(cliente, proteção)`: cada comando depois
 * do primeiro ganha um `SET LOCAL statement_timeout` antes dele, e o primeiro
 * ganha um `SELECT pg_backend_pid()` depois. O PR #85 mediu os lotes SEM esse
 * embrulho. Aqui as duas formas rodam lado a lado, com o mesmo prazo folgado
 * (o prazo nunca dispara), para medir só o que o embrulho custa ao instante.
 *
 * Mede: duração do corpo da transação (o instante MVCC), número de comandos,
 * tempo somado esperando o banco, leitura total, maior bloqueio do laço
 * (batimento calibrado com 250 ms) e pico de RSS. Saída: `Q026_LOTE {json}`.
 */

import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

import { lerRealidadeDeEntregas, type RealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import { lerRealidadeDeEntregasIncremental, type RealidadeParaApresentacao } from "../../src/platform/leitura/realidade-de-entregas-incremental";
import { leitorRrCancelavel } from "../../src/platform/leitura/leitor-rr-cancelavel";
import { createPgClient, type SqlClient, type SqlRow, type TransactionalSqlClient } from "../../src/platform/persistence/sql-client";
import { forma, vms } from "./q026-leitor-incremental-comparacao";

const URL = (process.env.Q026_LOTE_URL ?? "").trim();
const MODO = process.env.Q026_LOTE_MODO ?? "";
const LOTE = process.env.Q026_LOTE_LOTE ? Number(process.env.Q026_LOTE_LOTE) : undefined;
const EMBRULHO = process.env.Q026_LOTE_EMBRULHO === "sim";
const AGORA = new Date(process.env.Q026_LOTE_AGORA ?? "2026-10-10T12:00:00Z");
if (!URL || !["canonico", "incremental"].includes(MODO)) {
  console.error("Q026_LOTE_ARGUMENTOS_INVALIDOS");
  process.exit(2);
}

const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Classe do comando, para separar o tempo de SQL por natureza. */
function classe(sql: string): string {
  const s = sql.replace(/\s+/g, " ").trim();
  if (/^FETCH /i.test(s)) return "fetch";
  if (/^SET LOCAL statement_timeout/i.test(s)) return "set_local";
  if (/^SET TRANSACTION/i.test(s)) return "set_transaction";
  if (/^DECLARE /i.test(s)) return "declare";
  if (/^CLOSE /i.test(s)) return "close";
  if (/pg_backend_pid/i.test(s)) return "pg_backend_pid";
  if (/DISTINCT ON \(device_id\)/i.test(s)) return "ultimo_lote_distinct_on";
  if (/count\(\*\)/i.test(s)) return "contagem_por_aparelho";
  if (/FROM identity\.device/i.test(s)) return "cadastro_aparelhos";
  if (/FROM platform\.event_log/i.test(s)) return "select_fatos";
  return "outro";
}

type Medidas = { comandos: number; espera_ms: number; corpo_ms: number; por_classe: Record<string, { n: number; ms: number }> };

/** Conta comandos e soma o tempo esperando cada um, por classe; mede o corpo da transação. */
function medido(base: TransactionalSqlClient, m: Medidas): TransactionalSqlClient {
  return {
    query: (s, p) => base.query(s, p),
    close: () => base.close(),
    transaction: <T,>(fn: (tx: SqlClient) => Promise<T>) =>
      base.transaction(async (tx) => {
        const contado: SqlClient = {
          query: async <R extends SqlRow = SqlRow>(s: string, p?: readonly unknown[]) => {
            m.comandos += 1;
            const t = performance.now();
            try {
              return await tx.query<R>(s, p);
            } finally {
              const d = performance.now() - t;
              m.espera_ms += d;
              const k = classe(s);
              const c = (m.por_classe[k] = m.por_classe[k] ?? { n: 0, ms: 0 });
              c.n += 1;
              c.ms += d;
            }
          },
        };
        const t0 = performance.now();
        try {
          return await fn(contado);
        } finally {
          m.corpo_ms = performance.now() - t0;
        }
      }),
  };
}

void (async () => {
  // Batimento do laço, aquecido e calibrado (ver q026-mvcc-servidor-filho.ts).
  let ultimo = performance.now();
  let gaps: number[] = [];
  const bat = setInterval(() => {
    const agora = performance.now();
    gaps.push(agora - ultimo);
    ultimo = agora;
  }, 10);
  await pausa(60);
  const fimBloqueio = performance.now() + 250;
  while (performance.now() < fimBloqueio) {
    // controle positivo do medidor
  }
  await pausa(40);
  const calibracao = Math.max(...gaps);
  if (calibracao < 200) {
    console.error(`Q026_LOTE_MEDIDOR_CEGO: 250 ms vistos como ${calibracao.toFixed(1)} ms`);
    process.exit(3);
  }
  gaps = [];

  const base = await createPgClient({ url: URL, max: 1, statementTimeoutMs: 120_000 });
  const cancelador = await createPgClient({ url: URL, max: 1 });
  try {
    await base.query("SELECT 1");
    global.gc?.();
    const m: Medidas = { comandos: 0, espera_ms: 0, corpo_ms: 0, por_classe: {} };
    const medidoBase = medido(base, m);
    const cliente = EMBRULHO
      ? leitorRrCancelavel(medidoBase, { signal: new AbortController().signal, prazoAbsolutoMs: Date.now() + 600_000, cancelador })
      : medidoBase;
    gaps = [];
    const t0 = performance.now();
    const r: RealidadeDeEntregas | RealidadeParaApresentacao =
      MODO === "canonico"
        ? await lerRealidadeDeEntregas(cliente, { agora: AGORA })
        : await lerRealidadeDeEntregasIncremental(cliente, { agora: AGORA, lote: LOTE });
    const total = performance.now() - t0;
    const pico = process.resourceUsage().maxRSS / 1024;
    await pausa(50); // o último trecho síncrono só entra no próximo batimento
    const lacoMax = Math.max(0, ...gaps);
    clearInterval(bat);
    const h = createHash("sha256").update(JSON.stringify(forma(r)));
    for (const vm of vms(r, AGORA, [null, "ITAIM"])) h.update(vm);
    console.log(
      `Q026_LOTE ${JSON.stringify({
        modo: MODO,
        lote: MODO === "incremental" ? (LOTE ?? "padrao") : null,
        embrulho: EMBRULHO,
        corpo_ms: +m.corpo_ms.toFixed(1),
        espera_banco_ms: +m.espera_ms.toFixed(1),
        comandos: m.comandos,
        por_classe: Object.fromEntries(Object.entries(m.por_classe).map(([k, v]) => [k, { n: v.n, ms: +v.ms.toFixed(1) }])),
        total_ms: +total.toFixed(1),
        laco_max_ms: +lacoMax.toFixed(1),
        pico_rss_mib: +pico.toFixed(1),
        calibracao_ms: +calibracao.toFixed(1),
        digest: h.digest("hex"),
      })}`,
    );
  } finally {
    await base.close();
    await cancelador.close();
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
