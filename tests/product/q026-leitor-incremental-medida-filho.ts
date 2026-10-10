/**
 * Q-026 — UMA medida, num processo Node próprio, sobre um banco JÁ semeado.
 * Somente teste. Chamado por `run-q026-leitor-incremental-medicao.ts`.
 *
 * O processo não semeia nada: importa, conecta e lê. Assim o pico de RSS do
 * processo (`maxRSS`) não carrega a fase de fixture — que, no PR #52, fazia o
 * pico do leitor incremental parecer MENOR com mais dados.
 *
 * Modos: `controle` (conecta e não lê: o piso do processo), `canonico`
 * (`lerRealidadeDeEntregas`), `incremental` (`lerRealidadeDeEntregasIncremental`)
 * e `calibracao`: uma consulta seguida de um bloqueio síncrono CONHECIDO, o
 * controle positivo do medidor do laço.
 * Saída: uma linha `Q026_MEDIDA {json}`.
 */

import { createHash } from "node:crypto";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";

import { lerRealidadeDeEntregas, type RealidadeDeEntregas } from "../../src/platform/leitura/realidade-de-entregas";
import { lerRealidadeDeEntregasIncremental } from "../../src/platform/leitura/realidade-de-entregas-incremental";
import { createPgClient, type SqlClient, type TransactionalSqlClient } from "../../src/platform/persistence/sql-client";
import { forma, vms } from "./q026-leitor-incremental-comparacao";
import { AGORA_DA_LOJA } from "./q026-leitor-incremental-fixture";

const URL = (process.env.Q026_MEDIDA_URL ?? "").trim();
const MODO = process.env.Q026_MEDIDA_MODO ?? "";
const LOTE = process.env.Q026_MEDIDA_LOTE ? Number(process.env.Q026_MEDIDA_LOTE) : undefined;
if (!URL || !["controle", "canonico", "incremental", "calibracao"].includes(MODO)) {
  console.error("Q026_MEDIDA_ARGUMENTOS_INVALIDOS");
  process.exit(2);
}
if (typeof global.gc !== "function") {
  console.error("Q026_MEDIDA_SEM_EXPOSE_GC: rode com NODE_OPTIONS=--expose-gc");
  process.exit(2);
}

const mib = (b: number) => +(b / 1048576).toFixed(2);
const RESOLUCAO_DO_LACO_MS = 10;
/** O bloqueio que a calibração impõe depois de uma consulta; o medidor tem de enxergá-lo. */
const BLOQUEIO_DE_CALIBRACAO_MS = 250;

/** Uma consulta e depois um trecho síncrono, como a montagem depois do COMMIT. */
async function calibrar(cliente: SqlClient): Promise<null> {
  await cliente.query("SELECT 1");
  const fim = performance.now() + BLOQUEIO_DE_CALIBRACAO_MS;
  while (performance.now() < fim) {
    // ocupa o laço de propósito
  }
  return null;
}

const esperar = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

async function gcLimpo(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    global.gc?.();
    await new Promise<void>((r) => setImmediate(r));
  }
}

/** Mede quanto tempo o instante MVCC fica aberto: do início ao fim do corpo da transação. */
function cronometrado(base: TransactionalSqlClient, aoFechar: (ms: number) => void): TransactionalSqlClient {
  return {
    query: (s, p) => base.query(s, p),
    close: () => base.close(),
    transaction: <T,>(fn: (tx: SqlClient) => Promise<T>) =>
      base.transaction(async (tx) => {
        const t = performance.now();
        try {
          return await fn(tx);
        } finally {
          aoFechar(performance.now() - t);
        }
      }),
  };
}

void (async () => {
  const cliente = await createPgClient({ url: URL, max: 1, statementTimeoutMs: 300_000 });
  try {
    await cliente.query("SELECT 1");
    await gcLimpo();
    const rss_inicio = process.memoryUsage().rss;
    const heap_inicio = process.memoryUsage().heapUsed;
    const maxrss_inicio_kib = process.resourceUsage().maxRSS;
    const laco = monitorEventLoopDelay({ resolution: RESOLUCAO_DO_LACO_MS });
    laco.enable();
    // O medidor só registra a partir do SEGUNDO disparo do temporizador dele: um
    // bloqueio antes do primeiro disparo não entraria. Aquece antes de ler.
    await esperar(3 * RESOLUCAO_DO_LACO_MS);

    let instantaneo_ms: number | null = null;
    let leitura_ms: number | null = null;
    let digest: string | null = null;
    let viagens: number | null = null;
    let heap_retido: number | null = null;
    let pico_da_leitura_kib: number | null = null;
    if (MODO !== "controle") {
      const c = cronometrado(cliente, (ms) => (instantaneo_ms = ms));
      const t0 = performance.now();
      const r: RealidadeDeEntregas | null =
        MODO === "calibracao"
          ? await calibrar(cliente)
          : MODO === "canonico"
            ? await lerRealidadeDeEntregas(c, { agora: AGORA_DA_LOJA })
            : await lerRealidadeDeEntregasIncremental(c, { agora: AGORA_DA_LOJA, lote: LOTE });
      leitura_ms = performance.now() - t0;
      // O pico da LEITURA: antes do digest, que monta JSON grande da view model.
      pico_da_leitura_kib = process.resourceUsage().maxRSS;
      // O último trecho síncrono da leitura (a montagem depois do COMMIT) só entra
      // no histograma quando o temporizador do medidor dispara de novo. Desligar
      // sem devolver o controle ao laço apagava esse trecho: o maior bloqueio da
      // porta canônica e o da montagem de muitas viagens no incremental.
      await esperar(5 * RESOLUCAO_DO_LACO_MS);
      laco.disable();
      if (r !== null) {
        viagens = r.projecoes.reduce((n, p) => n + p.viagens.length, 0);
        // O resultado ainda vivo: quanto da memória ele segura depois do GC.
        await gcLimpo();
        heap_retido = process.memoryUsage().heapUsed - heap_inicio;
        // Por partes: com centenas de milhares de viagens, um JSON único passa do
        // limite de string do V8.
        const h = createHash("sha256").update(JSON.stringify(forma(r)));
        for (const vm of vms(r, AGORA_DA_LOJA, [null, "ITAIM", "LAB-BANCADA", "CURTAS", "SEM-UNIDADE"])) h.update(vm);
        digest = h.digest("hex");
      }
    } else {
      laco.disable();
    }
    const saida = {
      modo: MODO,
      lote: MODO === "incremental" ? (LOTE ?? "padrao") : null,
      leitura_ms: leitura_ms === null ? null : +leitura_ms.toFixed(1),
      instantaneo_ms: instantaneo_ms === null ? null : +(instantaneo_ms as number).toFixed(1),
      pico_rss_mib: mib((pico_da_leitura_kib ?? process.resourceUsage().maxRSS) * 1024),
      pico_com_digest_mib: mib(process.resourceUsage().maxRSS * 1024),
      rss_inicio_mib: mib(rss_inicio),
      pico_antes_da_leitura_mib: mib(maxrss_inicio_kib * 1024),
      heap_retido_mib: heap_retido === null ? null : mib(heap_retido),
      atraso_max_do_laco_ms: +(laco.max / 1e6).toFixed(1),
      atraso_p99_do_laco_ms: +(laco.percentile(99) / 1e6).toFixed(1),
      viagens,
      digest,
    };
    console.log(`Q026_MEDIDA ${JSON.stringify(saida)}`);
  } finally {
    await cliente.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
