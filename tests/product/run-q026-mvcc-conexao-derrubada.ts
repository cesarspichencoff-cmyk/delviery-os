/**
 * Q-026 — o banco ENCERRA a sessão de uma transação em andamento: o processo
 * Node sobrevive? Somente teste. PostgreSQL descartável; nenhum dado.
 *
 * Por que existe: no CI do arnes de falhas (run 38114150701), um
 * `pg_terminate_backend` na sessão de uma leitura em andamento derrubou o
 * PROCESSO inteiro do servidor HTTP da candidata #77 ("socket hang up" e, depois,
 * conexão recusada). Este teste isola o mecanismo do servidor, do leitor e da
 * rota: usa só o adaptador `createPgClient().transaction()` do runtime.
 *
 * Mecanismo suspeito (pg 8.13.1 / pg-pool 3.14.0): durante o empréstimo, o
 * pg-pool tira o ouvinte de `error` da conexão; o `PgSqlClient.transaction` não
 * põe outro. Quando o servidor encerra a sessão, o `pg` emite `error` no
 * cliente — sem ouvinte, o Node lança e o processo morre.
 *
 * Três modos, cada um num processo filho próprio (porque o que se mede é se
 * ele morre):
 *  ativo           pg_terminate_backend com um comando em execução (pg_sleep);
 *  ocioso          pg_terminate_backend com a sessão `idle in transaction`
 *                  (o Node ocupado entre dois comandos — o caso do cursor);
 *  ocioso_timeout  o PRÓPRIO banco encerra a sessão por
 *                  `idle_in_transaction_session_timeout` (FATAL 25P03) — a
 *                  mitigação de banco que este estudo avaliava.
 *
 * Esperado de um runtime correto: a transação REJEITA (erro tratável), a
 * conexão morta sai do pool, a consulta seguinte funciona e o processo segue
 * vivo. Saída: `Q026_DERRUBADA_RESULTADO {…}`; código 1 se algum modo falhar.
 * Sem DELIVERYOS_PG_URL: sai 78 — nunca verde.
 */

import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

import { createPgClient } from "../../src/platform/persistence/sql-client";

const URL_BASE = (process.env.DELIVERYOS_PG_URL ?? "").trim();
const MODO_FILHO = process.env.Q026_DERRUBADA_FILHO ?? "";
const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Modo = "ativo" | "ocioso" | "ocioso_timeout";

/* ------------------------------ filho ------------------------------ */

async function filho(modo: Modo): Promise<void> {
  const cliente = await createPgClient({ url: URL_BASE, max: 1, statementTimeoutMs: 60_000 });
  let erro = "nenhum";
  try {
    await cliente.transaction(async (tx) => {
      await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      if (modo === "ocioso_timeout") await tx.query("SET LOCAL idle_in_transaction_session_timeout = '300ms'");
      const pid = Number((await tx.query("SELECT pg_backend_pid()::int AS pid"))[0]?.pid);
      process.send?.({ tipo: "pid", pid });
      if (modo === "ativo") {
        await tx.query("SELECT pg_sleep(20)");
      } else {
        // Sessão ociosa em transação: o Node não manda nada por 3 s.
        await pausa(3000);
        await tx.query("SELECT 1");
      }
    });
  } catch (e) {
    erro = String((e as { code?: string }).code ?? (e as Error).message).slice(0, 60);
  }
  // A conexão morta tem de ter saído do pool: a consulta seguinte abre outra.
  const seguinte = await cliente
    .query<{ ok: number }>("SELECT 1 AS ok")
    .then((r) => (r[0]?.ok === 1 ? "ok" : "vazia"))
    .catch((e: unknown) => `falhou:${String((e as Error).message).slice(0, 40)}`);
  await cliente.close().catch(() => undefined);
  console.log(`Q026_DERRUBADA_VIVO ${JSON.stringify({ modo, erro, seguinte })}`);
  process.exit(0);
}

/* ------------------------------- pai ------------------------------- */

interface Rodada {
  modo: Modo;
  rodada: number;
  ok: boolean;
  codigo: number | null;
  sinal: string | null;
  vivo: unknown;
  ms: number;
  stderr: string;
}

