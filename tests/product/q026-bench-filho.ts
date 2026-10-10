/**
 * Q-026 — processo FILHO do benchmark. Um processo por (arvore, medida), para
 * o JIT e o coletor de lixo de uma implementacao nao contaminarem a outra.
 *
 *   projecao: gera o log sintetico em memoria e mede a projecao como a porta
 *             a usa (um `projetar` por escopo), em quatro variantes.
 *   porta:    mede `lerRealidadeDeEntregas` da arvore contra um banco ja
 *             semeado (leitura do log + projecoes + aparelhos).
 *
 * Imprime UMA linha `Q026_BENCH_FILHO {json}` com mediana, p95, min, max,
 * memoria e o SHA-256 da saida — o pai exige o mesmo SHA em todas as arvores.
 *
 * Argumentos (JSON em argv[2]): { modo, arvore, rotulo, fatos, distribuicao,
 * repeticoes, variante, url }.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import type { EventEnvelope, SourceMode } from "../../src/platform/contracts/event-catalog";
import { embaralhar, envelopeDaLinha, gerarLinhas, PERFIL_LOJA } from "./q026-replay-fixture";

interface Args {
  modo: "projecao" | "porta";
  arvore: string;
  rotulo: string;
  fatos: number;
  distribuicao: "chegada" | "embaralhada" | "viagem-unica";
  repeticoes: number;
  /** projecao: "lista-inteira" (porta antiga) ou "particionada" (porta nova). */
  variante?: "lista-inteira" | "particionada";
  url?: string;
}

const a = JSON.parse(process.argv[2]) as Args;
const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error("rode com --expose-gc");

function estatistica(ms: number[]) {
  const s = [...ms].sort((x, y) => x - y);
  const q = (p: number) => s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)];
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return { mediana_ms: r2(q(0.5)), p95_ms: r2(q(0.95)), min_ms: r2(s[0]), max_ms: r2(s[s.length - 1]), amostras: s.map(r2) };
}

function mb(bytes: number): number {
  return Math.round(bytes / 1048576);
}

function logDaDistribuicao(): EventEnvelope[] {
  if (a.distribuicao === "viagem-unica") {
    // O pior caso do PR #31: UMA viagem, N pontos.
    const agora = PERFIL_LOJA.agora.getTime();
    return Array.from({ length: a.fatos }, (_, k) => ({
      event_id: `volume-${k}`, event_type: k === 0 ? "trip_started" : "gps_batch_received",
      event_version: k === 0 ? "trip_started@1.0.0" : "gps_batch_received@1.0.0", unit_id: "ITAIM",
      trip_id: "LONGA", origin: "device", source_mode: "simulated", idempotency_key: `volume-key-${k}`, payload: {},
      occurred_at: new Date(agora - (a.fatos - k) * 1000).toISOString(),
      received_at: new Date(agora - (a.fatos - k) * 1000).toISOString(),
    } as EventEnvelope));
  }
  const linhas = gerarLinhas({ ...PERFIL_LOJA, fatos: a.fatos });
  const porChegada = [...linhas].sort((x, y) => (x.recorded_at < y.recorded_at ? -1 : x.recorded_at > y.recorded_at ? 1 : 0));
  const env = porChegada.map(envelopeDaLinha);
  // Texto achatado, como sai do driver do banco (evita ConsString do gerador).
  const plano = JSON.parse(JSON.stringify(env)) as EventEnvelope[];
  return a.distribuicao === "embaralhada" ? embaralhar(plano, 7) : plano;
}

