/**
 * Q-026 SHADOW — MUTACOES das duas suites adversariais: nenhum caso pode ser
 * cego. Cada mutante tira, de UM caso, o mecanismo que ele afirma provar (o
 * instantaneo unico, a colacao "C", o desempate em bytes, a escrita
 * concorrente, o empate, o separador) e o caso nomeado TEM que cair. Um
 * mutante que sobrevive e um teste que passaria com o defeito: reprova.
 *
 * Os mutantes sao copias em diretorio temporario, com os imports relativos
 * reescritos para caminhos absolutos: o repositorio nao e tocado.
 *
 * Uso: DELIVERYOS_PG_URL=postgres://<admin>@<host>/postgres \
 *        npx tsx tests/product/run-q026-adversarial-mutacoes.ts
 * Sem DELIVERYOS_PG_URL: sai 78, PULADO em voz alta — nunca verde.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const URL_BASE = (process.env.DELIVERYOS_PG_URL ?? "").trim();
if (!URL_BASE) {
  console.error("PULADO: DELIVERYOS_PG_URL ausente. Nenhuma mutacao rodou — isto nao e verde.");
  process.exit(78);
}

const AQUI = resolve(__dirname);
const RAIZ = resolve(AQUI, "../..");
const SNAPSHOT = "run-q026-snapshot-adversarial-pg.ts";
const CURSOR = "run-q026-cursor-adversarial-pg.ts";
const PASSAGEM =
  "const numSoInstantaneo = <T,>(base: TransactionalSqlClient, corpo: (c: TransactionalSqlClient) => Promise<T>): Promise<T> => corpo(base);";

interface Mutante {
  id: string;
  arquivo: string;
  o_que: string;
  de: string;
  para: string;
  /** Prefixos dos casos que TEM que cair (o nome do caso comeca por eles). */
  derruba: readonly string[];
}

