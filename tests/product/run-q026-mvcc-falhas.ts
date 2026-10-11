/**
 * Q-026 — FALHAS no meio da leitura, pelo servidor REAL: a conexão e o
 * instante MVCC são devolvidos? E a leitura seguinte funciona?
 * Somente teste. PostgreSQL DESCARTÁVEL, dados sintéticos.
 *
 * Instâncias do servidor real (`tools/product_system_server.ts`, flags opt-in
 * da candidata #77) em processos próprios, cada uma com seu papel SELECT-only.
 * Cada caso roda R vezes; depois de cada falha, a instância tem de servir uma
 * leitura completa (200, `disponivel: true`) e o PostgreSQL tem de mostrar a
 * sessão sem transação e sem `backend_xmin`.
 *
 *  E1 cliente desconecta no meio do cursor;
 *  E2 prazo HTTP vence (instância com prazo de 1 s, leitura mais longa que isso);
 *  E3 erro SQL no meio do cursor (pg_cancel_backend repetido até acertar um comando ativo: 57014);
 *  E4 conexão derrubada no meio do cursor (pg_terminate_backend: 57P01);
 *  E7 o event loop da instância fica ocupado no meio da leitura (bloqueio
 *     sintético de 8 s numa instância com prazo de 5 s). PERGUNTA: o prazo
 *     limita o instante MVCC quando o laço não roda? Com
 *     `Q026_FALHAS_MITIGACAO=sim`, o papel de leitura ganha
 *     `idle_in_transaction_session_timeout` — a menor intervenção candidata,
 *     só de configuração do banco.
 *
 * Saída: `Q026_FALHAS_RESULTADO {…}`. Código 1 se qualquer verificação falhar.
 * Sem DELIVERYOS_PG_URL: sai 78 — nunca verde.
 */

import http from "node:http";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient, type SqlRow } from "../../src/platform/persistence/sql-client";
import { criarPapeisDeLeitura, pausa, semearPerfil, subirFilho, tamanhoDo, urlComUsuario, type Filho } from "./q026-mvcc-comum";

const URL_BASE = (process.env.DELIVERYOS_PG_URL ?? "").trim();
if (!URL_BASE) {
  console.error("PULADO: DELIVERYOS_PG_URL ausente. Nenhum caso de falha rodou — isto nao e verde.");
  process.exit(78);
}
const LEITOR = (process.env.Q026_FALHAS_LEITOR ?? "incremental") as "canonico" | "incremental";
const ESCALA = Number(process.env.Q026_FALHAS_ESCALA ?? 1);
const REPETICOES = Number(process.env.Q026_FALHAS_REPETICOES ?? 3);
const MITIGACAO = process.env.Q026_FALHAS_MITIGACAO === "sim";
const OCIOSO_MAX_MS = Number(process.env.Q026_FALHAS_OCIOSO_MS ?? 1500);
const CASOS = (process.env.Q026_FALHAS_CASOS ?? "E1,E2,E3,E4,E7").split(",");
const SAIDA = (process.env.Q026_FALHAS_SAIDA ?? "").trim();
const FILHO = join(resolve(__dirname), "q026-mvcc-servidor-filho.ts");

interface Resposta {
  status: number;
  ms: number;
  erro: string | null;
  disponivel: boolean | null;
}

