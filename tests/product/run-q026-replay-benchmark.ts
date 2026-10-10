/**
 * Q-026 — benchmark PROGRESSIVO e CONTROLADO do replay da leitura de Entregas.
 *
 * Tres arvores, mesmo dado sintetico, mesmo banco descartavel:
 *  - original  d0716fd (a integracao validada, em uso hoje);
 *  - pr31      b20a847 (append sem copia quadratica, ChatGPT);
 *  - esta      a arvore de trabalho (projecao por escopo + particao na porta).
 *
 * Tres medidas, da mais isolada para a mais real:
 *  1. projecao  — `projetar` por escopo, em memoria, como a porta usa:
 *                 lista inteira (porta antiga) e particionada (porta nova);
 *                 distribuicoes "chegada" (ordem do banco), "embaralhada" e
 *                 "viagem-unica" (o pior caso usado no PR #31);
 *  2. porta     — `lerRealidadeDeEntregas` contra PostgreSQL semeado;
 *  3. http      — `GET /api/entregas` do Product System de cada arvore,
 *                 requisicoes INTERCALADAS entre as arvores.
 *
 * Controles: um processo filho por (arvore, medida) para isolar JIT/GC;
 * aquecimento fora da medida; `gc()` antes de cada amostra; mediana e p95;
 * e o SHA-256 da saida tem de ser IGUAL nas tres arvores — o benchmark e
 * tambem uma prova de equivalencia em escala (1,03 M).
 *
 * Variaveis: Q026_BENCH_TAMANHOS (padrao 1000,10000,100000), Q026_BENCH_PARTES
 * (projecao,porta,http), Q026_BENCH_SAIDA (JSON de resultados),
 * DELIVERYOS_PG_URL (porta e http; sem ela, PULADO em voz alta).
 * So dados `simulated`/`control`/`real` SINTETICOS. Nada operacional.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { bancoIsolado } from "../../src/platform/banco-isolado";
import { gerarLinhas, gravarLinhas, PERFIL_LOJA } from "./q026-replay-fixture";
import { REF_ORIGINAL, REF_PR31 } from "./q026-referencias";

const RAIZ = resolve(__dirname, "../..");
const TAMANHOS = (process.env.Q026_BENCH_TAMANHOS ?? "1000,10000,100000").split(",").map((x) => Number(x.trim()));
const PARTES = new Set((process.env.Q026_BENCH_PARTES ?? "projecao,porta,http").split(",").map((x) => x.trim()));
const URL_PG = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const SAIDA = process.env.Q026_BENCH_SAIDA ?? join(tmpdir(), `q026-bench-${process.pid}.json`);
for (const n of TAMANHOS) assert.ok(Number.isSafeInteger(n) && n >= 100 && n <= 2_000_000, `tamanho invalido: ${n}`);

interface Arvore { rotulo: string; caminho: string; temporaria: boolean }
const resultados: Record<string, unknown>[] = [];
const temporarios: string[] = [];

function arvoreDoCommit(rotulo: string, commit: string): Arvore | null {
  const dir = mkdtempSync(join(tmpdir(), `q026-${rotulo}-`));
  rmSync(dir, { recursive: true, force: true });
  try {
    execFileSync("git", ["worktree", "add", "--detach", dir, commit], { cwd: RAIZ, stdio: "ignore" });
  } catch {
    return null;
  }
  temporarios.push(dir);
  symlinkSync(join(RAIZ, "node_modules"), join(dir, "node_modules"), "dir");
  return { rotulo, caminho: dir, temporaria: true };
}

function limpar(): void {
  for (const d of temporarios.splice(0)) {
    try {
      execFileSync("git", ["worktree", "remove", "--force", d], { cwd: RAIZ, stdio: "ignore" });
    } catch {
      rmSync(d, { recursive: true, force: true });
    }
  }
  try { execFileSync("git", ["worktree", "prune"], { cwd: RAIZ, stdio: "ignore" }); } catch { /* nada */ }
}
process.on("exit", limpar);
process.on("SIGINT", () => { limpar(); process.exit(130); });
process.on("SIGTERM", () => { limpar(); process.exit(143); });

