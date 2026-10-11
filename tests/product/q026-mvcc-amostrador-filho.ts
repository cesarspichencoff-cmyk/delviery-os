/**
 * Q-026 — o AMOSTRADOR do banco: o que o PostgreSQL vê, sem perguntar à aplicação.
 * Somente teste, banco descartável.
 *
 * Duas conexões próprias (superusuário do banco DESCARTÁVEL, nunca o operacional):
 *  1. a cada ~20 ms, `pg_stat_activity` das sessões dos papéis de leitura:
 *     cada transação é identificada por (pid, xact_start); a duração é medida
 *     pelo relógio do próprio servidor (`clock_timestamp()`), com resolução
 *     igual ao período de amostragem — o limite inferior (última vez vista) e o
 *     superior (primeira amostra sem ela) vão os dois para o JSON;
 *  2. a cada ~1 s, `VACUUM (VERBOSE) q026_churn`, lendo do próprio VACUUM
 *     quantas versões mortas ele NÃO pôde remover e a idade, em XIDs, do
 *     horizonte de remoção ("removable cutoff ... XIDs old").
 *
 * Nada aqui é estimado a partir da aplicação: é o servidor dizendo.
 */

import { performance } from "node:perf_hooks";

const URL = (process.env.Q026_MVCC_URL ?? "").trim();
const PREFIXO = (process.env.Q026_MVCC_PAPEL_PREFIXO ?? "").trim();
const PERIODO_MS = Number(process.env.Q026_MVCC_PERIODO_MS ?? 20);
const VACUUM_MS = Number(process.env.Q026_MVCC_VACUUM_MS ?? 1000);
if (!URL || !PREFIXO) {
  console.error("Q026_MVCC_AMOSTRADOR_ARGUMENTOS_INVALIDOS");
  process.exit(2);
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Client } = require("pg") as { Client: new (c: Record<string, unknown>) => PgClient };
interface PgClient {
  connect(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  on(ev: "notice", fn: (m: { message?: string }) => void): void;
  end(): Promise<void>;
}

interface Transacao {
  pid: number;
  papel: string;
  xact_ms: number;
  visto_primeiro_ms: number;
  visto_ultimo_ms: number;
  /** Primeira amostra em que já não aparecia (limite superior da duração). */
  sumiu_ms: number | null;
  com_xmin: boolean;
  maior_idade_xmin: number;
  estados: string[];
  /**
   * Maior intervalo CONTÍNUO em `idle in transaction` visto: agora − state_change
   * (o servidor marca quando o estado mudou). É limite inferior do intervalo
   * real (a amostra pode chegar antes do fim dele), nunca uma soma de amostras.
   */
  maior_ocioso_ms: number;
  /** Maior tempo de um mesmo comando em `active` (agora − state_change). */
  maior_ativo_ms: number;
  esperas: string[];
}

interface Vacuum {
  t: number;
  removidas: number | null;
  restantes: number | null;
  mortas_nao_removiveis: number | null;
  corte_xid: number | null;
  idade_corte_xids: number | null;
  tamanho_bytes: number | null;
  ms: number;
}

const enviar = (m: Record<string, unknown>) => process.send?.(m);

void (async () => {
  const amostrador = new Client({ connectionString: URL, application_name: "q026-amostrador" });
  const vacuo = new Client({ connectionString: URL, application_name: "q026-vacuum" });
  await amostrador.connect();
  await vacuo.connect();
  let avisos: string[] = [];
  vacuo.on("notice", (m) => {
    if (m.message) avisos.push(m.message);
  });

  let parar = false;
  process.on("message", (m: { tipo?: string }) => {
    if (m.tipo === "parar") parar = true;
  });

  const abertas = new Map<string, Transacao>();
  const fechadas: Transacao[] = [];
  const vacuums: Vacuum[] = [];
  const intervalos: number[] = [];
  const concorrencia: Array<{ t: number; com_xmin: number; por_papel: Record<string, number>; conexoes: Record<string, number> }> = [];
  let picoComXmin = 0;
  let picoParalelos = 0;
  let amostrasComParalelos = 0;
  const picoPorPapel: Record<string, number> = {};
  const picoConexoes: Record<string, number> = {};

  const amostrar = async () => {
    let anterior = performance.now();
    while (!parar) {
      const r = await amostrador.query(
        `SELECT pid, usename::text AS papel, backend_type, state, wait_event_type, wait_event,
                age(backend_xmin)::int AS idade_xmin,
                (extract(epoch from xact_start) * 1000)::float8 AS xact_ms,
                (extract(epoch from state_change) * 1000)::float8 AS mudou_ms,
                (extract(epoch from clock_timestamp()) * 1000)::float8 AS agora_ms
           FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid() AND usename::text LIKE $1`,
        [`${PREFIXO}%`],
      );
      const agora = performance.now();
      intervalos.push(agora - anterior);
      anterior = agora;
      const vistas = new Set<string>();
      let agoraMs = Date.now();
      const porPapel: Record<string, number> = {};
      const conexoes: Record<string, number> = {};
      let comXmin = 0;
      let paralelos = 0;
      for (const row of r.rows) {
        agoraMs = Number(row.agora_ms);
        const papel = String(row.papel);
        // Workers de consulta paralela aparecem com o MESMO usuário e o MESMO
        // xact_start do líder e com xmin próprio (importado do líder). Não são
        // conexões nem transações à parte: contam só como paralelismo.
        if (row.backend_type !== "client backend") {
          if (row.backend_type === "parallel worker") paralelos += 1;
          continue;
        }
        conexoes[papel] = (conexoes[papel] ?? 0) + 1;
        if (row.xact_ms === null || row.xact_ms === undefined) continue;
        const xact = Number(row.xact_ms);
        const chave = `${String(row.pid)}:${xact}`;
        vistas.add(chave);
        const temXmin = row.idade_xmin !== null && row.idade_xmin !== undefined;
        if (temXmin) {
          comXmin += 1;
          porPapel[papel] = (porPapel[papel] ?? 0) + 1;
        }
        let tx = abertas.get(chave);
        if (!tx) {
          tx = {
            pid: Number(row.pid),
            papel,
            xact_ms: xact,
            visto_primeiro_ms: agoraMs,
            visto_ultimo_ms: agoraMs,
            sumiu_ms: null,
            com_xmin: false,
            maior_idade_xmin: 0,
            estados: [],
            maior_ocioso_ms: 0,
            maior_ativo_ms: 0,
            esperas: [],
          };
          abertas.set(chave, tx);
        }
        tx.visto_ultimo_ms = agoraMs;
        if (temXmin) {
          tx.com_xmin = true;
          tx.maior_idade_xmin = Math.max(tx.maior_idade_xmin, Number(row.idade_xmin));
        }
        const estado = String(row.state);
        if (!tx.estados.includes(estado)) tx.estados.push(estado);
        if (row.wait_event) {
          const w = `${String(row.wait_event_type)}:${String(row.wait_event)}`;
          if (!tx.esperas.includes(w) && tx.esperas.length < 8) tx.esperas.push(w);
        }
        const desde = Number(row.mudou_ms);
        if (Number.isFinite(desde)) {
          if (estado === "idle in transaction") tx.maior_ocioso_ms = Math.max(tx.maior_ocioso_ms, agoraMs - desde);
          if (estado === "active") tx.maior_ativo_ms = Math.max(tx.maior_ativo_ms, agoraMs - desde);
        }
      }
      for (const [chave, tx] of abertas) {
        if (vistas.has(chave)) continue;
        tx.sumiu_ms = agoraMs;
        fechadas.push(tx);
        abertas.delete(chave);
      }
      picoComXmin = Math.max(picoComXmin, comXmin);
      picoParalelos = Math.max(picoParalelos, paralelos);
      if (paralelos > 0) amostrasComParalelos += 1;
      for (const [p, n] of Object.entries(porPapel)) picoPorPapel[p] = Math.max(picoPorPapel[p] ?? 0, n);
      for (const [p, n] of Object.entries(conexoes)) picoConexoes[p] = Math.max(picoConexoes[p] ?? 0, n);
      if (concorrencia.length < 20_000) concorrencia.push({ t: agoraMs, com_xmin: comXmin, por_papel: porPapel, conexoes });
      const resto = PERIODO_MS - (performance.now() - agora);
      if (resto > 0) await new Promise<void>((res) => setTimeout(res, resto));
    }
  };

  const vacuo_ = async () => {
    while (!parar) {
      const t0 = performance.now();
      avisos = [];
      await vacuo.query("VACUUM (VERBOSE) public.q026_churn");
      const texto = avisos.join("\n");
      const tup = /tuples: (\d+) removed, (\d+) remain, (\d+) are dead but not yet removable/.exec(texto);
      const corte = /removable cutoff: (\d+), which was (\d+) XIDs old/.exec(texto);
      const tam = await vacuo.query("SELECT pg_relation_size('public.q026_churn')::bigint AS b");
      vacuums.push({
        t: Date.now(),
        removidas: tup ? Number(tup[1]) : null,
        restantes: tup ? Number(tup[2]) : null,
        mortas_nao_removiveis: tup ? Number(tup[3]) : null,
        corte_xid: corte ? Number(corte[1]) : null,
        idade_corte_xids: corte ? Number(corte[2]) : null,
        tamanho_bytes: Number(tam.rows[0]?.b ?? NaN),
        ms: +(performance.now() - t0).toFixed(1),
      });
      const resto = VACUUM_MS - (performance.now() - t0);
      if (resto > 0) await new Promise<void>((res) => setTimeout(res, resto));
    }
  };

  enviar({ tipo: "pronto" });
  await Promise.all([amostrar(), vacuo_()]);
  for (const tx of abertas.values()) fechadas.push(tx);
  const ordenados = [...intervalos].sort((a, b) => a - b);
  enviar({
    tipo: "amostras",
    transacoes: fechadas,
    vacuums,
    concorrencia,
    pico_com_xmin: picoComXmin,
    pico_workers_paralelos: picoParalelos,
    amostras_com_workers_paralelos: amostrasComParalelos,
    pico_por_papel: picoPorPapel,
    pico_conexoes: picoConexoes,
    amostras: intervalos.length,
    periodo_p50_ms: +(ordenados[Math.floor(ordenados.length / 2)] ?? 0).toFixed(1),
    periodo_max_ms: +(ordenados[ordenados.length - 1] ?? 0).toFixed(1),
  });
  await amostrador.end();
  await vacuo.end();
  setTimeout(() => process.exit(0), 200);
})().catch((e) => {
  console.error("Q026_MVCC_AMOSTRADOR_FALHOU", e);
  process.exit(1);
});
