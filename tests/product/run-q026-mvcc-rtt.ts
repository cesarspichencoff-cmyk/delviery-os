/**
 * Q-026 — o instante MVCC quando o PostgreSQL NÃO está no mesmo host.
 * Somente teste. PostgreSQL DESCARTÁVEL, dados sintéticos, sem escritor.
 *
 * Por que existe: o incremental faz uma ida e volta por lote (e, com o embrulho
 * cancelável da rota, duas: `SET LOCAL` e `FETCH`). Em localhost a ida e volta
 * custa ~0,05 ms e o número de comandos quase não pesa (lote × embrulho). Num
 * banco gerenciado, a latência de rede multiplica esse número. Aqui um proxy TCP
 * com atraso fixo por sentido fica entre o leitor e o banco, e a mesma leitura
 * é medida com e sem ele.
 *
 * O proxy vive NESTE processo; cada medida roda num processo filho próprio
 * (`q026-mvcc-lote-filho.ts`), então o laço do proxy não é o laço medido. O
 * filho é lançado de forma ASSÍNCRONA: com `spawnSync`, o laço deste processo
 * pararia e o proxy deixaria de encaminhar (foi assim que a primeira versão
 * falhou, com "Connection terminated unexpectedly"). A ida
 * e volta efetiva é MEDIDA (mediana de 50 `SELECT 1` pelo proxy) — não suposta.
 * O digest (leitura + view model) tem de ser o mesmo em todas as variantes.
 *
 * Saída: tabela + `Q026_RTT_RESULTADO {…}`. Sem DELIVERYOS_PG_URL: sai 78.
 */

import { spawn } from "node:child_process";
import net from "node:net";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient } from "../../src/platform/persistence/sql-client";
import { criarPapeisDeLeitura, quantil, semearPerfil, tamanhoDo, urlComUsuario, type Perfil } from "./q026-mvcc-comum";

const URL_BASE = (process.env.DELIVERYOS_PG_URL ?? "").trim();
if (!URL_BASE) {
  console.error("PULADO: DELIVERYOS_PG_URL ausente. Nenhuma medida de latencia rodou — isto nao e verde.");
  process.exit(78);
}
const PERFIL = (process.env.Q026_RTT_PERFIL ?? "longa") as Perfil;
const ESCALA = Number(process.env.Q026_RTT_ESCALA ?? 1);
const REPETICOES = Number(process.env.Q026_RTT_REPETICOES ?? 2);
// Atraso por sentido, em ms (o temporizador do Node tem resolução de 1 ms).
const ATRASOS = (process.env.Q026_RTT_ATRASOS_MS ?? "0,1,3").split(",").map(Number);
const SAIDA = (process.env.Q026_RTT_SAIDA ?? "").trim();
const FILHO = join(resolve(__dirname), "q026-mvcc-lote-filho.ts");

/** Proxy TCP que atrasa cada pedaço `atrasoMs` em cada sentido, sem reordenar. */
function proxy(destHost: string, destPorta: number, atrasoMs: number): Promise<{ porta: number; fechar: () => Promise<void> }> {
  const sockets = new Set<net.Socket>();
  const srv = net.createServer((cli) => {
    const pg = net.connect(destPorta, destHost);
    sockets.add(cli);
    sockets.add(pg);
    cli.setNoDelay(true);
    pg.setNoDelay(true);
    const encaminhar = (de: net.Socket, para: net.Socket) => {
      de.on("data", (b: Buffer) => {
        // Mesmo atraso para todos: temporizadores de mesmo prazo disparam na ordem.
        setTimeout(() => {
          if (!para.destroyed) para.write(b);
        }, atrasoMs);
      });
      de.on("end", () => setTimeout(() => para.end(), atrasoMs + 1));
      de.on("error", () => para.destroy());
      de.on("close", () => sockets.delete(de));
    };
    encaminhar(cli, pg);
    encaminhar(pg, cli);
  });
  return new Promise((res) => {
    srv.listen(0, "127.0.0.1", () => {
      const a = srv.address() as net.AddressInfo;
      res({
        porta: a.port,
        fechar: () =>
          new Promise<void>((r) => {
            for (const s of sockets) s.destroy();
            srv.close(() => r());
          }),
      });
    });
  });
}

function trocarHostPorta(url: string, host: string, porta: number): string {
  const u = new URL(url);
  u.hostname = host;
  u.port = String(porta);
  return u.toString();
}

