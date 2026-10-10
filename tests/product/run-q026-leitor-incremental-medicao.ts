/**
 * Q-026 — memória, tempo e instante: porta CANÔNICA x leitor INCREMENTAL,
 * em processos Node independentes sobre o MESMO banco semeado. Somente teste.
 *
 * Método (e por que não é o do PR #52):
 *  - o banco é semeado UMA vez, neste processo; cada medida é um processo
 *    novo que só conecta e lê — o pico de RSS não carrega a fixture;
 *  - um processo `controle` conecta e não lê: o piso do processo;
 *  - R repetições, em ordem rotativa (controle, canônico, incremental...),
 *    e o relatório mostra mediana, mínimo e máximo — nada é descartado;
 *  - canônico e incremental têm de produzir o MESMO digest (leitura sem
 *    `versao` e com `eventos` pela contagem + view model em cinco filtros);
 *    se não, a medição reprova: memória de leitura errada não vale nada;
 *  - antes de medir, a CALIBRAÇÃO: um processo faz uma consulta e depois
 *    bloqueia o laço por 250 ms de propósito. Se o medidor do laço não
 *    enxergar esse bloqueio, a medição reprova — o medidor estaria cego
 *    justamente para o trecho síncrono depois do COMMIT.
 *
 * Uso: DELIVERYOS_PG_URL=postgres://<admin>@<host>/postgres \
 *        Q026_MEDIDA_LONGA=1030000 Q026_MEDIDA_CURTAS=0 Q026_MEDIDA_REPETICOES=3 \
 *        Q026_MEDIDA_LOTES=257,1024,4096 Q026_MEDIDA_SAIDA=medida.json \
 *        npx tsx tests/product/run-q026-leitor-incremental-medicao.ts
 * Sem DELIVERYOS_PG_URL: sai 78, PULADO em voz alta — nunca verde.
 */

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { semearLoja } from "./q026-leitor-incremental-fixture";

const URL_BASE = (process.env.DELIVERYOS_PG_URL ?? "").trim();
if (!URL_BASE) {
  console.error("PULADO: DELIVERYOS_PG_URL ausente. Nenhuma medida rodou — isto nao e verde.");
  process.exit(78);
}
const LONGA = Number(process.env.Q026_MEDIDA_LONGA ?? 120000);
const CURTAS = Number(process.env.Q026_MEDIDA_CURTAS ?? 0);
const REPETICOES = Number(process.env.Q026_MEDIDA_REPETICOES ?? 3);
const LOTES = (process.env.Q026_MEDIDA_LOTES ?? "1024").split(",").map((x) => Number(x.trim()));
const SAIDA = (process.env.Q026_MEDIDA_SAIDA ?? "").trim();
for (const n of [LONGA, CURTAS, REPETICOES, ...LOTES]) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`Q026_MEDIDA_PARAMETRO_INVALIDO: ${n}`);
}
if (REPETICOES < 1 || LOTES.length === 0 || LOTES.some((l) => l < 1)) throw new Error("Q026_MEDIDA_PARAMETRO_INVALIDO");

const FILHO = join(resolve(__dirname), "q026-leitor-incremental-medida-filho.ts");
/** O filho bloqueia 250 ms na calibração; com resolução de 10 ms, o medidor tem de ver ao menos isto. */
const BLOQUEIO_MINIMO_VISTO_NA_CALIBRACAO_MS = 200;

interface Medida {
  modo: string;
  lote: number | string | null;
  leitura_ms: number | null;
  instantaneo_ms: number | null;
  pico_rss_mib: number;
  rss_inicio_mib: number;
  pico_antes_da_leitura_mib: number;
  heap_retido_mib: number | null;
  atraso_max_do_laco_ms: number;
  atraso_p99_do_laco_ms: number;
  viagens: number | null;
  digest: string | null;
}