function pedir(porta: number, aoCriar?: (req: http.ClientRequest) => void): Promise<Resposta> {
  const t0 = performance.now();
  return new Promise((res) => {
    const req = http.request({ host: "127.0.0.1", port: porta, path: "/api/entregas", method: "GET", timeout: 60_000 }, (r) => {
      const partes: Buffer[] = [];
      r.on("data", (b: Buffer) => partes.push(b));
      r.on("end", () => {
        let erro: string | null = null;
        let disponivel: boolean | null = null;
        try {
          const j = JSON.parse(Buffer.concat(partes).toString("utf8")) as { erro?: string; leitura?: { disponivel?: boolean } };
          erro = j.erro ?? null;
          disponivel = typeof j.leitura?.disponivel === "boolean" ? j.leitura.disponivel : null;
        } catch {
          erro = "json_invalido";
        }
        res({ status: r.statusCode ?? 0, ms: +(performance.now() - t0).toFixed(1), erro, disponivel });
      });
      r.on("error", () => res({ status: -1, ms: +(performance.now() - t0).toFixed(1), erro: "resposta_interrompida", disponivel: null }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => res({ status: 0, ms: +(performance.now() - t0).toFixed(1), erro: String(e.message).slice(0, 40), disponivel: null }));
    aoCriar?.(req);
    req.end();
  });
}

void (async () => {
  const banco = await bancoIsolado(URL_BASE, undefined, "q026falhas");
  const admin = await createPgClient({ url: URL_BASE, max: 1 });
  const obs = await createPgClient({ url: URL_BASE, max: 2 });
  const prefixo = `q026falhas_${process.pid}_${Math.random().toString(36).slice(2, 6)}`;
  const filhos: Filho[] = [];
  const verificacoes: Array<{ caso: string; rodada: number; ok: boolean; detalhe: Record<string, unknown> }> = [];
  let codigo = 0;
  try {
    const fatos = await semearPerfil(banco.cliente, tamanhoDo("longa", ESCALA));
    await banco.cliente.query("VACUUM (ANALYZE) platform.event_log");
    const [papelA, papelB, papelC] = await criarPapeisDeLeitura(admin, banco.cliente, banco.nome, 3, prefixo);
    if (MITIGACAO) {
      // A menor intervenção candidata: fronteira do lado do BANCO, por papel. Vale
      // para sessões novas — por isso antes de a instância abrir conexões.
      await admin.query(`ALTER ROLE ${papelC!} SET idle_in_transaction_session_timeout = '${OCIOSO_MAX_MS}ms'`);
    }
    const observar = async (papel: string) =>
      obs.query<SqlRow>(
        `SELECT pid, state, backend_xmin IS NOT NULL AS com_xmin,
                (extract(epoch from (clock_timestamp() - xact_start)) * 1000)::float8 AS idade_tx_ms,
                (extract(epoch from (clock_timestamp() - state_change)) * 1000)::float8 AS no_estado_ms,
                (extract(epoch from xact_start) * 1000)::float8 AS xact_ms
           FROM pg_stat_activity WHERE datname = $1 AND usename::text = $2`,
        [banco.nome, papel],
      );
    const esperarLeituraNoMeio = async (papel: string, idadeMinMs: number, limiteMs = 15_000, estado?: string) => {
      const t0 = performance.now();
      for (;;) {
        const s = (await observar(papel)).find(
          (r) => r.com_xmin && Number(r.idade_tx_ms) >= idadeMinMs && (estado === undefined || r.state === estado),
        );
        if (s) return { pid: Number(s.pid), xact_ms: Number(s.xact_ms) };
        if (performance.now() - t0 > limiteMs) throw new Error(`Q026_FALHAS_LEITURA_NAO_APARECEU ${papel}`);
        await pausa(5);
      }
    };
    /** Espera a sessão do papel ficar sem transação e sem xmin; devolve ms e o fim (relógio do servidor). */
    const esperarLiberacao = async (papel: string, limiteMs = 20_000) => {
      const t0 = performance.now();
      for (;;) {
        const s = await observar(papel);
        if (s.every((r) => r.idade_tx_ms === null && !r.com_xmin)) {
          return { ms: +(performance.now() - t0).toFixed(1), fim_ms: Date.now(), conexoes: s.length };
        }
        if (performance.now() - t0 > limiteMs) return { ms: -1, fim_ms: Date.now(), conexoes: s.length };
        await pausa(10);
      }
    };
    const subir = async (papel: string, prazo: number, admissao: number, rotulo: string) => {
      const f = subirFilho(
        FILHO,
        {
          DELIVERYOS_DATABASE_URL: urlComUsuario(banco.url, papel),
          DELIVERYOS_ENTREGAS_MAX_INFLIGHT: String(admissao),
          DELIVERYOS_ENTREGAS_RR_DEADLINE_MS: String(prazo),
          DELIVERYOS_ENTREGAS_INCREMENTAL_RR: LEITOR === "incremental" ? "1" : "",
          DELIVERYOS_PG_URL: "",
        },
        rotulo,
      );
      filhos.push(f);
      const p = await f.esperar("pronto", 90_000);
      return { filho: f, porta: Number(p.porta) };
    };
    const registrar = (caso: string, rodada: number, ok: boolean, detalhe: Record<string, unknown>) => {
      verificacoes.push({ caso, rodada, ok, detalhe });
      console.log(`  ${ok ? "ok " : "XX "} ${caso}#${rodada} ${JSON.stringify(detalhe)}`);
    };

    console.log(`\nQ-026 FALHAS NO MEIO DA LEITURA · ${LEITOR} · ${fatos} fatos · ${REPETICOES} rodadas · mitigação ${MITIGACAO ? `idle_in_transaction_session_timeout=${OCIOSO_MAX_MS}ms (papel C)` : "nenhuma"}`);
    const A = await subir(papelA!, 15_000, 2, "instanciaA");
    const B = await subir(papelB!, 1_000, 1, "instanciaB");
    const C = await subir(papelC!, 5_000, 1, "instanciaC");
    const base = await pedir(A.porta);
    const tempoBase = base.ms;
    console.log(`  leitura de referência na instância A: HTTP ${base.status} em ${base.ms} ms`);
    if (base.status !== 200 || base.disponivel !== true) throw new Error("Q026_FALHAS_REFERENCIA_FALHOU");

    const depois = async (caso: string, rodada: number, porta: number, papel: string, detalhe: Record<string, unknown>) => {
      const lib = await esperarLiberacao(papel);
      const prox = await pedir(porta);
      const ok = lib.ms >= 0 && prox.status === 200 && prox.disponivel === true && lib.conexoes <= 3;
      registrar(caso, rodada, ok, { ...detalhe, liberou_em_ms: lib.ms, conexoes_do_papel: lib.conexoes, leitura_seguinte: `${prox.status}/${String(prox.disponivel)}` });
    };

    for (let r = 1; r <= REPETICOES; r += 1) {
      if (CASOS.includes("E1")) {
        let req: http.ClientRequest | null = null;
        const p = pedir(A.porta, (x) => (req = x));
        const meio = await esperarLeituraNoMeio(papelA!, Math.min(400, tempoBase / 3));
        const t0 = performance.now();
        (req as unknown as http.ClientRequest).destroy();
        const lib = await esperarLiberacao(papelA!);
        await p;
        const prox = await pedir(A.porta);
        const ok = lib.ms >= 0 && lib.ms <= 3000 && prox.status === 200 && prox.disponivel === true && lib.conexoes <= 3;
        registrar("E1_desconexao", r, ok, { pid: meio.pid, desconexao_ate_liberar_ms: +(performance.now() - t0).toFixed(1), conexoes_do_papel: lib.conexoes, leitura_seguinte: `${prox.status}/${String(prox.disponivel)}` });
      }
      if (CASOS.includes("E2")) {
        const resp = await pedir(B.porta);
        const lib = await esperarLiberacao(papelB!);
        const ok = resp.status === 503 && resp.erro === "prazo_total_excedido" && lib.ms >= 0 && lib.ms <= 3000;
        // Admissão devolvida: o pedido seguinte é PROCESSADO (prazo de novo), não recusado como ocupado.
        const prox = await pedir(B.porta);
        const okProx = prox.status === 503 && prox.erro === "prazo_total_excedido";
        await esperarLiberacao(papelB!);
        registrar("E2_prazo", r, ok && okProx, { resposta: `${resp.status}/${resp.erro}`, resposta_ms: resp.ms, liberou_depois_da_resposta_ms: lib.ms, pedido_seguinte: `${prox.status}/${prox.erro}` });
      }
      if (CASOS.includes("E3")) {
        // Um FETCH de 257 linhas fica ativo por frações de milissegundo; um
        // cancelamento que chega com a sessão ociosa é ignorado pelo servidor.
        // Por isso o cancelamento é repetido enquanto a transação existir: o
        // primeiro que pegar um comando ativo vira 57014 no meio do cursor.
        const p = pedir(A.porta);
        const meio = await esperarLeituraNoMeio(papelA!, Math.min(300, tempoBase / 4));
        let tentativas = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < 10_000) {
          const s = (await observar(papelA!)).find((x) => Number(x.pid) === meio.pid);
          if (!s || s.idade_tx_ms === null) break;
          tentativas += 1;
          await obs.query("SELECT pg_cancel_backend($1::int)", [meio.pid]);
        }
        const resp = await p;
        const injetou = resp.status === 200 && resp.disponivel === false;
        await depois("E3_cancelamento_sql", r, A.porta, papelA!, { pid: meio.pid, tentativas, erro_injetado: injetou, resposta: `${resp.status}/${String(resp.disponivel)}/${String(resp.erro)}` });
        if (!injetou) verificacoes[verificacoes.length - 1]!.ok = false;
      }
      if (CASOS.includes("E4")) {
        const p = pedir(A.porta);
        const meio = await esperarLeituraNoMeio(papelA!, Math.min(300, tempoBase / 4));
        await obs.query("SELECT pg_terminate_backend($1::int)", [meio.pid]);
        const resp = await p;
        const novo = await pedir(A.porta);
        const pids = (await observar(papelA!)).map((x) => Number(x.pid));
        await depois("E4_conexao_derrubada", r, A.porta, papelA!, { pid_derrubado: meio.pid, resposta: `${resp.status}/${String(resp.disponivel)}/${String(resp.erro)}`, leitura_depois: `${novo.status}/${String(novo.disponivel)}`, pid_derrubado_ainda_no_pool: pids.includes(meio.pid) });
      }
      if (CASOS.includes("E7")) {
        // O prazo de C é 5 s; a leitura sozinha cabe nele. No meio dela, o laço
        // da instância fica ocupado 8 s (sintético — o que outro pedido, GC ou
        // CPU estrangulada fariam). O instante MVCC fica preso enquanto isso?
        const PRAZO_C = 5000;
        const BLOQUEIO = 8000;
        const p = pedir(C.porta);
        // Mira a janela vulnerável: a sessão esperando o Node (`idle in
        // transaction`). Com um comando ATIVO, o statement_timeout local ainda
        // corta do lado do banco; ocioso, nada corta.
        const meio = await esperarLeituraNoMeio(papelC!, 250, 15_000, "idle in transaction");
        C.filho.enviar({ tipo: "bloquear", ms: BLOQUEIO });
        let maiorIdadeComXmin = 0;
        let maiorOcioso = 0;
        const estados = new Set<string>();
        const t0 = performance.now();
        while (performance.now() - t0 < 20_000) {
          const s = (await observar(papelC!)).find((x) => Number(x.pid) === meio.pid);
          if (!s || s.idade_tx_ms === null) break;
          estados.add(String(s.state));
          if (s.com_xmin) maiorIdadeComXmin = Math.max(maiorIdadeComXmin, Number(s.idade_tx_ms));
          if (s.state === "idle in transaction") maiorOcioso = Math.max(maiorOcioso, Number(s.no_estado_ms));
          await pausa(20);
        }
        const lib = await esperarLiberacao(papelC!);
        const resp = await p;
        const instante = lib.fim_ms - meio.xact_ms;
        const limite = PRAZO_C + 1000;
        // A instância se recupera? (a conexão morta, se houve, sai do pool)
        const prox = await pedir(C.porta);
        await esperarLiberacao(papelC!);
        registrar("E7_laco_ocupado", r, instante <= limite && prox.status === 200 && prox.disponivel === true, {
          prazo_ms: PRAZO_C,
          bloqueio_ms: BLOQUEIO,
          instante_mvcc_ms: Math.round(instante),
          limite_ms: limite,
          maior_idade_com_xmin_ms: Math.round(maiorIdadeComXmin),
          maior_ocioso_continuo_ms: Math.round(maiorOcioso),
          estados: [...estados],
          resposta: `${resp.status}/${String(resp.erro ?? resp.disponivel)}`,
          resposta_ms: resp.ms,
          leitura_seguinte: `${prox.status}/${String(prox.erro ?? prox.disponivel)}`,
        });
      }
    }
    const falhas = verificacoes.filter((v) => !v.ok);
    const porCaso: Record<string, { ok: number; total: number }> = {};
    for (const v of verificacoes) {
      const k = v.caso;
      porCaso[k] = porCaso[k] ?? { ok: 0, total: 0 };
      porCaso[k]!.total += 1;
      if (v.ok) porCaso[k]!.ok += 1;
    }
    if (SAIDA) writeFileSync(SAIDA, JSON.stringify({ leitor: LEITOR, fatos, mitigacao: MITIGACAO, verificacoes }, null, 2));
    console.log(`\nQ026_FALHAS_RESULTADO ${JSON.stringify({ leitor: LEITOR, mitigacao: MITIGACAO ? `idle_in_transaction_session_timeout=${OCIOSO_MAX_MS}ms` : null, casos: porCaso, falhas: falhas.length })}`);
    if (falhas.length > 0) codigo = 1;
  } catch (e) {
    console.error(e);
    codigo = 1;
  } finally {
    for (const f of filhos) if (f.proc.exitCode === null) f.proc.kill("SIGKILL");
    await pausa(300);
    await obs.close().catch(() => undefined);
    await banco.descartar().catch(() => undefined);
    const sobras = await admin.query(`SELECT rolname::text AS r FROM pg_roles WHERE rolname LIKE $1`, [`${prefixo}%`]).catch(() => []);
    for (const s of sobras) await admin.query(`DROP ROLE IF EXISTS ${String(s.r)}`).catch(() => undefined);
    await admin.close();
  }
  process.exit(codigo);
})();