function filho(args: Record<string, unknown>): Record<string, unknown> {
  const r = spawnSync("npx", ["tsx", join(__dirname, "q026-bench-filho.ts"), JSON.stringify(args)], {
    cwd: RAIZ,
    encoding: "utf8",
    timeout: 45 * 60_000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "--expose-gc --max-old-space-size=7168" },
  });
  const linha = (r.stdout ?? "").split("\n").find((l) => l.startsWith("Q026_BENCH_FILHO "));
  if (r.status !== 0 || !linha) {
    throw new Error(`filho falhou (${String(args.rotulo)} ${String(args.modo)} ${String(args.fatos)}): status=${r.status} ${(r.stderr ?? "").slice(-1500)}`);
  }
  return JSON.parse(linha.slice("Q026_BENCH_FILHO ".length)) as Record<string, unknown>;
}

function tabela(titulo: string, linhas: Record<string, unknown>[], colunas: string[]): void {
  console.log(`\n${titulo}`);
  console.log("  " + colunas.map((c) => c.padEnd(16)).join(""));
  for (const l of linhas) console.log("  " + colunas.map((c) => String(l[c] ?? "").padEnd(16)).join(""));
}

function exigirMesmaSaida(grupo: Record<string, unknown>[], contexto: string): void {
  const shas = new Set(grupo.map((g) => g.sha256));
  assert.equal(shas.size, 1, `SAIDAS DIFERENTES entre arvores em ${contexto}: ${[...shas].join(" ")}`);
}

/* ------------------------------------------------------------------ */

function rssGrupo(pgid: number): number {
  let soma = 0;
  for (const pid of readdirSync("/proc")) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      const st = readFileSync(`/proc/${pid}/stat`, "utf8");
      const campos = st.slice(st.lastIndexOf(")") + 2).trim().split(/\s+/);
      if (Number(campos[2]) !== pgid) continue;
      soma += Number(/^VmRSS:\s*(\d+)\s*kB/m.exec(readFileSync(`/proc/${pid}/status`, "utf8"))?.[1] ?? 0);
    } catch { /* processo sumiu */ }
  }
  return soma;
}

/** Remove o que depende do instante da requisicao; o resto tem de ser identico. */
function normalizar(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalizar);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === "observado_em" || k === "lida_em") continue;
      o[k] = normalizar(x);
    }
    return o;
  }
  return v;
}

async function subirServidor(arvore: Arvore, porta: number, url: string): Promise<ChildProcess> {
  const p = spawn("npx", ["tsx", "tools/product_system_server.ts"], {
    cwd: arvore.caminho,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PRODUCT_UI_PORT: String(porta), DELIVERYOS_DATABASE_URL: url, DELIVERYOS_PG_URL: "",
      TATA_READER_INSTALL_ROOT: "", CONFERENCE_BRAIN_DATA_DIR: "", NODE_OPTIONS: "--max-old-space-size=7168" },
  });
  let saida = "";
  p.stdout?.on("data", (x) => { saida = (saida + String(x)).slice(-4000); });
  p.stderr?.on("data", (x) => { saida = (saida + String(x)).slice(-4000); });
  for (let i = 0; i < 400; i++) {
    if (p.exitCode !== null) throw new Error(`servidor ${arvore.rotulo} saiu ${p.exitCode}: ${saida.slice(-1000)}`);
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (r.status === 200) return p;
    } catch { /* subindo */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`servidor ${arvore.rotulo} nao subiu: ${saida.slice(-1000)}`);
}

async function requisitar(porta: number, pgid: number): Promise<{ ms: number; bytes: number; rss_pico_mb: number; sha256: string; viagens: number; fatos: number }> {
  let pico = 0;
  const amostra = () => { pico = Math.max(pico, rssGrupo(pgid)); };
  const relogio = setInterval(amostra, 100);
  amostra();
  const t = performance.now();
  try {
    const r = await fetch(`http://127.0.0.1:${porta}/api/entregas?unidade=ITAIM`, { signal: AbortSignal.timeout(30 * 60_000) });
    const corpo = Buffer.from(await r.arrayBuffer());
    const ms = performance.now() - t;
    amostra();
    assert.equal(r.status, 200);
    const j = JSON.parse(corpo.toString("utf8")) as { leitura?: { disponivel?: boolean }; realidade: { viagens: { fatos: number }[]; aparelhos: unknown[]; historico_sem_modo: unknown } };
    const realidade = normalizar({ viagens: j.realidade.viagens, aparelhos: j.realidade.aparelhos, historico_sem_modo: j.realidade.historico_sem_modo });
    return {
      ms: Math.round(ms * 100) / 100,
      bytes: corpo.byteLength,
      rss_pico_mb: Math.round(pico / 1024),
      sha256: createHash("sha256").update(JSON.stringify(realidade)).digest("hex"),
      viagens: j.realidade.viagens.length,
      fatos: j.realidade.viagens.reduce((s, v) => s + v.fatos, 0),
    };
  } finally {
    clearInterval(relogio);
  }
}

