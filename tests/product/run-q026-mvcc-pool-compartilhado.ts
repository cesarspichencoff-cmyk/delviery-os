/**
 * Q-026 — o pool de leitura (max 2) é COMPARTILHADO: o que acontece com as
 * outras rotas do servidor real enquanto `/api/entregas` lê?
 * Somente teste. PostgreSQL DESCARTÁVEL, dados sintéticos.
 *
 * `tools/product_system_server.ts` cria UM pool de leitura (`max: 2`, checkout
 * limitado a min(1 s, prazo) com a candidata ligada) e o usa em `/api/entregas`
 * E em `/api/historico`, `/api/operacao-viva` e `/api/copiloto`. A admissão da
 * candidata conta só os pedidos de Entregas. Com admissão 2, duas leituras longas
 * de Entregas podem segurar as duas conexões; o histórico espera o checkout e,
 * passado o limite, cai na própria degradação ("Falha ao ler event log").
 *
 * Para cada admissão (2 e 1): uma instância do servidor real, dois clientes de
 * Entregas em laço fechado (processo próprio) e uma sonda de
 * `/api/historico?unit_id=ITAIM` a cada 200 ms (este processo). Conta-se quantas
 * respostas do histórico vieram degradadas. Saída: `Q026_POOL_RESULTADO {…}`.
 * Sem DELIVERYOS_PG_URL: sai 78.
 */

import http from "node:http";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient } from "../../src/platform/persistence/sql-client";
import { criarPapeisDeLeitura, pausa, resumir, semearPerfil, subirFilho, tamanhoDo, urlComUsuario, type Filho, type Perfil } from "./q026-mvcc-comum";

const URL_BASE = (process.env.DELIVERYOS_PG_URL ?? "").trim();
if (!URL_BASE) {
  console.error("PULADO: DELIVERYOS_PG_URL ausente. Nada medido — isto nao e verde.");
  process.exit(78);
}
const PERFIL = (process.env.Q026_POOL_PERFIL ?? "mista") as Perfil;
const ESCALA = Number(process.env.Q026_POOL_ESCALA ?? 1);
const LEITOR = (process.env.Q026_POOL_LEITOR ?? "incremental") as "canonico" | "incremental";
const DURACAO_S = Number(process.env.Q026_POOL_DURACAO_S ?? 30);
const ADMISSOES = (process.env.Q026_POOL_ADMISSOES ?? "2,1").split(",").map(Number);
const SAIDA = (process.env.Q026_POOL_SAIDA ?? "").trim();
const DIR = resolve(__dirname);

