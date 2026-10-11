/**
 * Q-026 — MVCC, VACUUM e concorrência no SERVIDOR REAL, sob escrita contínua.
 * Somente teste. PostgreSQL DESCARTÁVEL, dados sintéticos, nada operacional.
 *
 * Uma execução = um cenário:
 *   perfil (longa | curtas | mista) × leitor (controle | canonico | incremental)
 *   × instâncias (1 | 2 | 4) × admissão por instância (1 | 2 | 4) × prazo.
 *
 * Linha do tempo:
 *   semeadura → escritor + amostrador + VACUUM (fase PRÉ, sem leitor, 5 s)
 *   → instâncias do servidor real (`tools/product_system_server.ts`, flags
 *     opt-in da candidata #77, papel SELECT-only por instância)
 *   → calibração dos dois medidores (bloqueio conhecido de 250 ms)
 *   → CARGA (clientes HTTP em laço fechado + sonda /api/health)
 *   → checagem de VAZAMENTO (nenhuma sessão de leitura em transação, sem xmin)
 *   → fase PÓS (sem leitor, escritor e VACUUM continuam)
 *   → VACUUM final: as versões mortas presas pela carga têm de ser removíveis.
 *
 * `controle` não sobe servidor: é a mesma linha do tempo sem nenhum leitor.
 *
 * Saída: JSON completo (toda transação, todo VACUUM, toda resposta) e uma
 * linha `Q026_MVCC_RESULTADO {…}`. Sem DELIVERYOS_PG_URL: sai 78 — nunca verde.
 */

import http from "node:http";
import { writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient } from "../../src/platform/persistence/sql-client";
import {
  criarChurn,
  criarPapeisDeLeitura,
  icBootstrap,
  pausa,
  resumir,
  semearPerfil,
  subirFilho,
  tamanhoDo,
  urlComUsuario,
  type Filho,
  type Perfil,
} from "./q026-mvcc-comum";

const URL_BASE = (process.env.DELIVERYOS_PG_URL ?? "").trim();
if (!URL_BASE) {
  console.error("PULADO: DELIVERYOS_PG_URL ausente. Nenhuma medida MVCC rodou — isto nao e verde.");
  process.exit(78);
}

const PERFIL = (process.env.Q026_MVCC_PERFIL ?? "longa") as Perfil;
const ESCALA = Number(process.env.Q026_MVCC_ESCALA ?? 1);
const LEITOR = (process.env.Q026_MVCC_LEITOR ?? "incremental") as "controle" | "canonico" | "incremental";
const INSTANCIAS = Number(process.env.Q026_MVCC_INSTANCIAS ?? 1);
const INFLIGHT = Number(process.env.Q026_MVCC_INFLIGHT ?? 2);
const PRAZO_MS = Number(process.env.Q026_MVCC_PRAZO_MS ?? 15_000);
const CLIENTES = Number(process.env.Q026_MVCC_CLIENTES ?? 2 * INSTANCIAS);
const PENSAR_MS = Number(process.env.Q026_MVCC_PENSAR_MS ?? 0);
const DURACAO_S = Number(process.env.Q026_MVCC_DURACAO_S ?? 60);
const UPDATES_S = Number(process.env.Q026_MVCC_UPDATES_S ?? 400);
const FATOS_S = Number(process.env.Q026_MVCC_FATOS_S ?? 20);
const PRE_S = Number(process.env.Q026_MVCC_PRE_S ?? 5);
const POS_S = Number(process.env.Q026_MVCC_POS_S ?? 6);
const SAIDA = (process.env.Q026_MVCC_SAIDA ?? "").trim();

const validos: Array<[boolean, string]> = [
  [["longa", "curtas", "mista"].includes(PERFIL), "Q026_MVCC_PERFIL"],
  [["controle", "canonico", "incremental"].includes(LEITOR), "Q026_MVCC_LEITOR"],
  [[1, 2, 4].includes(INSTANCIAS), "Q026_MVCC_INSTANCIAS"],
  [[1, 2, 4].includes(INFLIGHT), "Q026_MVCC_INFLIGHT"],
  [Number.isInteger(PRAZO_MS) && PRAZO_MS >= 1000 && PRAZO_MS <= 15000, "Q026_MVCC_PRAZO_MS"],
  [Number.isFinite(ESCALA) && ESCALA > 0, "Q026_MVCC_ESCALA"],
  [Number.isInteger(CLIENTES) && CLIENTES >= 1, "Q026_MVCC_CLIENTES"],
];
for (const [ok, nome] of validos) {
  if (!ok) {
    console.error(`Q026_MVCC_PARAMETRO_INVALIDO: ${nome}`);
    process.exit(2);
  }
}