/* ------------------------------------------------------------------ */

void (async () => {
  console.log(`Q-026 — benchmark progressivo · tamanhos ${TAMANHOS.join(", ")} · partes ${[...PARTES].join(",")}`);
  console.log(`maquina: ${spawnSync("nproc", { encoding: "utf8" }).stdout.trim()} vCPU, node ${process.version}`);
  const original = arvoreDoCommit("original", REF_ORIGINAL.commit);
  if (!original) throw new Error("a arvore ORIGINAL d0716fd e obrigatoria e nao foi criada");
  const pr31 = arvoreDoCommit("pr31", REF_PR31.commit);
  if (!pr31) console.log("PULADO (parcial): b20a847 indisponivel — PR #31 fora da comparacao");
  const esta: Arvore = { rotulo: "esta", caminho: RAIZ, temporaria: false };
  const arvores = [original, ...(pr31 ? [pr31] : []), esta];

  /* 1. projecao em memoria */
  if (PARTES.has("projecao")) {
    for (const fatos of TAMANHOS) {
      const distribuicoes: string[] = ["chegada"];
      if (fatos <= 100_000) distribuicoes.push("embaralhada");
      for (const distribuicao of distribuicoes) {
        const repeticoes = fatos <= 100_000 ? 5 : 3;
        const grupo: Record<string, unknown>[] = [];
        const variantes: [Arvore, string][] = [[original, "lista-inteira"], ...(pr31 ? [[pr31, "lista-inteira"] as [Arvore, string]] : []),
          [esta, "lista-inteira"], [original, "particionada"], [esta, "particionada"]];
        for (const [arv, variante] of variantes) {
          const r = filho({ modo: "projecao", arvore: arv.caminho, rotulo: arv.rotulo, fatos, distribuicao, repeticoes, variante });
          grupo.push({ ...r, medida: "projecao", arvore: arv.rotulo });
        }
        exigirMesmaSaida(grupo, `projecao ${fatos} ${distribuicao}`);
        resultados.push(...grupo);
        tabela(`projecao · ${fatos} fatos · ${distribuicao} · ${grupo[0].escopos} escopos · ${repeticoes} amostras (mesmo SHA ${String(grupo[0].sha256).slice(0, 12)})`,
          grupo, ["arvore", "variante", "mediana_ms", "p95_ms", "min_ms", "heap_pico_mb"]);
      }
    }
    for (const fatos of TAMANHOS.filter((n) => n <= 16_000).concat(TAMANHOS.some((n) => n >= 16_000) ? [16_000] : [])) {
      const grupo: Record<string, unknown>[] = [];
      for (const arv of arvores) {
        const r = filho({ modo: "projecao", arvore: arv.caminho, rotulo: arv.rotulo, fatos, distribuicao: "viagem-unica", repeticoes: 5, variante: "lista-inteira" });
        grupo.push({ ...r, medida: "projecao-viagem-unica", arvore: arv.rotulo });
      }
      exigirMesmaSaida(grupo, `viagem unica ${fatos}`);
      resultados.push(...grupo);
      tabela(`projecao · UMA viagem com ${fatos} fatos (pior caso do PR #31)`, grupo, ["arvore", "mediana_ms", "p95_ms", "min_ms"]);
    }
  }

  /* 2 e 3. porta e HTTP com PostgreSQL */
  if (PARTES.has("porta") || PARTES.has("http")) {
    if (!URL_PG) {
      console.log("\nPULADO: DELIVERYOS_PG_URL nao definida — porta e HTTP NAO foram medidos.");
      if (process.env.Q026_EXIGIR_PG === "1") process.exit(1);
    } else {
      for (const fatos of TAMANHOS) {
        const b = await bancoIsolado(URL_PG, undefined, "q026bench");
        try {
          const linhas = gerarLinhas({ ...PERFIL_LOJA, fatos });
          await b.cliente.query("INSERT INTO identity.unit(unit_id, display_name) VALUES ('ITAIM','Itaim (sintetico)')");
          for (const d of [...new Set(linhas.map((l) => l.device_id))].sort()) {
            await b.cliente.query("INSERT INTO identity.device(device_id, unit_id, label) VALUES ($1,'ITAIM',$1)", [d]);
          }
          const t0 = performance.now();
          await gravarLinhas(b.cliente, [...linhas].sort((x, y) => (x.recorded_at < y.recorded_at ? -1 : x.recorded_at > y.recorded_at ? 1 : 0)));
          await b.cliente.query("ANALYZE platform.event_log");
          console.log(`\nbanco ${b.nome}: ${fatos} fatos semeados em ${Math.round(performance.now() - t0)} ms`);
          const repeticoes = fatos <= 100_000 ? 5 : 3;

          if (PARTES.has("porta")) {
            const grupo: Record<string, unknown>[] = [];
            for (const arv of arvores) {
              const r = filho({ modo: "porta", arvore: arv.caminho, rotulo: arv.rotulo, fatos, repeticoes, url: b.url });
              grupo.push({ ...r, medida: "porta", arvore: arv.rotulo });
            }
            exigirMesmaSaida(grupo, `porta ${fatos}`);
            resultados.push(...grupo);
            tabela(`porta (lerRealidadeDeEntregas) · ${fatos} fatos · ${grupo[0].viagens} viagens · ${repeticoes} amostras`, grupo,
              ["arvore", "mediana_ms", "p95_ms", "min_ms", "rss_pico_mb", "max_rss_mb"]);
          }

          if (PARTES.has("http")) {
            const servidores: { arv: Arvore; porta: number; proc: ChildProcess }[] = [];
            try {
              for (let i = 0; i < arvores.length; i++) {
                const porta = 15_000 + (process.pid % 500) * 4 + i;
                servidores.push({ arv: arvores[i], porta, proc: await subirServidor(arvores[i], porta, b.url) });
              }
              const amostras = new Map<string, Awaited<ReturnType<typeof requisitar>>[]>();
              // Aquecimento (fora da medida), depois rodadas INTERCALADAS entre as arvores.
              for (const s of servidores) await requisitar(s.porta, s.proc.pid!);
              for (let rep = 0; rep < repeticoes; rep++) {
                for (const s of servidores) {
                  const m = await requisitar(s.porta, s.proc.pid!);
                  amostras.set(s.arv.rotulo, [...(amostras.get(s.arv.rotulo) ?? []), m]);
                }
              }
              const grupo = servidores.map((s) => {
                const ms = amostras.get(s.arv.rotulo)!.map((m) => m.ms).sort((x, y) => x - y);
                const q = (p: number) => ms[Math.min(ms.length - 1, Math.ceil(p * ms.length) - 1)];
                const ult = amostras.get(s.arv.rotulo)!.at(-1)!;
                const shas = new Set(amostras.get(s.arv.rotulo)!.map((m) => m.sha256));
                assert.equal(shas.size, 1, `${s.arv.rotulo}: resposta mudou entre requisicoes`);
                return {
                  medida: "http", arvore: s.arv.rotulo, fatos, mediana_ms: q(0.5), p95_ms: q(0.95), min_ms: ms[0], amostras: ms,
                  bytes: ult.bytes, rss_pico_mb: Math.max(...amostras.get(s.arv.rotulo)!.map((m) => m.rss_pico_mb)),
                  viagens: ult.viagens, fatos_nas_viagens: ult.fatos, sha256: ult.sha256,
                };
              });
              exigirMesmaSaida(grupo, `http ${fatos}`);
              resultados.push(...grupo);
              tabela(`HTTP GET /api/entregas · ${fatos} fatos · ${repeticoes} rodadas intercaladas`, grupo,
                ["arvore", "mediana_ms", "p95_ms", "min_ms", "bytes", "rss_pico_mb"]);
            } finally {
              for (const s of servidores) { try { process.kill(-s.proc.pid!, "SIGTERM"); } catch { /* ja saiu */ } }
              await new Promise((r) => setTimeout(r, 800));
            }
          }
        } finally {
          await b.descartar();
        }
      }
    }
  }

  writeFileSync(SAIDA, JSON.stringify({ gerado_em: new Date().toISOString(), tamanhos: TAMANHOS, resultados }, null, 1));
  console.log(`\nresultados: ${SAIDA}`);
  console.log("Q026_BENCH_PASS: mesmas saidas (SHA-256) nas arvores comparadas em cada medida");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
