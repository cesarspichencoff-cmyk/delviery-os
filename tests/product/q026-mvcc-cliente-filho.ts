/**
 * Q-026 — os CLIENTES HTTP e a SONDA de saúde, num processo próprio.
 * Somente teste: fala com instâncias locais do servidor real.
 *
 *  - C clientes em laço fechado (pede, espera a resposta, pensa, pede de novo)
 *    em `GET /api/entregas`; cada cliente fica preso a uma instância, para a
 *    carga se repartir igual entre elas;
 *  - uma sonda por instância em `GET /api/health` a cada ~25 ms: `/api/health`
 *    não toca o PostgreSQL, então a latência dela é o que o event loop da
 *    instância faz com quem chega. Uma sonda pendente não é duplicada: quando
 *    ela volta, a latência inclui o bloqueio inteiro.
 *
 * O orquestrador sobe UM processo destes por cliente (`Q026_MVCC_CLIENTE_BASE`
 * dá o índice) e um processo só de sondas (`Q026_MVCC_CLIENTES=0`): o
 * `JSON.parse` de uma resposta grande (≈92 MB com 60 mil viagens) bloqueia o
 * laço DESTE processo, e não pode inflar a sonda nem a latência de outro
 * cliente. A latência de cada pedido é anotada no fim do corpo, ANTES do parse.
 */

import http from "node:http";
import { performance } from "node:perf_hooks";

const PORTAS = (process.env.Q026_MVCC_PORTAS ?? "").split(",").filter(Boolean).map(Number);
const CLIENTES = Number(process.env.Q026_MVCC_CLIENTES ?? 2);
const BASE = Number(process.env.Q026_MVCC_CLIENTE_BASE ?? 0);
const SONDAR = (process.env.Q026_MVCC_SONDAR ?? "1") !== "0";
const PENSAR_MS = Number(process.env.Q026_MVCC_PENSAR_MS ?? 0);
const DURACAO_MS = Number(process.env.Q026_MVCC_DURACAO_MS ?? 30_000);
const SONDA_MS = Number(process.env.Q026_MVCC_SONDA_MS ?? 25);
if (PORTAS.length === 0 || PORTAS.some((p) => !Number.isInteger(p))) {
  console.error("Q026_MVCC_CLIENTE_ARGUMENTOS_INVALIDOS");
  process.exit(2);
}

interface Pedido {
  cliente: number;
  porta: number;
  t0: number;
  ms: number;
  status: number;
  erro: string | null;
  disponivel: boolean | null;
  bytes: number;
}

function obter(agente: http.Agent, porta: number, caminho: string, timeoutMs: number): Promise<{ status: number; corpo: string; fim: number }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: porta, path: caminho, method: "GET", agent: agente, timeout: timeoutMs }, (res) => {
      const partes: Buffer[] = [];
      res.on("data", (b: Buffer) => partes.push(b));
      res.on("end", () => {
        // O instante do fim do corpo, antes de qualquer conversão ou parse.
        const fim = performance.now();
        resolve({ status: res.statusCode ?? 0, corpo: Buffer.concat(partes).toString("utf8"), fim });
      });
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("Q026_MVCC_HTTP_TIMEOUT")));
    req.on("error", reject);
    req.end();
  });
}

void (async () => {
  const fim = performance.now() + DURACAO_MS;
  const pedidos: Pedido[] = [];
  type Sonda = { t: number[]; ms: number[]; falhas: number };
  const sondas: Record<string, Sonda> = {};

  const sondar = async (porta: number) => {
    const agente = new http.Agent({ keepAlive: true, maxSockets: 1 });
    const s: Sonda = { t: [], ms: [], falhas: 0 };
    sondas[String(porta)] = s;
    while (performance.now() < fim) {
      const t0 = performance.now();
      try {
        const r = await obter(agente, porta, "/api/health", 30_000);
        if (r.status !== 200) s.falhas += 1;
        s.t.push(Date.now());
        s.ms.push(+(performance.now() - t0).toFixed(2));
      } catch {
        s.falhas += 1;
      }
      const resto = SONDA_MS - (performance.now() - t0);
      if (resto > 0) await new Promise<void>((r) => setTimeout(r, resto));
    }
    agente.destroy();
  };

  const cliente = async (n: number) => {
    const porta = PORTAS[n % PORTAS.length]!;
    const agente = new http.Agent({ keepAlive: true, maxSockets: 1 });
    // Partida escalonada: os clientes não chegam todos no mesmo milissegundo.
    await new Promise<void>((r) => setTimeout(r, (n % 8) * 137));
    while (performance.now() < fim) {
      const t0 = performance.now();
      const inicio = Date.now();
      try {
        const r = await obter(agente, porta, "/api/entregas", 60_000);
        let erro: string | null = null;
        let disponivel: boolean | null = null;
        try {
          const j = JSON.parse(r.corpo) as { erro?: string; leitura?: { disponivel?: boolean } };
          erro = typeof j.erro === "string" ? j.erro : null;
          disponivel = typeof j.leitura?.disponivel === "boolean" ? j.leitura.disponivel : null;
        } catch {
          erro = "json_invalido";
        }
        pedidos.push({ cliente: n, porta, t0: inicio, ms: +(r.fim - t0).toFixed(2), status: r.status, erro, disponivel, bytes: r.corpo.length });
      } catch (e) {
        pedidos.push({ cliente: n, porta, t0: inicio, ms: +(performance.now() - t0).toFixed(2), status: 0, erro: String((e as Error).message).slice(0, 60), disponivel: null, bytes: 0 });
      }
      if (PENSAR_MS > 0) await new Promise<void>((r) => setTimeout(r, PENSAR_MS));
    }
    agente.destroy();
  };

  await Promise.all([...(SONDAR ? PORTAS.map((p) => sondar(p)) : []), ...Array.from({ length: CLIENTES }, (_, i) => cliente(BASE + i))]);
  process.send?.({ tipo: "clientes", pedidos, sondas });
  setTimeout(() => process.exit(0), 200);
})().catch((e) => {
  console.error("Q026_MVCC_CLIENTE_FALHOU", e);
  process.exit(1);
});
