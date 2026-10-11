/**
 * Q-026 — uma INSTÂNCIA do servidor real (`tools/product_system_server.ts`),
 * num processo Node próprio, com instrumentação de TESTE ao redor dele.
 * Somente teste: o servidor não é editado; a instrumentação vive aqui.
 *
 * O que este processo mede, por janela de 250 ms, e envia por IPC:
 *  - atraso do event loop, com medidor AQUECIDO e calibrável (PR #71: um
 *    medidor ingênuo não enxergava o último bloqueio síncrono);
 *  - espera de checkout de cada pool `pg` (leitura: max 2; cancelamento:
 *    max 1), fila (`waitingCount`) e falhas de checkout — medidas embrulhando
 *    `Pool.prototype.connect` ANTES de o servidor criar os pools;
 *  - RSS atual e pico (`maxRSS`).
 *
 * Comandos por IPC: `{tipo:"bloquear", ms}` ocupa o laço de propósito (controle
 * positivo do medidor e prova do efeito de um bloqueio sobre transações em
 * voo); `{tipo:"parar"}` fecha o servidor.
 */

import http from "node:http";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";

type PoolPg = { options?: { max?: number }; waitingCount?: number; totalCount?: number; idleCount?: number };

const RESOLUCAO_MS = 10;
const JANELA_MS = 250;

interface Checkout {
  pool: string;
  espera_ms: number;
  ok: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pg = require("pg") as { Pool: { prototype: Record<string, unknown> } };
const proto = pg.Pool.prototype as { connect: (...a: unknown[]) => unknown };
const connectOriginal = proto.connect;
const pools = new Set<PoolPg>();
let checkouts: Checkout[] = [];
const rotulo = (p: PoolPg) => (p.options?.max === 1 ? "cancelamento" : p.options?.max === 2 ? "leitura" : `max${String(p.options?.max)}`);

proto.connect = function (this: PoolPg, ...args: unknown[]) {
  pools.add(this);
  const t0 = performance.now();
  const anotar = (ok: boolean) => checkouts.push({ pool: rotulo(this), espera_ms: +(performance.now() - t0).toFixed(2), ok });
  const cb = args[0];
  if (typeof cb === "function") {
    return connectOriginal.call(this, (err: unknown, client: unknown, done: unknown) => {
      anotar(!err);
      (cb as (...x: unknown[]) => void)(err, client, done);
    });
  }
  return (connectOriginal.call(this) as Promise<unknown>).then(
    (c) => {
      anotar(true);
      return c;
    },
    (e) => {
      anotar(false);
      throw e;
    },
  );
};

const enviar = (m: Record<string, unknown>) => {
  if (process.send) process.send(m);
};

void (async () => {
  // Medidor do laço por BATIMENTO próprio: a cada ~10 ms, o intervalo desde o
  // batimento anterior. O intervalo de um bloqueio é anotado no primeiro
  // batimento DEPOIS dele e nunca é zerado antes disso — ao contrário de
  // `monitorEventLoopDelay().reset()`, que zera a referência e, se o relatório
  // da janela rodar antes do temporizador do histograma, apaga o bloqueio
  // (visto na calibração: 250 ms medidos como 11 ms). O histograma nativo fica
  // como conferência cumulativa, nunca zerado.
  const laco = monitorEventLoopDelay({ resolution: RESOLUCAO_MS });
  laco.enable();
  let ultimoBatimento = performance.now();
  let intervalos: number[] = [];
  setInterval(() => {
    const agora = performance.now();
    intervalos.push(agora - ultimoBatimento);
    ultimoBatimento = agora;
  }, RESOLUCAO_MS).unref();
  // Aquecer: o primeiro intervalo é descartado pela própria janela.
  await new Promise<void>((r) => setTimeout(r, 5 * RESOLUCAO_MS));

  const filas = new Map<string, { max_espera: number; max_total: number }>();
  const amostrarPools = () => {
    for (const p of pools) {
      const k = rotulo(p);
      const f = filas.get(k) ?? { max_espera: 0, max_total: 0 };
      f.max_espera = Math.max(f.max_espera, p.waitingCount ?? 0);
      f.max_total = Math.max(f.max_total, p.totalCount ?? 0);
      filas.set(k, f);
    }
  };
  setInterval(amostrarPools, 20).unref();

  setInterval(() => {
    const mem = process.memoryUsage();
    const ordenados = [...intervalos].sort((a, b) => a - b);
    enviar({
      tipo: "metricas",
      t: Date.now(),
      laco_max_ms: +(ordenados[ordenados.length - 1] ?? 0).toFixed(2),
      laco_p99_ms: +(ordenados[Math.floor(0.99 * (ordenados.length - 1))] ?? 0).toFixed(2),
      laco_amostras: ordenados.length,
      eld_cumulativo_max_ms: +(laco.max / 1e6).toFixed(2),
      rss_mib: +(mem.rss / 1048576).toFixed(1),
      maxrss_mib: +(process.resourceUsage().maxRSS / 1024).toFixed(1),
      filas: Object.fromEntries(filas),
      checkouts,
    });
    intervalos = [];
    filas.clear();
    checkouts = [];
  }, JANELA_MS).unref();

  const { criarServidor } = await import("../../tools/product_system_server");
  const servidor: http.Server = await criarServidor();
  await new Promise<void>((resolve, reject) => {
    servidor.once("error", reject);
    servidor.listen(0, "127.0.0.1", resolve);
  });
  const end = servidor.address();
  if (!end || typeof end === "string") throw new Error("Q026_MVCC_SERVIDOR_SEM_PORTA");

  process.on("message", (m: { tipo?: string; ms?: number }) => {
    if (m.tipo === "bloquear" && typeof m.ms === "number") {
      const fim = performance.now() + m.ms;
      while (performance.now() < fim) {
        // ocupa o laço de propósito
      }
      enviar({ tipo: "bloqueado", ms: m.ms, t: Date.now() });
    }
    if (m.tipo === "parar") {
      servidor.close();
      servidor.closeAllConnections?.();
      setTimeout(() => process.exit(0), 300).unref();
    }
  });
  enviar({ tipo: "pronto", porta: end.port, pid: process.pid });
})().catch((e) => {
  console.error("Q026_MVCC_SERVIDOR_FALHOU", e);
  process.exit(1);
});