function medir(url: string, modo: string, lote?: number): Medida {
  const r = spawnSync("npx", ["tsx", FILHO], {
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --expose-gc`.trim(),
      Q026_MEDIDA_URL: url,
      Q026_MEDIDA_MODO: modo,
      ...(lote === undefined ? {} : { Q026_MEDIDA_LOTE: String(lote) }),
    },
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const linha = (r.stdout ?? "").split("\n").find((l) => l.startsWith("Q026_MEDIDA "));
  if (r.status !== 0 || !linha) {
    throw new Error(`medida ${modo}${lote ? `/${lote}` : ""} falhou (código ${String(r.status)}): ${(r.stderr ?? "").slice(-600)}`);
  }
  return JSON.parse(linha.slice("Q026_MEDIDA ".length)) as Medida;
}

function resumo(xs: readonly number[]): { mediana: number; min: number; max: number } {
  const o = [...xs].sort((a, b) => a - b);
  const meio = Math.floor(o.length / 2);
  const mediana = o.length % 2 ? o[meio]! : (o[meio - 1]! + o[meio]!) / 2;
  return { mediana: +mediana.toFixed(1), min: o[0]!, max: o[o.length - 1]! };
}

void (async () => {
  const inicio = Date.now();
  const loja = await semearLoja(URL_BASE, { longa: LONGA, viagens_curtas: CURTAS, prefixo: "q026med" });
  try {
    await loja.banco.cliente.query("VACUUM (ANALYZE) platform.event_log");
    console.log(`\nQ-026 — MEDIÇÃO EM PROCESSOS INDEPENDENTES · ${loja.linhas} linhas dos tipos (longa ${LONGA}, curtas ${CURTAS}) · ${REPETICOES} repetições · lotes ${LOTES.join(",")}`);
    const calibracao = medir(loja.banco.url, "calibracao");
    console.log(`  calibração do medidor do laço: bloqueio de 250 ms visto como ${calibracao.atraso_max_do_laco_ms} ms`);
    if (!(calibracao.atraso_max_do_laco_ms >= BLOQUEIO_MINIMO_VISTO_NA_CALIBRACAO_MS)) {
      throw new Error(`Q026_MEDIDA_MEDIDOR_DO_LACO_CEGO: bloqueio de 250 ms medido como ${calibracao.atraso_max_do_laco_ms} ms`);
    }
    const variantes: { modo: string; lote?: number }[] = [
      { modo: "controle" },
      { modo: "canonico" },
      ...LOTES.map((lote) => ({ modo: "incremental", lote })),
    ];
    const medidas: Medida[] = [];
    for (let r = 0; r < REPETICOES; r += 1) {
      // Ordem rotativa: nenhuma variante sempre primeiro (cache frio) ou sempre por último.
      const ordem = variantes.map((_, i) => variantes[(i + r) % variantes.length]!);
      for (const v of ordem) {
        const m = medir(loja.banco.url, v.modo, v.lote);
        medidas.push(m);
        console.log(`  ${r + 1}/${REPETICOES} ${v.modo}${v.lote ? `/${v.lote}` : ""}: leitura ${m.leitura_ms ?? "-"} ms · instante ${m.instantaneo_ms ?? "-"} ms · pico RSS ${m.pico_rss_mib} MiB · laço ${m.atraso_max_do_laco_ms} ms`);
      }
    }

    const leituras = medidas.filter((m) => m.modo !== "controle");
    const digests = new Set(leituras.map((m) => m.digest));
    if (digests.size !== 1) throw new Error(`Q026_MEDIDA_DIGESTS_DIFERENTES: ${[...digests].join(", ")}`);

    const tabela = variantes.map((v) => {
      const ms = medidas.filter((m) => m.modo === v.modo && (v.lote === undefined || m.lote === v.lote));
      const campo = (f: (m: Medida) => number | null) => {
        const xs = ms.map(f).filter((x): x is number => x !== null);
        return xs.length ? resumo(xs) : null;
      };
      return {
        variante: v.modo + (v.lote ? `/${v.lote}` : ""),
        n: ms.length,
        leitura_ms: campo((m) => m.leitura_ms),
        instantaneo_ms: campo((m) => m.instantaneo_ms),
        // BEGIN/COMMIT e tudo o que roda depois do COMMIT (a projeção, na canônica).
        fora_da_transacao_ms: campo((m) =>
          m.leitura_ms === null || m.instantaneo_ms === null ? null : +(m.leitura_ms - m.instantaneo_ms).toFixed(1),
        ),
        pico_rss_mib: campo((m) => m.pico_rss_mib),
        pico_menos_inicio_mib: campo((m) => +(m.pico_rss_mib - m.rss_inicio_mib).toFixed(2)),
        heap_retido_mib: campo((m) => m.heap_retido_mib),
        atraso_max_do_laco_ms: campo((m) => m.atraso_max_do_laco_ms),
        atraso_p99_do_laco_ms: campo((m) => m.atraso_p99_do_laco_ms),
      };
    });
    const resultado = {
      linhas: loja.linhas,
      longa: LONGA,
      curtas: CURTAS,
      viagens: leituras[0]?.viagens ?? null,
      repeticoes: REPETICOES,
      calibracao,
      digest: [...digests][0],
      tabela,
      medidas,
      duracao_s: Math.round((Date.now() - inicio) / 1000),
    };
    if (SAIDA) writeFileSync(SAIDA, JSON.stringify(resultado, null, 2));
    console.log("\n  variante              leitura ms (mín–máx)        instante ms            fora da tx ms        pico RSS MiB           pico−início MiB     heap retido MiB    laço máx ms");
    const f = (x: { mediana: number; min: number; max: number } | null) => (x ? `${x.mediana} (${x.min}–${x.max})` : "-");
    for (const t of tabela) {
      console.log(`  ${t.variante.padEnd(20)}  ${f(t.leitura_ms).padEnd(26)}  ${f(t.instantaneo_ms).padEnd(21)}  ${f(t.fora_da_transacao_ms).padEnd(19)}  ${f(t.pico_rss_mib).padEnd(21)}  ${f(t.pico_menos_inicio_mib).padEnd(18)}  ${f(t.heap_retido_mib).padEnd(17)}  ${f(t.atraso_max_do_laco_ms)}`);
    }
    console.log(`\nQ026_LEITOR_INCREMENTAL_MEDICAO ${JSON.stringify({ linhas: loja.linhas, viagens: resultado.viagens, digest_unico: true, repeticoes: REPETICOES, calibracao_do_laco_ms: calibracao.atraso_max_do_laco_ms })}`);
  } finally {
    await loja.banco.descartar();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
