/**
 * Q-026 — 14 MUTAÇÕES do leitor já integrado e opt-in: nenhuma regra do módulo pode ficar
 * sem um teste que a derrube. Somente teste; o repositório não é tocado.
 *
 * Cada mutante tira UMA regra de `realidade-de-entregas-incremental.ts` (o
 * desempate do aparelho, o posto do estado, o relógio confiável, o filtro de
 * unidade, o escopo sem viagem, o UNKNOWN, o REPEATABLE READ, o READ ONLY...)
 * e roda as provas contra o módulo mutado. O caso nomeado TEM que cair; um
 * mutante que sobrevive é uma regra sem prova: reprova.
 *
 * Mutantes e provas são cópias em diretório temporário, com imports
 * reescritos para caminhos absolutos.
 *
 * Uso: DELIVERYOS_PG_URL=postgres://<admin>@<host>/postgres \
 *        npx tsx tests/product/run-q026-leitor-incremental-mutacoes.ts
 * Sem DELIVERYOS_PG_URL: sai 78, PULADO em voz alta — nunca verde.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const URL_BASE = (process.env.DELIVERYOS_PG_URL ?? "").trim();
if (!URL_BASE) {
  console.error("PULADO: DELIVERYOS_PG_URL ausente. Nenhuma mutação rodou — isto nao e verde.");
  process.exit(78);
}

const AQUI = resolve(__dirname);
const RAIZ = resolve(AQUI, "../..");
const MODULO = join(RAIZ, "src/platform/leitura/realidade-de-entregas-incremental.ts");
const PROPRIEDADES = "run-q026-leitor-incremental-propriedades.ts";
const PG = "run-q026-leitor-incremental-pg.ts";

interface Mutante {
  id: string;
  o_que: string;
  de: string;
  para: string;
  prova: typeof PROPRIEDADES | typeof PG;
  /** Prefixos dos casos que TEM que cair. */
  derruba: readonly string[];
}

const MUTANTES: readonly Mutante[] = [
  {
    id: "MI1",
    o_que: "aparelho: empate fica com o PRIMEIRO (a projeção fica com o último)",
    de: "compararOrdem(ordem, a.aparelho.ordem) >= 0",
    para: "compararOrdem(ordem, a.aparelho.ordem) > 0",
    prova: PROPRIEDADES,
    derruba: ["P4b"],
  },
  {
    id: "MI2",
    o_que: "posto do estado: `chegou` acima de `entregue`",
    de: "  chegou: 3,\n  entregue: 4,",
    para: "  chegou: 4,\n  entregue: 3,",
    prova: PROPRIEDADES,
    derruba: ["P1 "],
  },
  {
    id: "MI3",
    o_que: "transição: `trip_closed` deixa de encerrar",
    de: '  trip_closed: "encerrada",\n};',
    para: "};",
    prova: PROPRIEDADES,
    derruba: ["P1 "],
  },
  {
    id: "MI4",
    o_que: "último fato: o MENOR instante",
    de: "if (ordem.t > a.ultimo_fato_ms) {",
    para: "if (ordem.t < a.ultimo_fato_ms) {",
    prova: PROPRIEDADES,
    derruba: ["P1 "],
  },
  {
    id: "MI5",
    o_que: "posição: o relógio do aparelho sem julgamento (occurred_at cru)",
    de: "const instante = instanteConfiavel(f);",
    para: "const instante = f.occurred_at;",
    prova: PROPRIEDADES,
    derruba: ["P1 "],
  },
  {
    id: "MI6",
    o_que: "ocorrências: todo fato conta",
    de: 'if (f.event_type === "occurrence_created") a.ocorrencias += 1;',
    para: "a.ocorrencias += 1;",
    prova: PROPRIEDADES,
    derruba: ["P1 "],
  },
  {
    id: "MI7",
    o_que: "filtro de unidade ignorado",
    de: "if (opcoes.unit_id && f.unit_id !== opcoes.unit_id) continue;",
    para: "",
    prova: PROPRIEDADES,
    derruba: ["P1b"],
  },
  {
    id: "MI8",
    o_que: "fato sem viagem não abre escopo",
    de: "        for (const f of d.aptos) {\n",
    para: "        for (const f of d.aptos) {\n          if (!f.trip_id) continue;\n",
    prova: PROPRIEDADES,
    derruba: ["P1 "],
  },
  {
    id: "MI9",
    o_que: "UNKNOWN não contado",
    de: "conta.sem_modo += d.sem_modo;",
    para: "conta.sem_modo += 0;",
    prova: PROPRIEDADES,
    derruba: ["P1 "],
  },
  {
    id: "MI10",
    o_que: "READ COMMITTED no lugar de REPEATABLE READ",
    de: '"SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"',
    para: '"SET TRANSACTION ISOLATION LEVEL READ COMMITTED, READ ONLY"',
    prova: PG,
    derruba: ["G2"],
  },
  {
    id: "MI11",
    o_que: "transação sem READ ONLY",
    de: '"SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"',
    para: '"SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"',
    prova: PG,
    derruba: ["G6"],
  },
  {
    id: "MI12",
    o_que: "ordem das viagens só por trip_id (sem a ordem do primeiro fato)",
    de: "        .sort((a, b) => compararOrdem(a.primeiro, b.primeiro))\n",
    para: "",
    prova: PROPRIEDADES,
    derruba: ["P4b"],
  },
  {
    id: "MI13",
    o_que: "frescor pelo último fato, não pela última posição",
    de: "frescor: classificarFrescor(a.ultima_posicao_em, agora),",
    para: "frescor: classificarFrescor(a.ultimo_fato_em, agora),",
    prova: PROPRIEDADES,
    derruba: ["P1 "],
  },
  {
    id: "MI14",
    o_que: "lote sem validação",
    de: "  if (typeof lote !== \"number\" || !Number.isInteger(lote) || lote < 1 || lote > LOTE_MAXIMO) {",
    para: "  if (false) {",
    prova: PROPRIEDADES,
    derruba: ["P6"],
  },
];