function obter(porta: number, caminho: string): Promise<{ status: number; corpo: string; ms: number }> {
  const t0 = performance.now();
  return new Promise((res) => {
    const req = http.request({ host: "127.0.0.1", port: porta, path: caminho, method: "GET", timeout: 30_000 }, (r) => {
      const partes: Buffer[] = [];
      r.on("data", (b: Buffer) => partes.push(b));
      r.on("end", () => res({ status: r.statusCode ?? 0, corpo: Buffer.concat(partes).toString("utf8"), ms: +(performance.now() - t0).toFixed(1) }));
      r.on("error", () => res({ status: -1, corpo: "", ms: +(performance.now() - t0).toFixed(1) }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => res({ status: 0, corpo: "", ms: +(performance.now() - t0).toFixed(1) }));
    req.end();
  });
}

void (async () => {
  const banco = await bancoIsolado(URL_BASE, undefined, "q026pool");
  const admin = await createPgClient({ url: URL_BASE, max: 1 });
  const prefixo = `q026pool_${process.pid}_${Math.random().toString(36).slice(2, 6)}`;
  const filhos: Filho[] = [];
  let codigo = 0;
  try {
    const fatos = await semearPerfil(banco.cliente, tamanhoDo(PERFIL, ESCALA));
    await banco.cliente.query("VACUUM (ANALYZE) platform.event_log");
    const papeis = await criarPapeisDeLeitura(admin, banco.cliente, banco.nome, ADMISSOES.length, prefixo);
    console.log(`\nQ-026 POOL COMPARTILHADO · ${PERFIL}×${ESCALA} (${fatos} fatos) · ${LEITOR} · admissões ${ADMISSOES.join(", ")} · ${DURACAO_S} s cada`);
    const resultados: Array<Record<string, unknown>> = [];
    for (const [i, admissao] of ADMISSOES.entries()) {
      const srv = subirFilho(
        join(DIR, "q026-mvcc-servidor-filho.ts"),
        {
          DELIVERYOS_DATABASE_URL: urlComUsuario(banco.url, papeis[i]!),
          DELIVERYOS_ENTREGAS_MAX_INFLIGHT: String(admissao),
          DELIVERYOS_ENTREGAS_RR_DEADLINE_MS: "15000",
          DELIVERYOS_ENTREGAS_INCREMENTAL_RR: LEITOR === "incremental" ? "1" : "",
          DELIVERYOS_PG_URL: "",
        },
        `servidor-adm${admissao}`,
      );
      filhos.push(srv);
      const porta = Number((await srv.esperar("pronto", 90_000)).porta);
      // Linha de base: o histórico sozinho, sem Entregas.
      const base = await obter(porta, "/api/historico?unit_id=ITAIM");
      const cli = subirFilho(
        join(DIR, "q026-mvcc-cliente-filho.ts"),
        { Q026_MVCC_PORTAS: String(porta), Q026_MVCC_CLIENTES: "2", Q026_MVCC_SONDAR: "0", Q026_MVCC_DURACAO_MS: String(DURACAO_S * 1000) },
        `clientes-adm${admissao}`,
      );
      filhos.push(cli);
      const sondas: Array<{ status: number; degradado: boolean; ms: number }> = [];
      const fim = performance.now() + DURACAO_S * 1000;
      await pausa(1500); // os clientes entram
      while (performance.now() < fim - 1000) {
        const r = await obter(porta, "/api/historico?unit_id=ITAIM");
        sondas.push({ status: r.status, degradado: r.corpo.includes("Falha ao ler event log"), ms: r.ms });
        await pausa(200);
      }
      const m = (await cli.esperar("clientes", DURACAO_S * 1000 + 120_000)) as unknown as { pedidos: Array<{ status: number; erro: string | null }> };
      const entregas: Record<string, number> = {};
      for (const p of m.pedidos) {
        const k = `${p.status}${p.erro ? `_${p.erro}` : ""}`;
        entregas[k] = (entregas[k] ?? 0) + 1;
      }
      const degradadas = sondas.filter((s) => s.degradado).length;
      const r = {
        admissao,
        historico_sozinho: { status: base.status, degradado: base.corpo.includes("Falha ao ler event log"), ms: base.ms },
        historico_sondas: sondas.length,
        historico_degradadas: degradadas,
        historico_status: [...new Set(sondas.map((s) => s.status))],
        historico_ms: resumir(sondas.map((s) => s.ms)),
        entregas,
      };
      resultados.push(r);
      console.log(`  admissão ${admissao}: histórico sozinho ${base.status}/${r.historico_sozinho.degradado ? "degradado" : "ok"} em ${base.ms} ms · sob Entregas: ${degradadas}/${sondas.length} respostas DEGRADADAS ("Falha ao ler event log") · histórico ms p50 ${r.historico_ms.p50} / máx ${r.historico_ms.max} · Entregas ${JSON.stringify(entregas)}`);
      srv.enviar({ tipo: "parar" });
      await pausa(800);
    }
    if (SAIDA) writeFileSync(SAIDA, JSON.stringify({ perfil: PERFIL, escala: ESCALA, fatos, leitor: LEITOR, resultados }, null, 2));
    console.log(`\nQ026_POOL_RESULTADO ${JSON.stringify(resultados.map((r) => ({ admissao: r.admissao, degradadas: r.historico_degradadas, sondas: r.historico_sondas })))}`);
  } catch (e) {
    console.error(e);
    codigo = 1;
  } finally {
    for (const f of filhos) if (f.proc.exitCode === null) f.proc.kill("SIGKILL");
    await pausa(300);
    await banco.descartar().catch(() => undefined);
    const sobras = await admin.query(`SELECT rolname::text AS r FROM pg_roles WHERE rolname LIKE $1`, [`${prefixo}%`]).catch(() => []);
    for (const s of sobras) await admin.query(`DROP ROLE IF EXISTS ${String(s.r)}`).catch(() => undefined);
    await admin.close();
  }
  process.exit(codigo);
})();
