/**
 * Q-026 — hipótese do `ECONNRESET` visto no perfil de muitas viagens curtas:
 * um bloqueio do event loop do SERVIDOR mais longo que o `keepAliveTimeout`
 * (5 s por padrão no Node; `tools/product_system_server.ts` não o configura)
 * fecha o socket keep-alive no qual o cliente já mandou o pedido seguinte.
 * Somente teste; sem banco, sem o servidor do produto: Node `http` puro.
 *
 * Servidor em processo filho: responde `/a` e, logo depois, ocupa o laço por
 * BLOQUEIO ms. Cliente (este processo, keep-alive, 1 socket): espera a resposta
 * de `/a`, aguarda 1 s e pede `/b` no MESMO socket. Variantes: bloqueio menor e
 * maior que 5 s; `keepAliveTimeout` padrão e 10 s. Saída: `Q026_KEEPALIVE {…}`.
 * Código 1 se a hipótese for refutada (o reset não acontecer onde previsto ou
 * acontecer onde não devia).
 */

import { spawn } from "node:child_process";
import http from "node:http";

const PAPEL = process.env.Q026_KA_PAPEL ?? "";

if (PAPEL === "servidor") {
  const bloqueio = Number(process.env.Q026_KA_BLOQUEIO_MS);
  const ka = process.env.Q026_KA_TIMEOUT_MS ? Number(process.env.Q026_KA_TIMEOUT_MS) : null;
  const srv = http.createServer((req, res) => {
    res.end(req.url ?? "");
    if (req.url === "/a") {
      setImmediate(() => {
        const fim = Date.now() + bloqueio;
        while (Date.now() < fim) {
          // laço ocupado, como a projeção e o JSON de uma leitura grande
        }
      });
    }
  });
  if (ka !== null) srv.keepAliveTimeout = ka;
  srv.listen(0, "127.0.0.1", () => process.send?.({ porta: (srv.address() as { port: number }).port }));
} else {
  const pedir = (agente: http.Agent, porta: number, caminho: string) =>
    new Promise<string>((res) => {
      const req = http.get({ host: "127.0.0.1", port: porta, path: caminho, agent: agente, timeout: 20_000 }, (r) => {
        r.resume();
        r.on("end", () => res(`ok:${String(r.statusCode)}`));
      });
      req.on("error", (e: NodeJS.ErrnoException) => res(`erro:${e.code ?? e.message}`));
      req.on("timeout", () => req.destroy(new Error("timeout")));
    });
  const rodar = async (bloqueio: number, ka: number | null) => {
    const p = spawn(process.execPath, [...process.execArgv, __filename], {
      env: { ...process.env, Q026_KA_PAPEL: "servidor", Q026_KA_BLOQUEIO_MS: String(bloqueio), ...(ka !== null ? { Q026_KA_TIMEOUT_MS: String(ka) } : {}) },
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    const porta = await new Promise<number>((res) => p.on("message", (m: { porta: number }) => res(m.porta)));
    const agente = new http.Agent({ keepAlive: true, maxSockets: 1 });
    const a = await pedir(agente, porta, "/a");
    await new Promise((r) => setTimeout(r, 1000));
    const b = await pedir(agente, porta, "/b");
    agente.destroy();
    p.kill("SIGKILL");
    return { bloqueio_ms: bloqueio, keepAliveTimeout_ms: ka ?? "padrao(5000)", a, b };
  };
  void (async () => {
    const casos: Array<[number, number | null, boolean]> = [
      // [bloqueio, keepAliveTimeout, espera reset?]
      [3000, null, false],
      [7000, null, true],
      [7000, 10_000, false],
    ];
    const r: Array<Record<string, unknown>> = [];
    let refutada = false;
    for (const [bloqueio, ka, esperaReset] of casos) {
      for (let i = 0; i < 2; i += 1) {
        const x = await rodar(bloqueio, ka);
        const reset = String(x.b).startsWith("erro:");
        if (reset !== esperaReset) refutada = true;
        r.push({ ...x, reset, esperado: esperaReset });
        console.log(`  bloqueio ${bloqueio} ms · keepAliveTimeout ${String(x.keepAliveTimeout_ms)} · /a ${x.a} · /b ${x.b}${reset === esperaReset ? "" : "  <-- contra a hipótese"}`);
      }
    }
    console.log(`Q026_KEEPALIVE ${JSON.stringify({ node: process.version, hipotese_refutada: refutada, casos: r.length })}`);
    process.exit(refutada ? 1 : 0);
  })();
}