void (async () => {
  const banco = await bancoIsolado(URL_BASE, undefined, "q026rtt");
  const admin = await createPgClient({ url: URL_BASE, max: 1 });
  const prefixo = `q026rtt_${process.pid}_${Math.random().toString(36).slice(2, 6)}`;
  let codigo = 0;
  const proxies: Array<{ fechar: () => Promise<void> }> = [];
  try {
    const fatos = await semearPerfil(banco.cliente, tamanhoDo(PERFIL, ESCALA));
    await banco.cliente.query("VACUUM (ANALYZE) platform.event_log");
    const [papel] = await criarPapeisDeLeitura(admin, banco.cliente, banco.nome, 1, prefixo);
    const urlDireta = urlComUsuario(banco.url, papel!);
    const destino = new URL(urlDireta);
    const variantes: Array<{ modo: string; lote?: number }> = [
      { modo: "canonico" },
      { modo: "incremental", lote: 257 },
      { modo: "incremental", lote: 4096 },
    ];
    console.log(`\nQ-026 INSTANTE × LATÊNCIA DE REDE · ${PERFIL}×${ESCALA} (${fatos} fatos) · atrasos por sentido ${ATRASOS.join("/")} ms · ${REPETICOES} repetições · com o embrulho cancelável da rota`);
    const linhas: Array<Record<string, unknown>> = [];
    const digests = new Set<string>();
    for (const atraso of ATRASOS) {
      let url = urlDireta;
      if (atraso > 0) {
        const p = await proxy(destino.hostname, Number(destino.port || 5432), atraso);
        proxies.push(p);
        url = trocarHostPorta(urlDireta, "127.0.0.1", p.porta);
      }
      // Ida e volta MEDIDA pelo caminho que a leitura vai usar.
      const sonda = await createPgClient({ url, max: 1 });
      await sonda.query("SELECT 1");
      const rtts: number[] = [];
      for (let i = 0; i < 50; i += 1) {
        const t = performance.now();
        await sonda.query("SELECT 1");
        rtts.push(performance.now() - t);
      }
      await sonda.close();
      const rtt = +(quantil([...rtts].sort((x, y) => x - y), 0.5) ?? 0).toFixed(2);
      for (let r = 0; r < REPETICOES; r += 1) {
        for (const v of r % 2 === 0 ? variantes : [...variantes].reverse()) {
          const p = await new Promise<{ status: number | null; stdout: string; stderr: string }>((res) => {
            const filho = spawn(process.execPath, ["--expose-gc", ...process.execArgv, FILHO], {
              env: {
                ...process.env,
                Q026_LOTE_URL: url,
                Q026_LOTE_MODO: v.modo,
                Q026_LOTE_EMBRULHO: "sim",
                ...(v.lote ? { Q026_LOTE_LOTE: String(v.lote) } : {}),
              },
              stdio: ["ignore", "pipe", "pipe"],
            });
            let stdout = "";
            let stderr = "";
            filho.stdout.on("data", (b: Buffer) => (stdout += b.toString()));
            filho.stderr.on("data", (b: Buffer) => (stderr += b.toString()));
            filho.on("exit", (status) => res({ status, stdout, stderr }));
          });
          const linha = p.stdout.split("\n").find((l) => l.startsWith("Q026_LOTE "));
          if (p.status !== 0 || !linha) throw new Error(`variante ${JSON.stringify(v)} atraso ${atraso} falhou (código ${String(p.status)}): ${p.stderr.slice(-400)}`);
          const m = JSON.parse(linha.slice("Q026_LOTE ".length)) as { corpo_ms: number; comandos: number; total_ms: number; laco_max_ms: number; digest: string };
          digests.add(m.digest);
          const variante = `${v.modo}${v.lote ? `/${v.lote}` : ""}+embrulho`;
          linhas.push({ atraso_por_sentido_ms: atraso, rtt_medido_ms: rtt, variante, rodada: r + 1, corpo_ms: m.corpo_ms, comandos: m.comandos, total_ms: m.total_ms, laco_max_ms: m.laco_max_ms });
          console.log(`  RTT ${rtt} ms · ${variante}: instante ${m.corpo_ms} ms · ${m.comandos} comandos · total ${m.total_ms} ms`);
        }
      }
    }
    if (digests.size !== 1) throw new Error(`Q026_RTT_DIGESTS_DIFERENTES: ${[...digests].join(", ")}`);
    console.log("\n  RTT medido (ms)  variante                      instante p50 (ms)   comandos");
    const chaves = [...new Set(linhas.map((l) => `${String(l.rtt_medido_ms)}|${String(l.variante)}`))];
    for (const k of chaves) {
      const [rtt, variante] = k.split("|");
      const ls = linhas.filter((l) => String(l.rtt_medido_ms) === rtt && l.variante === variante);
      const p50 = quantil(ls.map((l) => Number(l.corpo_ms)).sort((x, y) => x - y), 0.5);
      console.log(`  ${rtt!.padEnd(16)} ${variante!.padEnd(29)} ${String(p50?.toFixed(1)).padEnd(19)} ${String(ls[0]!.comandos)}`);
    }
    if (SAIDA) writeFileSync(SAIDA, JSON.stringify({ perfil: PERFIL, escala: ESCALA, fatos, linhas }, null, 2));
    console.log(`\nQ026_RTT_RESULTADO ${JSON.stringify({ perfil: PERFIL, fatos, digest_unico: true, medidas: linhas.length })}`);
  } catch (e) {
    console.error(e);
    codigo = 1;
  } finally {
    for (const p of proxies) await p.fechar().catch(() => undefined);
    await banco.descartar().catch(() => undefined);
    const sobras = await admin.query(`SELECT rolname::text AS r FROM pg_roles WHERE rolname LIKE $1`, [`${prefixo}%`]).catch(() => []);
    for (const s of sobras) await admin.query(`DROP ROLE IF EXISTS ${String(s.r)}`).catch(() => undefined);
    await admin.close();
  }
  process.exit(codigo);
})();