/** Reescreve imports relativos para absolutos; o módulo do leitor aponta para `alvoDoModulo`. */
function absolutizar(texto: string, dir: string, alvoDoModulo: string): string {
  return texto
    .replace(/from "(\.{1,2}\/[^"]+)"/g, (_m, rel: string) => {
      const abs = resolve(dir, rel);
      return `from "${abs === MODULO.replace(/\.ts$/, "") ? alvoDoModulo : abs}"`;
    });
}

function rodar(arquivo: string, env: Record<string, string>): { codigo: number | null; falhas: string[]; resumo: string } {
  const r = spawnSync("npx", ["tsx", arquivo], {
    cwd: RAIZ,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const saida = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const falhas = saida.split("\n").filter((l) => l.startsWith(" - ")).map((l) => l.slice(3));
  const resumo = saida.split("\n").find((l) => /^Q026_[A-Z_]+: /.test(l)) ?? "(sem resumo)";
  return { codigo: r.status, falhas, resumo };
}

const ENV_PG = { DELIVERYOS_PG_URL: URL_BASE, Q026_INC_LONGA: "5000", Q026_INC_CURTAS: "200" };
const dir = mkdtempSync(join(tmpdir(), "q026-inc-mutantes-"));
let mortos = 0;
let cegos = 0;
try {
  console.log("\nQ-026 — MUTAÇÕES DO LEITOR INCREMENTAL (nenhuma regra sem prova)");
  const prepararProva = (prova: string, alvo: string, sufixo: string): string => {
    const caminho = join(dir, `${sufixo}-${prova}`);
    writeFileSync(caminho, absolutizar(readFileSync(join(AQUI, prova), "utf8"), AQUI, alvo));
    return caminho;
  };
  // Controle: as provas com o módulo ORIGINAL, pelo mesmo caminho de import, passam.
  const original = join(dir, "original.ts");
  writeFileSync(original, absolutizar(readFileSync(MODULO, "utf8"), resolve(MODULO, ".."), original.replace(/\.ts$/, "")));
  for (const prova of [PROPRIEDADES, PG]) {
    const r = rodar(prepararProva(prova, original.replace(/\.ts$/, ""), "controle"), ENV_PG);
    if (r.codigo !== 0) {
      console.error(`CONTROLE falhou em ${prova}: ${r.resumo}\n${r.falhas.join("\n")}`);
      process.exit(1);
    }
    console.log(`  ok  controle ${prova}: ${r.resumo}`);
  }
  const texto = readFileSync(MODULO, "utf8");
  for (const m of MUTANTES) {
    const ocorrencias = texto.split(m.de).length - 1;
    if (ocorrencias !== 1) {
      console.error(`${m.id}: âncora encontrada ${ocorrencias} vezes — mutante inválido`);
      process.exit(1);
    }
    const mutante = join(dir, `${m.id}.ts`);
    writeFileSync(mutante, absolutizar(texto.replace(m.de, m.para), resolve(MODULO, ".."), mutante.replace(/\.ts$/, "")));
    const r = rodar(prepararProva(m.prova, mutante.replace(/\.ts$/, ""), m.id), ENV_PG);
    const caidos = m.derruba.filter((p) => r.falhas.some((f) => f.startsWith(p)));
    const morto = r.codigo === 1 && caidos.length === m.derruba.length;
    if (morto) mortos += 1;
    else cegos += 1;
    console.log(`${morto ? "  ok " : "  XX "} ${m.id} ${m.o_que} -> ${morto ? "derrubou" : "NAO derrubou"} ${m.derruba.join(" + ").trim()} (${r.resumo.replace(/^Q026_[A-Z_]+: /, "")}, código ${String(r.codigo)})`);
    if (!morto) console.log(`        falhas vistas: ${r.falhas.map((f) => f.split(":")[0]).join(" | ") || "nenhuma"}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\nQ026_LEITOR_INCREMENTAL_MUTACOES: ${mortos}/${MUTANTES.length} mortos, ${cegos} cegos`);
process.exit(cegos === 0 && mortos === MUTANTES.length ? 0 : 1);