async function rodar(modo: Modo, rodada: number): Promise<Rodada> {
  const admin = await createPgClient({ url: URL_BASE, max: 1 });
  const t0 = performance.now();
  const p = spawn(process.execPath, [...process.execArgv, __filename], {
    env: { ...process.env, Q026_DERRUBADA_FILHO: modo },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let out = "";
  let err = "";
  p.stdout!.on("data", (b: Buffer) => (out += b.toString()));
  p.stderr!.on("data", (b: Buffer) => (err += b.toString()));
  const fim = new Promise<{ codigo: number | null; sinal: string | null }>((res) =>
    p.on("exit", (codigo, sinal) => res({ codigo, sinal })),
  );
  try {
    if (modo !== "ocioso_timeout") {
      const pid = await new Promise<number>((res, rej) => {
        const t = setTimeout(() => rej(new Error("Q026_DERRUBADA_SEM_PID")), 30_000);
        p.on("message", (m: { tipo?: string; pid?: number }) => {
          if (m.tipo === "pid") {
            clearTimeout(t);
            res(Number(m.pid));
          }
        });
      });
      // Espera a sessão chegar ao estado do modo antes de derrubá-la.
      const estado = modo === "ativo" ? "active" : "idle in transaction";
      const tEstado = performance.now();
      for (;;) {
        const r = await admin.query<{ state: string | null }>("SELECT state FROM pg_stat_activity WHERE pid = $1", [pid]);
        if (r[0]?.state === estado) break;
        if (performance.now() - tEstado > 10_000) throw new Error(`Q026_DERRUBADA_ESTADO_NAO_ALCANCADO ${estado}`);
        await pausa(10);
      }
      await admin.query("SELECT pg_terminate_backend($1::int)", [pid]);
    }
    const limite = new Promise<{ codigo: number | null; sinal: string | null }>((res) =>
      setTimeout(() => {
        p.kill("SIGKILL");
        res({ codigo: null, sinal: "TIMEOUT" });
      }, 30_000),
    );
    const { codigo, sinal } = await Promise.race([fim, limite]);
    const linha = out.split("\n").find((l) => l.startsWith("Q026_DERRUBADA_VIVO "));
    const vivo = linha ? (JSON.parse(linha.slice("Q026_DERRUBADA_VIVO ".length)) as { seguinte?: string }) : null;
    const ok = codigo === 0 && vivo !== null && vivo.seguinte === "ok";
    const resumoErr = err
      .split("\n")
      .filter((l) => /Error|error|terminat|FATAL|Emitted/.test(l))
      .slice(0, 4)
      .join(" | ")
      .slice(0, 400);
    return { modo, rodada, ok, codigo, sinal, vivo, ms: +(performance.now() - t0).toFixed(0), stderr: resumoErr };
  } finally {
    if (p.exitCode === null) p.kill("SIGKILL");
    await admin.close().catch(() => undefined);
  }
}

if (MODO_FILHO) {
  void filho(MODO_FILHO as Modo).catch((e) => {
    console.error(e);
    process.exit(2);
  });
} else {
  if (!URL_BASE) {
    console.error("PULADO: DELIVERYOS_PG_URL ausente. Nenhuma sessao foi derrubada — isto nao e verde.");
    process.exit(78);
  }
  const MODOS = (process.env.Q026_DERRUBADA_MODOS ?? "ativo,ocioso,ocioso_timeout").split(",") as Modo[];
  const REPETICOES = Number(process.env.Q026_DERRUBADA_REPETICOES ?? 3);
  void (async () => {
    console.log(`\nQ-026 SESSAO ENCERRADA PELO BANCO NO MEIO DA TRANSACAO · modos ${MODOS.join(",")} · ${REPETICOES} rodadas`);
    const rodadas: Rodada[] = [];
    for (let r = 1; r <= REPETICOES; r += 1) {
      for (const modo of MODOS) {
        const x = await rodar(modo, r);
        rodadas.push(x);
        console.log(
          `  ${x.ok ? "ok " : "XX "} ${modo}#${r} codigo=${String(x.codigo)} sinal=${String(x.sinal)} vivo=${JSON.stringify(x.vivo)} ${x.ms} ms${x.ok ? "" : ` · ${x.stderr}`}`,
        );
      }
    }
    const porModo: Record<string, { ok: number; total: number }> = {};
    for (const x of rodadas) {
      porModo[x.modo] = porModo[x.modo] ?? { ok: 0, total: 0 };
      porModo[x.modo]!.total += 1;
      if (x.ok) porModo[x.modo]!.ok += 1;
    }
    const falhas = rodadas.filter((x) => !x.ok).length;
    console.log(`\nQ026_DERRUBADA_RESULTADO ${JSON.stringify({ modos: porModo, falhas })}`);
    process.exit(falhas > 0 ? 1 : 0);
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