const MUTANTES: readonly Mutante[] = [
  {
    id: "MS1",
    arquivo: SNAPSHOT,
    o_que: "sem instantaneo unico: a 'alternativa segura' vira a porta como esta",
    de: `import { comGanchos, numSoInstantaneo } from "./q026-adversarial-comum";`,
    para: `import { comGanchos } from "./q026-adversarial-comum";\n${PASSAGEM}`,
    derruba: ["S1 POS", "S2 POS"],
  },
  {
    id: "MS2",
    arquivo: SNAPSHOT,
    o_que: "S1 NEG sem a escrita concorrente",
    de: `const leitor = comGanchos(b.cliente, { depoisDaTransacao: async (n) => (n === 1 ? gravar(w, LOTE_NOVO) : undefined) });`,
    para: `const leitor = comGanchos(b.cliente, {});`,
    derruba: ["S1 NEG"],
  },
  {
    id: "MS3",
    arquivo: SNAPSHOT,
    o_que: "S3 sempre em REPEATABLE READ (a rodada READ COMMITTED deixa de existir)",
    de: "await tx.query(`SET TRANSACTION ISOLATION LEVEL ${isolamento}, READ ONLY`);\n          await tx.query(\n            `DECLARE q026_c",
    para: "await tx.query(`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`);\n          await tx.query(\n            `DECLARE q026_c",
    derruba: ["S3"],
  },
  {
    id: "MS4",
    arquivo: SNAPSHOT,
    o_que: "S4 sem importar o instantaneo exportado",
    de: `const compartilhado = await rodada(true, "gps-9b");`,
    para: `const compartilhado = await rodada(false, "gps-9b");`,
    derruba: ["S4"],
  },
  {
    id: "MS5",
    arquivo: SNAPSHOT,
    o_que: "S5 sem o commit atrasado (o fato lento confirma na hora)",
    de: `        gravou();\n        await segurar;`,
    para: `        gravou();`,
    derruba: ["S5"],
  },
  {
    id: "MS6",
    arquivo: SNAPSHOT,
    o_que: "S8 sempre em READ COMMITTED (a rodada REPEATABLE READ deixa de existir)",
    de: "await tx.query(`SET TRANSACTION ISOLATION LEVEL ${isolamento}, READ ONLY`);\n          const [{ pid }]",
    para: "await tx.query(`SET TRANSACTION ISOLATION LEVEL READ COMMITTED, READ ONLY`);\n          const [{ pid }]",
    derruba: ["S8"],
  },
  {
    id: "MS7",
    arquivo: SNAPSHOT,
    o_que: "S2 NEG sem a escrita entre as consultas do cadastro",
    de: "antesDaConsulta: async (sql, n) => (n === 2 && /count\\(\\*\\)/.test(sql) ? gravar(w, LOTE_NOVO) : undefined),",
    para: "antesDaConsulta: async () => undefined,",
    derruba: ["S2 NEG"],
  },
  {
    id: "MC1",
    arquivo: CURSOR,
    o_que: "candidato sem COLLATE \"C\" na viagem",
    de: `object_type COLLATE "C", object_id COLLATE "C", event_id COLLATE "C"`,
    para: `object_type COLLATE "C", object_id, event_id COLLATE "C"`,
    derruba: ["C14"],
  },
  {
    id: "MC2",
    arquivo: CURSOR,
    o_que: "candidato sem o desempate final por event_id em bytes",
    de: `object_id COLLATE "C", event_id COLLATE "C"\``,
    para: `object_id COLLATE "C"\``,
    derruba: ["C10"],
  },
  {
    id: "MC3",
    arquivo: CURSOR,
    o_que: "C9 sem REPEATABLE READ na rodada positiva",
    de: `const rr = await rodada("REPEATABLE READ");`,
    para: `const rr = await rodada("READ COMMITTED");`,
    derruba: ["C9"],
  },
  {
    id: "MC4",
    arquivo: CURSOR,
    o_que: "C15 sem instantaneo unico na rodada positiva",
    de: `import { numSoInstantaneo } from "./q026-adversarial-comum";`,
    para: `import type { TransactionalSqlClient as _Q026 } from "../../src/platform/persistence/sql-client";\nconst numSoInstantaneo = <T,>(base: _Q026, corpo: (c: _Q026) => Promise<T>): Promise<T> => corpo(base);`,
    derruba: ["C15"],
  },
  {
    id: "MC5",
    arquivo: CURSOR,
    o_que: "C15 NEG sem a escrita concorrente",
    de: `      await gravar(w, LOTE);\n`,
    para: `\n`,
    derruba: ["C15"],
  },
  {
    id: "MC6",
    arquivo: CURSOR,
    o_que: "leitor misto com a chave em texto do @43b6ad8",
    de: `const key = JSON.stringify([e.unit_id, e.source_mode, e.trip_id]);`,
    para: `const key = e.unit_id + "|" + e.source_mode + "|" + e.trip_id;`,
    derruba: ["C12"],
  },
  {
    id: "MC7",
    arquivo: CURSOR,
    o_que: "C16 sem empate (sequencias diferentes)",
    de: `event_id: nfd, object_id: "T-E", event_type: "gps_batch_received", occurred_at: ha(100), device_id: "dev-B", sequence_local: 7`,
    para: `event_id: nfd, object_id: "T-E", event_type: "gps_batch_received", occurred_at: ha(100), device_id: "dev-B", sequence_local: 8`,
    derruba: ["C16"],
  },
  {
    id: "MC8",
    arquivo: CURSOR,
    o_que: "candidato perde o escopo so com fato sem viagem",
    de: `        escopos.add(JSON.stringify([f.unit_id, f.source_mode]));\n`,
    para: `        if (f.trip_id) escopos.add(JSON.stringify([f.unit_id, f.source_mode]));\n`,
    derruba: ["C7"],
  },
  {
    id: "MC9",
    arquivo: CURSOR,
    o_que: "candidato nao conta UNKNOWN",
    de: `      out.sem_modo += d.sem_modo;`,
    para: `      out.sem_modo += 0;`,
    derruba: ["C7"],
  },
  {
    id: "MC10",
    arquivo: CURSOR,
    o_que: "replica @43b6ad8 sem o assert de sequencia segura",
    de: `  assert.ok(sequence === undefined || Number.isSafeInteger(sequence));\n  const time =`,
    para: `  const time =`,
    derruba: ["C1 NEG o leitor do PR #37 @43b6ad8 cai (falha alta) diante de sequence_local", "C8"],
  },
  {
    id: "MC11",
    arquivo: CURSOR,
    o_que: "leitor misto com COLLATE \"C\" na viagem (a correcao proposta para C14)",
    de: `"ORDER BY unit_id,source_mode NULLS LAST,object_type,object_id",`,
    para: `"ORDER BY unit_id,source_mode NULLS LAST,object_type,object_id COLLATE \\"C\\"",`,
    derruba: ["C14"],
  },
  {
    id: "MC12",
    arquivo: CURSOR,
    o_que: "replica @43b6ad8 com todos os tipos da Operacao Viva (a causa de C2)",
    de: `"WHERE event_type IN ('trip_started','gps_batch_received')",`,
    para: `"WHERE event_type IN ('trip_created','trip_started','gps_batch_received','arrival_detected','delivery_confirmed','occurrence_created','trip_return_started','trip_returned','trip_closed')",`,
    derruba: ["C2"],
  },
];

