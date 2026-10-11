/**
 * Q-026 — o instante MVCC por LOTE, com e sem o EMBRULHO cancelável da rota.
 * Somente teste. PostgreSQL DESCARTÁVEL, dados sintéticos, sem escritor.
 *
 * Pergunta: mudar o tamanho do FETCH encurta a janela MVCC do incremental até
 * a da porta canônica? E o que a rota real (com `leitorRrCancelavel`) faz com
 * essa janela, comparado ao que o PR #85 mediu sem o embrulho?
 *
 * Um banco por perfil, semeado uma vez; cada medida é um processo Node novo
 * (`q026-mvcc-lote-filho.ts`), em ordem rotativa, R repetições. O digest
 * (leitura + view model) tem de ser o MESMO em todas as variantes — senão a
 * medição reprova. Sem DELIVERYOS_PG_URL: sai 78, nunca verde.
 */

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { bancoIsolado } from "../../src/platform/banco-isolado";
import { createPgClient } from "../../src/platform/persistence/sql-client";
import { criarPapeisDeLeitura, resumir, semearPerfil, tamanhoDo, urlComUsuario, type Perfil } from "./q026-mvcc-comum";

const URL_BASE = (process.env.DELIVERYOS_PG_URL ?? "").trim();
if (!URL_BASE) {
  console.error("PULADO: DELIVERYOS_PG_URL ausente. Nenhuma medida de lote rodou — isto nao e verde.");
  process.exit(78);
}
const PERFIL = (process.env.Q026_LOTE_PERFIL ?? "longa") as Perfil;
const ESCALA = Number(process.env.Q026_LOTE_ESCALA ?? 1);
const REPETICOES = Number(process.env.Q026_LOTE_REPETICOES ?? 3);
const LOTES = (process.env.Q026_LOTE_LOTES ?? "257,1024,4096,20000").split(",").map(Number);
const SAIDA = (process.env.Q026_LOTE_SAIDA ?? "").trim();
const FILHO = join(resolve(__dirname), "q026-mvcc-lote-filho.ts");

interface Medida {
  modo: string;
  lote: number | string | null;
  embrulho: boolean;
  corpo_ms: number;
  espera_banco_ms: number;
  comandos: number;
  por_classe: Record<string, { n: number; ms: number }>;
  total_ms: number;
  laco_max_ms: number;
  pico_rss_mib: number;
  calibracao_ms: number;
  digest: string;
}