const AQUI = resolve(__dirname);
const FILHO = (n: string) => join(AQUI, n);

function obter(porta: number, caminho: string, timeoutMs = 30_000): Promise<{ status: number; ms: number }> {
  const t0 = performance.now();
  return new Promise((res, rej) => {
    const req = http.request({ host: "127.0.0.1", port: porta, path: caminho, method: "GET", timeout: timeoutMs }, (r) => {
      r.resume();
      r.on("end", () => res({ status: r.statusCode ?? 0, ms: +(performance.now() - t0).toFixed(1) }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", rej);
    req.end();
  });
}

/** VACUUM (VERBOSE) avulso; devolve as versões mortas que ele NÃO pôde remover. */
async function vacuumFinal(url: string): Promise<number | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Client } = require("pg") as {
    Client: new (o: Record<string, unknown>) => {
      connect(): Promise<void>;
      query(s: string): Promise<unknown>;
      on(e: "notice", f: (m: { message?: string }) => void): void;
      end(): Promise<void>;
    };
  };
  const c = new Client({ connectionString: url, application_name: "q026-vacuum-final" });
  await c.connect();
  const avisos: string[] = [];
  c.on("notice", (m) => {
    if (m.message) avisos.push(m.message);
  });
  try {
    await c.query("VACUUM (VERBOSE) public.q026_churn");
  } finally {
    await c.end();
  }
  const m = /(\d+) are dead but not yet removable/.exec(avisos.join("\n"));
  return m ? Number(m[1]) : null;
}

interface TxAmostrada {
  pid: number;
  papel: string;
  xact_ms: number;
  visto_ultimo_ms: number;
  sumiu_ms: number | null;
  com_xmin: boolean;
  maior_idade_xmin: number;
  estados: string[];
  maior_ocioso_ms: number;
  maior_ativo_ms: number;
  esperas: string[];
}
interface VacuumAmostrado {
  t: number;
  removidas: number | null;
  mortas_nao_removiveis: number | null;
  idade_corte_xids: number | null;
  tamanho_bytes: number | null;
}

void (async () => {
  const inicio = Date.now();
  const tamanho = tamanhoDo(PERFIL, ESCALA);
  const banco = await bancoIsolado(URL_BASE, undefined, "q026mvcc");
  const prefixoPapel = `q026mvcc_${process.pid}_${Math.random().toString(36).slice(2, 6)}`;
  const admin = await createPgClient({ url: URL_BASE, max: 1 });
  const filhos: Filho[] = [];
  let papeis: string[] = [];
  let codigo = 0;
  try {
    const t0 = performance.now();
    const fatos = await semearPerfil(banco.cliente, tamanho);
    await criarChurn(banco.cliente);
    await banco.cliente.query("VACUUM (ANALYZE) platform.event_log");
    await banco.cliente.query("VACUUM (ANALYZE) public.q026_churn");
    const semeadura_ms = Math.round(performance.now() - t0);
    papeis = LEITOR === "controle" ? [] : await criarPapeisDeLeitura(admin, banco.cliente, banco.nome, INSTANCIAS, prefixoPapel);
    const versao = String((await banco.cliente.query("SHOW server_version"))[0]?.server_version);
    console.log(`\nQ-026 MVCC · ${PERFIL}×${ESCALA} (${fatos} fatos) · ${LEITOR} · ${INSTANCIAS} instância(s) × admissão ${INFLIGHT} · prazo ${PRAZO_MS} ms · ${CLIENTES} cliente(s) · ${DURACAO_S} s · escritor ${UPDATES_S} upd/s + ${FATOS_S} fatos/s`);

    const amostrador = subirFilho(FILHO("q026-mvcc-amostrador-filho.ts"), { Q026_MVCC_URL: banco.url, Q026_MVCC_PAPEL_PREFIXO: prefixoPapel }, "amostrador");
    filhos.push(amostrador);
    await amostrador.esperar("pronto", 30_000);
    const escritor = subirFilho(FILHO("q026-mvcc-escritor-filho.ts"), { Q026_MVCC_URL: banco.url, Q026_MVCC_UPDATES_S: String(UPDATES_S), Q026_MVCC_FATOS_S: String(FATOS_S) }, "escritor");
    filhos.push(escritor);
    const tPre = Date.now();
    await pausa(PRE_S * 1000);

    // Instâncias do servidor real.
    const tServidores = Date.now();
    const servidores: Array<{ filho: Filho; porta: number; papel: string }> = [];
    for (let i = 0; i < (LEITOR === "controle" ? 0 : INSTANCIAS); i += 1) {
      const papel = papeis[i]!;
      const f = subirFilho(
        FILHO("q026-mvcc-servidor-filho.ts"),
        {
          DELIVERYOS_DATABASE_URL: urlComUsuario(banco.url, papel),
          DELIVERYOS_ENTREGAS_MAX_INFLIGHT: String(INFLIGHT),
          DELIVERYOS_ENTREGAS_RR_DEADLINE_MS: String(PRAZO_MS),
          DELIVERYOS_ENTREGAS_INCREMENTAL_RR: LEITOR === "incremental" ? "1" : "",
          DELIVERYOS_PG_URL: "",
        },
        `servidor${i + 1}`,
      );
      filhos.push(f);
      const pronto = await f.esperar("pronto", 90_000);
      servidores.push({ filho: f, porta: Number(pronto.porta), papel });
    }

    // Aquecimento (fora da medida) e calibração dos dois medidores.
    const calibracao: Array<{ instancia: number; sonda_ms: number; laco_max_ms: number }> = [];
    for (const [i, s] of servidores.entries()) {
      const aquecer = await obter(s.porta, "/api/entregas");
      if (aquecer.status !== 200) throw new Error(`Q026_MVCC_AQUECIMENTO_FALHOU instancia ${i + 1}: HTTP ${aquecer.status}`);
      await pausa(300);
      const marca = s.filho.mensagens.length;
      s.filho.enviar({ tipo: "bloquear", ms: 250 });
      const sonda = await obter(s.porta, "/api/health");
      await pausa(600);
      const janelas = s.filho.mensagens.slice(marca).filter((m) => m.tipo === "metricas");
      const lacoMax = Math.max(0, ...janelas.map((m) => Number(m.laco_max_ms)));
      calibracao.push({ instancia: i + 1, sonda_ms: sonda.ms, laco_max_ms: lacoMax });
      if (!(sonda.ms >= 200 && lacoMax >= 200)) {
        throw new Error(`Q026_MVCC_MEDIDOR_CEGO instancia ${i + 1}: sonda ${sonda.ms} ms, laço ${lacoMax} ms para bloqueio de 250 ms`);
      }
    }

    // CARGA.
    const tCarga = Date.now();
    let respostas: { pedidos: Array<Record<string, unknown>>; sondas: Record<string, { t: number[]; ms: number[]; falhas: number }> } = { pedidos: [], sondas: {} };
    if (servidores.length > 0) {
      // Um processo por cliente e um só para as sondas: o parse de uma resposta
      // grande num cliente não pode atrasar a sonda nem outro cliente.
      const comum = {
        Q026_MVCC_PORTAS: servidores.map((s) => s.porta).join(","),
        Q026_MVCC_PENSAR_MS: String(PENSAR_MS),
        Q026_MVCC_DURACAO_MS: String(DURACAO_S * 1000),
      };
      const processos = [
        subirFilho(FILHO("q026-mvcc-cliente-filho.ts"), { ...comum, Q026_MVCC_CLIENTES: "0", Q026_MVCC_SONDAR: "1" }, "sondas"),
        ...Array.from({ length: CLIENTES }, (_, i) =>
          subirFilho(
            FILHO("q026-mvcc-cliente-filho.ts"),
            { ...comum, Q026_MVCC_CLIENTES: "1", Q026_MVCC_CLIENTE_BASE: String(i), Q026_MVCC_SONDAR: "0" },
            `cliente${i}`,
          ),
        ),
      ];
      filhos.push(...processos);
      const partes = (await Promise.all(processos.map((c) => c.esperar("clientes", DURACAO_S * 1000 + 180_000)))) as unknown as Array<typeof respostas>;
      respostas = { pedidos: partes.flatMap((x) => x.pedidos), sondas: partes[0]!.sondas };
    } else {
      await pausa(DURACAO_S * 1000);
    }
    const tFimCarga = Date.now();

    // VAZAMENTO: depois da carga, nenhuma sessão de leitura pode seguir em transação.
    await pausa(1500);
    const sessoes = await admin.query(
      `SELECT usename::text AS papel, state, xact_start IS NOT NULL AS em_tx, backend_xmin IS NOT NULL AS com_xmin
         FROM pg_stat_activity WHERE datname = $1 AND usename::text LIKE $2`,
      [banco.nome, `${prefixoPapel}%`],
    );
    const vazamentos = sessoes.filter((s) => s.em_tx || s.com_xmin);

    // PÓS: sem leitor; o horizonte tem de andar de novo.
    const tPos = Date.now();
    await pausa(POS_S * 1000);
    for (const s of servidores) s.filho.enviar({ tipo: "parar" });
    escritor.enviar({ tipo: "parar" });
    const fimEscritor = (await escritor.esperar("escritor_fim", 30_000)) as { updates: number; fatos: number; erros: number; duracao_ms: number };
    amostrador.enviar({ tipo: "parar" });
    const amostras = (await amostrador.esperar("amostras", 30_000)) as unknown as {
      transacoes: TxAmostrada[];
      vacuums: VacuumAmostrado[];
      pico_com_xmin: number;
      pico_workers_paralelos: number;
      amostras_com_workers_paralelos: number;
      pico_por_papel: Record<string, number>;
      pico_conexoes: Record<string, number>;
      amostras: number;
      periodo_p50_ms: number;
      periodo_max_ms: number;
    };
    // VACUUM final, sem nenhum leitor vivo: o que a carga prendeu tem de sair.
    const mortasFinais = await vacuumFinal(banco.url);

    // ---------------- resumo ----------------
    const nosPapeis = (tx: TxAmostrada) => papeis.includes(tx.papel);
    const naCarga = (tx: TxAmostrada) => tx.xact_ms >= tCarga - 50 && tx.xact_ms <= tFimCarga + 60_000;
    const txs = amostras.transacoes.filter((tx) => nosPapeis(tx) && tx.com_xmin && naCarga(tx));
    const durMin = txs.map((tx) => tx.visto_ultimo_ms - tx.xact_ms);
    const durMax = txs.map((tx) => (tx.sumiu_ms ?? tx.visto_ultimo_ms) - tx.xact_ms);
    const ociosoMax = txs.map((tx) => tx.maior_ocioso_ms);
    const ativoMax = txs.map((tx) => tx.maior_ativo_ms);
    // PRÉ: antes de qualquer servidor existir. Aquecimento e calibração ficam fora das fases medidas.
    const fase = (v: VacuumAmostrado) =>
      v.t < tServidores ? "pre" : v.t < tCarga ? "aquecimento" : v.t <= tFimCarga ? "carga" : v.t >= tPos + 1500 ? "pos" : "transicao";
    const vacs = (f: string) => amostras.vacuums.filter((v) => fase(v) === f);
    const xidsPorS = (fimEscritor.updates + fimEscritor.fatos) / (fimEscritor.duracao_ms / 1000);
    const vacResumo = (f: string) => {
      const vs = vacs(f);
      const mortas = vs.map((v) => v.mortas_nao_removiveis ?? NaN);
      const idade = vs.map((v) => v.idade_corte_xids ?? NaN);
      return {
        n: vs.length,
        mortas_nao_removiveis: resumir(mortas),
        idade_corte_xids: resumir(idade),
        atraso_horizonte_s_est: resumir(idade.map((x) => x / xidsPorS)),
        tamanho_inicio_bytes: vs[0]?.tamanho_bytes ?? null,
        tamanho_fim_bytes: vs[vs.length - 1]?.tamanho_bytes ?? null,
      };
    };
    const metricas = servidores.map((s, i) => {
      const ms = s.filho.mensagens.filter((m) => m.tipo === "metricas" && Number(m.t) >= tCarga && Number(m.t) <= tFimCarga + 500);
      const checkouts = ms.flatMap((m) => (m.checkouts as Array<{ pool: string; espera_ms: number; ok: boolean }>) ?? []);
      const leitura = checkouts.filter((c) => c.pool === "leitura");
      return {
        instancia: i + 1,
        laco_max_ms: Math.max(0, ...ms.map((m) => Number(m.laco_max_ms))),
        laco_p99_janela_max_ms: Math.max(0, ...ms.map((m) => Number(m.laco_p99_ms))),
        rss_pico_mib: Math.max(0, ...ms.map((m) => Number(m.maxrss_mib))),
        checkout_leitura_ms: resumir(leitura.map((c) => c.espera_ms)),
        checkout_leitura_falhas: leitura.filter((c) => !c.ok).length,
        checkout_cancelamento: checkouts.filter((c) => c.pool === "cancelamento").length,
        fila_leitura_max: Math.max(0, ...ms.map((m) => Number((m.filas as Record<string, { max_espera: number }>)?.leitura?.max_espera ?? 0))),
      };
    });
    const pedidos = respostas.pedidos as Array<{ ms: number; status: number; erro: string | null; disponivel: boolean | null }>;
    const ok = pedidos.filter((p) => p.status === 200 && p.disponivel === true);
    const contagem: Record<string, number> = {};
    for (const p of pedidos) {
      const k = p.status === 200 ? (p.disponivel === true ? "200_lida" : p.disponivel === false ? "200_indisponivel" : "200_sem_leitura") : `${p.status}_${p.erro ?? ""}`;
      contagem[k] = (contagem[k] ?? 0) + 1;
    }
    const sondasMs = Object.values(respostas.sondas).flatMap((s) => s.ms);
    const durMinOrd = [...durMin];
    const resultado = {
      cenario: { perfil: PERFIL, escala: ESCALA, fatos, leitor: LEITOR, instancias: INSTANCIAS, admissao_por_instancia: INFLIGHT, prazo_ms: PRAZO_MS, clientes: CLIENTES, pensar_ms: PENSAR_MS, duracao_s: DURACAO_S, updates_s: UPDATES_S, fatos_s: FATOS_S },
      ambiente: { postgres: versao, cpus: cpus().length, node: process.version },
      semeadura_ms,
      calibracao,
      escritor: { ...fimEscritor, xids_por_s: +xidsPorS.toFixed(1) },
      amostrador: { amostras: amostras.amostras, periodo_p50_ms: amostras.periodo_p50_ms, periodo_max_ms: amostras.periodo_max_ms },
      snapshot_ms_limite_inferior: resumir(durMinOrd),
      snapshot_ms_limite_superior: resumir(durMax),
      snapshot_p95_ic95: icBootstrap(durMin, 0.95),
      maior_ocioso_em_transacao_ms: resumir(ociosoMax),
      maior_comando_ativo_ms: resumir(ativoMax),
      transacoes_de_leitura: txs.length,
      pico_snapshots_simultaneos: amostras.pico_com_xmin,
      pico_workers_paralelos: amostras.pico_workers_paralelos,
      amostras_com_workers_paralelos: amostras.amostras_com_workers_paralelos,
      pico_snapshots_por_instancia: amostras.pico_por_papel,
      pico_conexoes_por_instancia: amostras.pico_conexoes,
      vacuum: { pre: vacResumo("pre"), carga: vacResumo("carga"), pos: vacResumo("pos") },
      mortas_nao_removiveis_no_vacuum_final: mortasFinais,
      vazamentos,
      servidores: metricas,
      http: {
        pedidos: pedidos.length,
        contagem,
        lida_ms: resumir(ok.map((p) => p.ms)),
        lida_ms_p95_ic95: icBootstrap(ok.map((p) => p.ms), 0.95),
        lidas_por_s: +(ok.length / DURACAO_S).toFixed(2),
      },
      health_ms: resumir(sondasMs),
      health_falhas: Object.values(respostas.sondas).reduce((n, s) => n + s.falhas, 0),
      duracao_total_s: Math.round((Date.now() - inicio) / 1000),
      _amostras_brutas: { transacoes: txs, vacuums: amostras.vacuums, pedidos, sondas: respostas.sondas, t_pre: tPre, t_servidores: tServidores, t_carga: tCarga, t_fim_carga: tFimCarga, t_pos: tPos },
    };
    if (SAIDA) writeFileSync(SAIDA, JSON.stringify(resultado));
    const r = resultado;
    console.log(`  calibração: ${calibracao.map((c) => `sonda ${c.sonda_ms} ms / laço ${c.laco_max_ms} ms`).join("; ") || "(sem servidor)"}`);
    console.log(`  escritor: ${r.escritor.updates} updates + ${r.escritor.fatos} fatos em ${r.escritor.duracao_ms} ms (${r.escritor.xids_por_s} XIDs/s), erros ${r.escritor.erros}`);
    console.log(`  snapshots de leitura (sessões líderes): ${txs.length} · duração (lim. inf.) p50 ${r.snapshot_ms_limite_inferior.p50} · p95 ${r.snapshot_ms_limite_inferior.p95} · máx ${r.snapshot_ms_limite_inferior.max} ms · pico simultâneo ${r.pico_snapshots_simultaneos} · workers paralelos: pico ${r.pico_workers_paralelos}, em ${r.amostras_com_workers_paralelos} amostras`);
    console.log(`  maior intervalo contínuo ocioso em transação (state_change): p50 ${r.maior_ocioso_em_transacao_ms.p50} · máx ${r.maior_ocioso_em_transacao_ms.max} ms · maior comando ativo: p50 ${r.maior_comando_ativo_ms.p50} · máx ${r.maior_comando_ativo_ms.max} ms`);
    for (const f of ["pre", "carga", "pos"] as const) {
      const v = r.vacuum[f];
      console.log(`  VACUUM ${f}: n=${v.n} · mortas não removíveis p50 ${v.mortas_nao_removiveis.p50} / p95 ${v.mortas_nao_removiveis.p95} / máx ${v.mortas_nao_removiveis.max} · idade do corte (XIDs) p50 ${v.idade_corte_xids.p50} / máx ${v.idade_corte_xids.max} · ≈${v.atraso_horizonte_s_est.max} s · tamanho ${v.tamanho_inicio_bytes}→${v.tamanho_fim_bytes}`);
    }
    console.log(`  VACUUM final sem leitor: ${mortasFinais} mortas não removíveis`);
    console.log(`  HTTP: ${JSON.stringify(contagem)} · lida p50 ${r.http.lida_ms.p50} / p95 ${r.http.lida_ms.p95} / máx ${r.http.lida_ms.max} ms · ${r.http.lidas_por_s} lidas/s`);
    console.log(`  /api/health: n=${r.health_ms.n} p50 ${r.health_ms.p50} / p95 ${r.health_ms.p95} / p99 ${r.health_ms.p99} / máx ${r.health_ms.max} ms · falhas ${r.health_falhas}`);
    for (const m of metricas) {
      console.log(`  instância ${m.instancia}: laço máx ${m.laco_max_ms} ms · RSS pico ${m.rss_pico_mib} MiB · checkout leitura p50 ${m.checkout_leitura_ms.p50} / máx ${m.checkout_leitura_ms.max} ms · falhas ${m.checkout_leitura_falhas} · fila máx ${m.fila_leitura_max} · cancelamentos ${m.checkout_cancelamento}`);
    }
    console.log(`  conexões por instância (pico): ${JSON.stringify(amostras.pico_conexoes)} · snapshots por instância (pico): ${JSON.stringify(amostras.pico_por_papel)}`);
    const falhas: string[] = [];
    if (vazamentos.length > 0) falhas.push(`VAZAMENTO: ${vazamentos.length} sessão(ões) de leitura em transação depois da carga`);
    if (mortasFinais === null || mortasFinais > 0) falhas.push(`VACUUM final ainda com ${String(mortasFinais)} mortas não removíveis sem leitor`);
    if (LEITOR !== "controle" && ok.length === 0) falhas.push("nenhuma leitura completa: a carga não mediu leitura nenhuma");
    console.log(`\nQ026_MVCC_RESULTADO ${JSON.stringify({ perfil: PERFIL, leitor: LEITOR, instancias: INSTANCIAS, admissao: INFLIGHT, prazo_ms: PRAZO_MS, snapshots: txs.length, snapshot_p50_ms: r.snapshot_ms_limite_inferior.p50, snapshot_max_ms: r.snapshot_ms_limite_inferior.max, mortas_carga_max: r.vacuum.carga.mortas_nao_removiveis.max, mortas_pre_max: r.vacuum.pre.mortas_nao_removiveis.max, health_p99_ms: r.health_ms.p99, http: contagem, vazamentos: vazamentos.length, valido: falhas.length === 0 })}`);
    if (falhas.length > 0) {
      for (const f of falhas) console.error(`  FALHA: ${f}`);
      codigo = 1;
    }
  } catch (e) {
    console.error(e);
    codigo = 1;
  } finally {
    for (const f of filhos) {
      if (f.proc.exitCode === null) f.proc.kill("SIGKILL");
    }
    await pausa(300);
    await banco.descartar().catch(() => undefined);
    // Todo papel com o prefixo DESTA execução, criado ou pela metade, sai junto.
    const sobras = await admin.query(`SELECT rolname::text AS r FROM pg_roles WHERE rolname LIKE $1`, [`${prefixoPapel}%`]).catch(() => []);
    for (const s of sobras) await admin.query(`DROP ROLE IF EXISTS ${String(s.r)}`).catch(() => undefined);
    await admin.close();
  }
  process.exit(codigo);
})();
