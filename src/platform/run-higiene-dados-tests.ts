/**
 * HIGIENE DE DADOS — o que o Git tem direito de carregar.
 *
 * Existe por um incidente medido, não por precaução genérica.
 *
 * `src/conference-brain/storage/store.js` escreve `<entidade>.runtime.jsonl`
 * em `data/conference-brain/`, e o comentário dele (linha 11) afirma:
 * *"gitignorado via `*.runtime.jsonl`"*. **A regra nunca existiu.** O
 * `.gitignore` tinha `/data/*.jsonl`, que casa com `data/x.jsonl` e NÃO casa
 * com `data/conference-brain/x.runtime.jsonl` — um `/` de diferença.
 *
 * O resultado foi um arquivo de 40 linhas commitado em `a6e38ed`, escrito pela
 * mutação MS21 (`memoryOnly: false`) antes de a suíte adversarial isolar o
 * diretório. Ele carrega `source_mode: "real"` e
 * `collector_version: "intelligence-spine@1.0.0"` — ou seja, **saída de teste
 * com aparência de leitura operacional**, versionada. É exatamente a linha que
 * o CLAUDE.md §5 não deixa cruzar: dado sintético nunca vira real.
 *
 * O que tornou o incidente invisível por um tempo: eu conferi "0 diferenças
 * contra `HEAD`" depois de restaurar — mas o `HEAD` já estava poluído.
 * Conferir contra `HEAD` prova que você não piorou, nunca que o `HEAD` está
 * certo. Por isso esta unidade compara contra a REGRA, não contra o estado.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const raiz = process.cwd();

let passaram = 0;
const falhas: string[] = [];
function teste(nome: string, fn: () => void): void {
  try {
    fn();
    passaram += 1;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
    console.log(`  XX  ${nome}`);
  }
}

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: raiz, encoding: "utf8" }).trim();
  } catch (e) {
    const err = e as { stdout?: string; status?: number };
    // `check-ignore` sai 1 quando o caminho NÃO é ignorado: é resposta, não erro.
    if (typeof err.status === "number" && err.status === 1) return "";
    throw e;
  }
}

/** Verdadeiro quando o Git ignoraria este caminho. Não exige o arquivo existir. */
function ignorado(rel: string): boolean {
  return git(["check-ignore", rel]) !== "";
}

console.log("=== HIGIENE DE DADOS — o que o Git carrega ===\n");

/* ------------------------------------------------------------------ *
 * 1. Nenhuma saída de runtime do Brain pode estar versionada
 * ------------------------------------------------------------------ */

teste("H1 · nenhum *.runtime.jsonl está rastreado pelo Git", () => {
  const rastreados = git(["ls-files"])
    .split("\n")
    .filter((l) => l.endsWith(".runtime.jsonl"));
  assert.deepEqual(
    rastreados,
    [],
    `saída de runtime do Conference Brain versionada: ${rastreados.join(", ")}`,
  );
});

teste("H2 · a regra que o store.js PROMETE existe de verdade", () => {
  // O caminho é derivado de `store.js`, não escrito à mão aqui: se o store
  // mudar de diretório ou de sufixo, esta unidade precisa quebrar junto, e não
  // continuar guardando um lugar que ninguém mais usa.
  const req = createRequireLocal();
  const store = req("./src/conference-brain/storage/store.js") as { DEFAULT_DIR: string };
  const relativo = store.DEFAULT_DIR.startsWith(raiz)
    ? store.DEFAULT_DIR.slice(raiz.length + 1)
    : store.DEFAULT_DIR;

  assert.ok(
    ignorado(join(relativo, "live_cycle_runs.runtime.jsonl")),
    `${relativo}/*.runtime.jsonl NÃO é ignorado — o comentário do store.js promete que é`,
  );
  assert.ok(
    ignorado(join(relativo, "qualquer_entidade.runtime.jsonl")),
    "a regra cobre um nome e não o padrão — outra entidade voltaria a vazar",
  );
});

/* ------------------------------------------------------------------ *
 * 2. CONTROLE POSITIVO — a regra não pode ser ampla demais
 * ------------------------------------------------------------------ */

teste("H3 · CONTROLE POSITIVO: a regra não engole o que deve ser versionado", () => {
  // Uma regra larga demais (`data/**` ou `*.json`) resolveria H1 e H2 e
  // esconderia patrimônio. Estes caminhos precisam continuar visíveis.
  for (const caminho of [
    "data/cardapio_knowledge_seed.json",
    "docs/contracts/eventos.schema.json",
    "src/conference-brain/storage/store.js",
    "package.json",
  ]) {
    assert.ok(!ignorado(caminho), `${caminho} passou a ser ignorado — regra ampla demais`);
  }
});

teste("H4 · o seed do cardápio continua rastreado, não só não-ignorado", () => {
  const rastreado = git(["ls-files", "data/cardapio_knowledge_seed.json"]);
  assert.equal(
    rastreado,
    "data/cardapio_knowledge_seed.json",
    "o seed do cardápio saiu do Git — patrimônio não pode sumir por faxina",
  );
});

/* ------------------------------------------------------------------ *
 * 3. Saída sintética nunca pode ser lida como operação real
 * ------------------------------------------------------------------ */

teste("H5 · nenhum arquivo versionado carrega leitura da espinha com source_mode real", () => {
  // O resíduo removido tinha `collector_version: "intelligence-spine@1.0.0"` e
  // `run_id` com `:real`. Um arquivo assim, versionado, é indistinguível de
  // leitura de operação para quem abrir o repositório depois.
  const suspeitos = git(["grep", "-l", "intelligence-spine@", "--", "data/"]);
  assert.equal(
    suspeitos,
    "",
    `arquivo versionado em data/ carrega saída da espinha: ${suspeitos}`,
  );
});

function createRequireLocal(): (s: string) => unknown {
  // `createRequire` a partir do `package.json` do projeto: o mesmo caminho que
  // as suítes já usam para alcançar o Brain, que é CommonJS.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createRequire } = require("node:module") as typeof import("node:module");
  return createRequire(join(raiz, "package.json")) as unknown as (s: string) => unknown;
}

console.log(`\n${passaram}/${passaram + falhas.length} de higiene de dados`);
for (const f of falhas) console.log(`  XX ${f}`);
if (falhas.length) {
  console.error("\nHIGIENE_DADOS_RED");
  process.exit(1);
}
console.log("\nHIGIENE_DADOS_GREEN");