void (async () => {
  const banco = await bancoIsolado(URL_BASE, undefined, "q026lote");
  const admin = await createPgClient({ url: URL_BASE, max: 1 });
  const prefixo = `q026lote_${process.pid}_${Math.random().toString(36).slice(2, 6)}`;
  let codigo = 0;
  try {
    const fatos = await semearPerfil(banco.cliente, tamanhoDo(PERFIL, ESCALA));
    await banco.cliente.query("VACUUM (ANALYZE) platform.event_log");
    const [papel] = await criarPapeisDeLeitura(admin, banco.cliente, banco.nome, 1, prefixo);
    const url = urlComUsuario(banco.url, papel!);
    const variantes: Array<{ modo: string; lote?: number; embrulho: boolean }> = [
      { modo: "canonico", embrulho: false },
      { modo: "canonico", embrulho: true },
      ...LOTES.flatMap((lote) => [
        { modo: "incremental", lote, embrulho: false },
        { modo: "incremental", lote, embrulho: true },
      ]),
    ];
    console.log(`\nQ-026 LOTE × EMBRULHO · ${PERFIL}×${ESCALA} (${fatos} fatos) · ${variantes.length} variantes × ${REPETICOES} repetições`);
    const medidas: Medida[] = [];
    for (let r = 0; r < REPETICOES; r += 1) {
      const ordem = variantes.map((_, i) => variantes[(i + r * 3) % variantes.length]!);
      for (const v of ordem) {
        const p = spawnSync(process.execPath, ["--expose-gc", ...process.execArgv, FILHO], {
          env: {
            ...process.env,
            Q026_LOTE_URL: url,
            Q026_LOTE_MODO: v.modo,
            Q026_LOTE_EMBRULHO: v.embrulho ? "sim" : "nao",
            ...(v.lote ? { Q026_LOTE_LOTE: String(v.lote) } : {}),
          },
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
        });
        const linha = (p.stdout ?? "").split("\n").find((l) => l.startsWith("Q026_LOTE "));
        if (p.status !== 0 || !linha) throw new Error(`variante ${JSON.stringify(v)} falhou (código ${String(p.status)}): ${(p.stderr ?? "").slice(-500)}`);
        const m = JSON.parse(linha.slice("Q026_LOTE ".length)) as Medida;
        medidas.push(m);
        console.log(`  ${r + 1}/${REPETICOES} ${v.modo}${v.lote ? `/${v.lote}` : ""}${v.embrulho ? "+embrulho" : ""}: corpo ${m.corpo_ms} ms · ${m.comandos} comandos · banco ${m.espera_banco_ms} ms · total ${m.total_ms} ms · laço ${m.laco_max_ms} ms`);
      }
    }
    const digests = new Set(medidas.map((m) => m.digest));
    if (digests.size !== 1) throw new Error(`Q026_LOTE_DIGESTS_DIFERENTES: ${[...digests].join(", ")}`);
    const tabela = variantes.map((v) => {
      const ms = medidas.filter((m) => m.modo === v.modo && m.embrulho === v.embrulho && (v.lote === undefined || m.lote === v.lote));
      return {
        variante: `${v.modo}${v.lote ? `/${v.lote}` : ""}${v.embrulho ? "+embrulho" : ""}`,
        corpo_ms: resumir(ms.map((m) => m.corpo_ms)),
        espera_banco_ms: resumir(ms.map((m) => m.espera_banco_ms)),
        comandos: ms[0]?.comandos ?? null,
        // Mediana, por classe de comando, do tempo somado esperando o banco.
        por_classe_ms: Object.fromEntries(
          [...new Set(ms.flatMap((m) => Object.keys(m.por_classe)))].map((k) => [k, resumir(ms.map((m) => m.por_classe[k]?.ms ?? 0)).p50]),
        ),
        total_ms: resumir(ms.map((m) => m.total_ms)),
        laco_max_ms: resumir(ms.map((m) => m.laco_max_ms)),
        pico_rss_mib: resumir(ms.map((m) => m.pico_rss_mib)),
      };
    });
    console.log("\n  variante                         corpo (instante) ms      comandos   banco ms        total ms        laço máx ms   RSS MiB");
    const f = (x: { p50: number | null; min: number | null; max: number | null }) => `${x.p50} (${x.min}–${x.max})`;
    for (const t of tabela) {
      console.log(`  ${t.variante.padEnd(32)} ${f(t.corpo_ms).padEnd(24)} ${String(t.comandos).padEnd(10)} ${String(t.espera_banco_ms.p50).padEnd(15)} ${String(t.total_ms.p50).padEnd(15)} ${String(t.laco_max_ms.p50).padEnd(13)} ${t.pico_rss_mib.p50}`);
    }
    console.log("\n  tempo esperando o banco, por classe de comando (mediana, ms):");
    for (const t of tabela) {
      const partes = Object.entries(t.por_classe_ms)
        .filter(([, v]) => (v ?? 0) >= 1)
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        .map(([k, v]) => `${k} ${v}`);
      console.log(`  ${t.variante.padEnd(32)} ${partes.join(" · ")}`);
    }
    const resultado = { perfil: PERFIL, escala: ESCALA, fatos, repeticoes: REPETICOES, digest: [...digests][0], tabela, medidas };
    if (SAIDA) writeFileSync(SAIDA, JSON.stringify(resultado, null, 2));
    console.log(`\nQ026_LOTE_RESULTADO ${JSON.stringify({ perfil: PERFIL, fatos, digest_unico: true, repeticoes: REPETICOES })}`);
  } catch (e) {
    console.error(e);
    codigo = 1;
  } finally {
    await banco.descartar().catch(() => undefined);
    const sobras = await admin.query(`SELECT rolname::text AS r FROM pg_roles WHERE rolname LIKE $1`, [`${prefixo}%`]).catch(() => []);
    for (const s of sobras) await admin.query(`DROP ROLE IF EXISTS ${String(s.r)}`).catch(() => undefined);
    await admin.close();
  }
  process.exit(codigo);
})();