function absolutizar(texto: string): string {
  return texto
    .replace(/from "\.\.\/\.\.\/src\//g, `from "${RAIZ}/src/`)
    .replace(/from "\.\/q026-adversarial-comum"/g, `from "${join(AQUI, "q026-adversarial-comum")}"`);
}

function rodar(arquivo: string): { codigo: number | null; falhas: string[]; resumo: string } {
  // Como os gates de mutacao do repositorio: `npx tsx`, que nao e dependencia do pacote.
  const r = spawnSync("npx", ["tsx", arquivo], {
    cwd: RAIZ,
    env: { ...process.env, DELIVERYOS_PG_URL: URL_BASE },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const saida = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const falhas = saida
    .split("\n")
    .filter((l) => l.startsWith(" - "))
    .map((l) => l.slice(3));
  const resumo = saida.split("\n").find((l) => /^Q026_[A-Z_]+: /.test(l)) ?? "(sem resumo)";
  return { codigo: r.status, falhas, resumo };
}

const dir = mkdtempSync(join(tmpdir(), "q026-mutantes-"));
let cegos = 0;
let mortos = 0;
const relato: string[] = [];
try {
  console.log("\nQ-026 — MUTACOES DAS SUITES ADVERSARIAIS (nenhum caso pode ser cego)");
  // Controle: as duas suites ORIGINAIS, absolutizadas do mesmo jeito, passam.
  for (const arquivo of [SNAPSHOT, CURSOR]) {
    const caminho = join(dir, `controle-${arquivo}`);
    writeFileSync(caminho, absolutizar(readFileSync(join(AQUI, arquivo), "utf8")));
    const r = rodar(caminho);
    if (r.codigo !== 0) {
      console.error(`CONTROLE falhou em ${arquivo} (codigo ${String(r.codigo)}): ${r.resumo}\n${r.falhas.join("\n")}`);
      process.exit(1);
    }
    console.log(`  ok  controle ${arquivo}: ${r.resumo}`);
  }
  for (const m of MUTANTES) {
    const original = readFileSync(join(AQUI, m.arquivo), "utf8");
    const ocorrencias = original.split(m.de).length - 1;
    if (ocorrencias !== 1) {
      console.error(`${m.id}: ancora encontrada ${ocorrencias} vezes em ${m.arquivo} — mutante invalido`);
      process.exit(1);
    }
    const caminho = join(dir, `${m.id}-${m.arquivo}`);
    writeFileSync(caminho, absolutizar(original.replace(m.de, m.para)));
    const r = rodar(caminho);
    const caidos = m.derruba.filter((prefixo) => r.falhas.some((f) => f.startsWith(prefixo)));
    const morto = r.codigo === 1 && caidos.length === m.derruba.length;
    if (morto) mortos += 1;
    else cegos += 1;
    const linha = `${morto ? "  ok " : "  XX "} ${m.id} ${m.o_que} -> ${morto ? "derrubou" : "NAO derrubou"} ${m.derruba.join(" + ")} (${r.resumo.replace(/^Q026_[A-Z_]+: /, "")}, codigo ${String(r.codigo)})`;
    relato.push(linha);
    console.log(linha);
    if (!morto) console.log(`        falhas vistas: ${r.falhas.map((f) => f.split(":")[0]).join(" | ") || "nenhuma"}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\nQ026_ADVERSARIAL_MUTACOES: ${mortos}/${MUTANTES.length} mortos, ${cegos} cegos`);
process.exit(cegos === 0 && mortos === MUTANTES.length ? 0 : 1);