async function medirProjecao(): Promise<void> {
  type Projetar = (e: readonly EventEnvelope[], o: { agora: Date; unit_id: string; source_mode: SourceMode }) => unknown;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { projetar } = require(join(a.arvore, "src/platform/projections/operacao-viva.ts")) as { projetar: Projetar };
  const log = logDaDistribuicao();
  const agora = PERFIL_LOJA.agora;
  const chaves = [...new Set(log.map((e) => `${e.unit_id}|${e.source_mode}`))].sort((x, y) => x.localeCompare(y));
  const escopos = chaves.map((k) => {
    const [unit_id, source_mode] = k.split("|") as [string, SourceMode];
    return { unit_id, source_mode };
  });
  const rodar = () => {
    if (a.variante === "particionada") {
      const por = new Map<string, EventEnvelope[]>();
      for (const f of log) {
        const k = `${f.unit_id}|${f.source_mode}`;
        const l = por.get(k);
        if (l) l.push(f);
        else por.set(k, [f]);
      }
      return escopos.map((e) => projetar(por.get(`${e.unit_id}|${e.source_mode}`) ?? [], { agora, ...e }));
    }
    return escopos.map((e) => projetar(log, { agora, ...e }));
  };
  gc!();
  const heap0 = process.memoryUsage().heapUsed;
  let saida = rodar(); // aquecimento, fora da medida
  const sha = createHash("sha256").update(JSON.stringify(saida)).digest("hex");
  saida = null as unknown as typeof saida;
  const ms: number[] = [];
  let heapPico = 0;
  for (let i = 0; i < a.repeticoes; i++) {
    gc!();
    const t = performance.now();
    const r = rodar();
    ms.push(performance.now() - t);
    heapPico = Math.max(heapPico, process.memoryUsage().heapUsed);
    if (i === 0 && createHash("sha256").update(JSON.stringify(r)).digest("hex") !== sha) throw new Error("saida mudou entre execucoes");
  }
  console.log("Q026_BENCH_FILHO " + JSON.stringify({
    modo: a.modo, rotulo: a.rotulo, variante: a.variante, fatos: log.length, distribuicao: a.distribuicao,
    escopos: escopos.length, ...estatistica(ms), heap_base_mb: mb(heap0), heap_pico_mb: mb(heapPico),
    max_rss_mb: Math.round(process.resourceUsage().maxRSS / 1024), sha256: sha,
  }));
}

async function medirPorta(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { lerRealidadeDeEntregas } = require(join(a.arvore, "src/platform/leitura/realidade-de-entregas.ts"));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createPgClient } = require(join(a.arvore, "src/platform/persistence/sql-client.ts"));
  const cliente = await createPgClient({ url: a.url, max: 2 });
  try {
    const agora = PERFIL_LOJA.agora;
    gc!();
    const rss0 = process.memoryUsage().rss;
    const aquec = await lerRealidadeDeEntregas(cliente, { agora });
    const sha = createHash("sha256").update(JSON.stringify(aquec.projecoes)).digest("hex");
    const viagens = (aquec.projecoes as { viagens: unknown[] }[]).reduce((s, p) => s + p.viagens.length, 0);
    const ms: number[] = [];
    let rssPico = 0;
    for (let i = 0; i < a.repeticoes; i++) {
      gc!();
      const t = performance.now();
      const r = await lerRealidadeDeEntregas(cliente, { agora });
      ms.push(performance.now() - t);
      rssPico = Math.max(rssPico, process.memoryUsage().rss);
      if (createHash("sha256").update(JSON.stringify(r.projecoes)).digest("hex") !== sha) throw new Error("projecoes mudaram entre leituras");
    }
    console.log("Q026_BENCH_FILHO " + JSON.stringify({
      modo: a.modo, rotulo: a.rotulo, fatos: a.fatos, viagens, escopos: aquec.projecoes.length, ...estatistica(ms),
      rss_base_mb: mb(rss0), rss_pico_mb: mb(rssPico), max_rss_mb: Math.round(process.resourceUsage().maxRSS / 1024), sha256: sha,
    }));
  } finally {
    await cliente.close();
  }
}

(a.modo === "projecao" ? medirProjecao() : medirPorta()).catch((e) => {
  console.error(e);
  process.exit(1);
});
