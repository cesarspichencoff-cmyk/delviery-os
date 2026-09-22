/**
 * C3.5 — SUÍTE ADVERSARIAL DA ESPINHA DE INTELIGÊNCIA.
 *
 * Um gate verde prova que o código passa nos próprios testes. Não prova que os
 * testes veriam o código ficar errado. Esta suíte mede a segunda coisa: para
 * cada propriedade que o C3 promete, ela QUEBRA a propriedade no disco e exige
 * que a guarda certa acuse — pela assinatura certa, não por acaso.
 *
 * Três recusas herdadas de `run-m1b-mutation-tests.ts`, cada uma por um falso
 * verde que já aconteceu nesta base:
 *
 *  - mutação que não entrou no disco não conta. `aplicar` relê o arquivo e
 *    compara hash;
 *  - guarda que nem rodou não conta. Spawn sem saída nenhuma vira
 *    `__SPAWN_FALHOU__` e grita, em vez de passar por "reprovou";
 *  - reprovar não basta: tem que reprovar PELA ASSINATURA esperada. Um teste
 *    que quebra por outro motivo não estava defendendo aquela propriedade.
 *
 * E a restauração é byte a byte, conferida por hash, em `finally` — uma suíte
 * adversarial que deixa o repositório mutado é pior que não existir.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
const falhas: string[] = [];
let passaram = 0;
let cegas = 0;

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

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

/** Reaproveita as flags de carregamento do `tsx` deste processo. Ver m1b. */
function flagsDeCarregamento(): string[] {
  const flags: string[] = [];
  const argv = process.execArgv;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--require" || argv[i] === "--import") {
      flags.push(argv[i]!, argv[i + 1]!);
      i += 1;
    }
  }
  return flags;
}

function rodar(script: string): { ok: boolean; saida: string } {
  try {
    const saida = execFileSync(process.execPath, [...flagsDeCarregamento(), script], {
      cwd: raiz,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, saida };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: string };
    const saida = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    if (saida.trim() === "") {
      return { ok: false, saida: `__SPAWN_FALHOU__ code=${err.code ?? "?"} sem saida` };
    }
    return { ok: false, saida };
  }
}

interface Aplicacao {
  readonly aplicou: boolean;
  readonly motivo: string;
  readonly original: string;
  readonly hashAntes: string;
  readonly hashDepois: string;
}

function aplicar(rel: string, de: string, para: string): Aplicacao {
  const caminho = join(raiz, rel);
  const original = readFileSync(caminho, "utf8");
  const hashAntes = sha(original);
  if (!original.includes(de)) {
    return { aplicou: false, motivo: `ancora nao encontrada em ${rel}`, original, hashAntes, hashDepois: "" };
  }
  const mutado = original.replace(de, () => para);
  if (mutado === original) {
    return { aplicou: false, motivo: "a troca nao mudou nada", original, hashAntes, hashDepois: "" };
  }
  writeFileSync(caminho, mutado);
  const noDisco = readFileSync(caminho, "utf8");
  const hashDepois = sha(noDisco);
  if (hashDepois === hashAntes || !noDisco.includes(para)) {
    writeFileSync(caminho, original);
    return { aplicou: false, motivo: "escrita feita, disco nao confirmou", original, hashAntes, hashDepois };
  }
  return { aplicou: true, motivo: "", original, hashAntes, hashDepois };
}

function restaurar(rel: string, a: Aplicacao): void {
  writeFileSync(join(raiz, rel), a.original);
  const volta = sha(readFileSync(join(raiz, rel), "utf8"));
  assert.equal(volta, a.hashAntes, `RESTAURACAO FALHOU em ${rel} — o repositorio ficou mutado`);
}

const GUARDA_ESPINHA = "src/platform/run-intelligence-spine-tests.ts";
const GUARDA_TOPOLOGIA = "src/platform/run-topology-audit-tests.ts";
const GUARDA_COPILOTO = "src/platform/run-copiloto-shadow-tests.ts";

function mutacao(opts: {
  id: string;
  propriedade: string;
  arquivo: string;
  de: string;
  para: string;
  guarda: string;
  assinatura: RegExp;
}): void {
  teste(`${opts.id} — ${opts.propriedade}`, () => {
    const a = aplicar(opts.arquivo, opts.de, opts.para);
    assert.ok(a.aplicou, `MUTACAO NAO APLICADA: ${a.motivo}`);
    console.log(`        aplicada · ${opts.arquivo} · ${a.hashAntes.slice(0, 10)} -> ${a.hashDepois.slice(0, 10)}`);
    try {
      const r = rodar(opts.guarda);
      assert.doesNotMatch(
        r.saida,
        /__SPAWN_FALHOU__/,
        "o guarda nem chegou a rodar — falha de ambiente, nao propriedade defendida",
      );
      if (r.ok) {
        cegas += 1;
        assert.fail("o guarda ficou VERDE com a mutacao aplicada — MUTACAO CEGA");
      }
      assert.match(r.saida, opts.assinatura, "reprovou, mas NAO pela assinatura esperada");
    } finally {
      restaurar(opts.arquivo, a);
      console.log(`        restaurado · ${a.hashAntes.slice(0, 10)} == origem`);
    }
  });
}

console.log("\n=== C3.5 — SUITE ADVERSARIAL DA ESPINHA ===\n");

/* ------------------------------------------------------------------ *
 * 0. CONTROLE POSITIVO — as guardas precisam estar verdes ANTES
 * ------------------------------------------------------------------ */
console.log("0. CONTROLE POSITIVO");
for (const g of [GUARDA_ESPINHA, GUARDA_TOPOLOGIA, GUARDA_COPILOTO]) {
  teste(`controle: ${g} verde antes das mutacoes`, () => {
    const r = rodar(g);
    assert.ok(r.ok, `guarda ja vermelha antes de qualquer mutacao:\n${r.saida.slice(-600)}`);
  });
}
if (falhas.length) {
  console.error("\nAs guardas precisam estar verdes ANTES das mutacoes. Abortado.");
  for (const f of falhas) console.error(`  ${f}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * 1. A INTELIGÊNCIA NÃO DERRUBA A RUA
 * ------------------------------------------------------------------ */
console.log("\n1. A INTELIGENCIA NAO DERRUBA A RUA");

mutacao({
  id: "MS1",
  propriedade: "exceção da espinha não escapa para o laço do worker",
  arquivo: "src/platform/runtime/intelligence-spine.ts",
  de: "            quebrou = true;",
  para: "            if (err) throw err;\n            quebrou = true;",
  guarda: GUARDA_ESPINHA,
  // MEDIDO: a exceção não escapa de `executar()` — o anteparo externo a pega.
  // O que se perde é o NOME do escopo e a continuidade do laço. É por aí que
  // a propriedade morre, e é por aí que a guarda tem que acusar.
  assinatura: /C3\.3-(5|7)/,
});

mutacao({
  id: "MS2",
  propriedade: "fato já processado não é reclassificado por erro secundário",
  arquivo: "src/platform/runtime/intelligence-spine.ts",
  de: "        estado.ultimo_erro = { classe: classeDe(e), escopo: \"passada\", em };",
  para: "        estado.ultimo_erro = { classe: classeDe(e), escopo: \"passada\", em };\n        throw e;",
  guarda: GUARDA_ESPINHA,
  assinatura: /C3\.3-12/,
});

mutacao({
  id: "MS3",
  propriedade: "a falha fica observável — contada como falha, não como passada boa",
  arquivo: "src/platform/runtime/intelligence-spine.ts",
  de: "        if (quebrou) estado.falhas++;\n        else estado.passadas++;",
  para: "        estado.passadas++;\n        void quebrou;",
  guarda: GUARDA_ESPINHA,
  assinatura: /C3\.3-5/,
});

mutacao({
  id: "MS4",
  propriedade: "a mensagem do erro não vaza — só a classe atravessa",
  arquivo: "src/platform/runtime/intelligence-spine.ts",
  de: "    return e instanceof Error && e.constructor?.name ? e.constructor.name : \"Error\";",
  para: "    return e instanceof Error ? e.message : \"Error\";",
  guarda: GUARDA_ESPINHA,
  assinatura: /C3\.3-(5|6)/,
});

mutacao({
  id: "MS5",
  propriedade: "um escopo que quebra não impede os outros",
  arquivo: "src/platform/runtime/intelligence-spine.ts",
  // Mutação SINTATICAMENTE VÁLIDA de propósito: a primeira versão removia o
  // `try` e deixava um `catch` órfão, e o guarda morria de erro de sintaxe.
  // Guarda que não compila não é guarda acusando — é o mesmo falso verde que
  // `__SPAWN_FALHOU__` existe para pegar, com outra roupa.
  de: "            quebrou = true;\n            estado.ultimo_erro = {",
  para: "            quebrou = true;\n            break;\n            estado.ultimo_erro = {",
  guarda: GUARDA_ESPINHA,
  assinatura: /C3\.3-7/,
});

/* ------------------------------------------------------------------ *
 * 2. A ESPINHA É NÃO CRÍTICA E DESLIGADA POR PADRÃO
 * ------------------------------------------------------------------ */
console.log("\n2. NAO CRITICA E DESLIGADA POR PADRAO");

mutacao({
  id: "MS6",
  propriedade: "a flag vem FALSA por padrão",
  arquivo: "src/platform/config/platform-config.ts",
  de: "booleano(env, \"DELIVERYOS_INTELLIGENCE_SPINE\", false)",
  para: "booleano(env, \"DELIVERYOS_INTELLIGENCE_SPINE\", true)",
  guarda: GUARDA_ESPINHA,
  assinatura: /C3\.3-9/,
});

mutacao({
  id: "MS7",
  propriedade: "a espinha só é montada sob a flag",
  arquivo: "src/platform/bin/async-runtime.ts",
  de: "cfg.spine_enabled ? montarEspinhaDeInteligencia({ ponte: ponteOperacaoViva }) : null",
  para: "montarEspinhaDeInteligencia({ ponte: ponteOperacaoViva })",
  guarda: GUARDA_ESPINHA,
  assinatura: /C3\.3-11/,
});

mutacao({
  id: "MS8",
  propriedade: "inteligência FORA do caminho crítico",
  arquivo: "src/platform/bin/critical.ts",
  de: "import { CriticalRuntime } from \"../runtime/critical\";",
  para:
    "import { CriticalRuntime } from \"../runtime/critical\";\n" +
    "import { montarEspinhaDeInteligencia } from \"../runtime/intelligence-spine\";\n" +
    "void montarEspinhaDeInteligencia;",
  guarda: GUARDA_TOPOLOGIA,
  assinatura: /INTELIG[ÊE]NCIA NO CAMINHO CR[ÍI]TICO/,
});

mutacao({
  id: "MS9",
  propriedade: "o crítico não conhece a espinha nem por nome",
  arquivo: "src/platform/bin/critical.ts",
  de: "import { CriticalRuntime } from \"../runtime/critical\";",
  para:
    "import { CriticalRuntime } from \"../runtime/critical\";\n" +
    "import { montarEspinhaDeInteligencia } from \"../runtime/intelligence-spine\";\n" +
    "void montarEspinhaDeInteligencia;",
  guarda: GUARDA_ESPINHA,
  assinatura: /C3\.3-8/,
});

/* ------------------------------------------------------------------ *
 * 3. SOURCE_MODE NÃO CRUZA MODOS
 * ------------------------------------------------------------------ */
console.log("\n3. SOURCE_MODE NAO CRUZA MODOS");

mutacao({
  id: "MS10",
  propriedade: "cada escopo recebe o SEU modo, nunca um fixo",
  arquivo: "src/platform/runtime/intelligence-spine.ts",
  de: "        lerProjecao: () => o.ponte.projecao({ agora, unit_id, source_mode }),\n        source_mode,",
  para: "        lerProjecao: () => o.ponte.projecao({ agora, unit_id, source_mode }),\n        source_mode: \"real\" as SourceMode,",
  guarda: GUARDA_ESPINHA,
  assinatura: /C3\.4-3/,
});

mutacao({
  id: "MS11",
  propriedade: "o escopo da memória carrega o modo",
  arquivo: "src/platform/projections/consumidor.ts",
  de: "        source_mode: chave.slice(corte + 1) as SourceMode,",
  para: "        source_mode: \"real\" as SourceMode,",
  guarda: GUARDA_ESPINHA,
  assinatura: /C3\.4-(3|4)/,
});

mutacao({
  id: "MS12",
  propriedade: "o run_id separa os modos — dois escopos nunca compartilham identidade",
  arquivo: "src/platform/runtime/intelligence-spine.ts",
  de: "    const run_id = M.adapter.runIdDe(unit_id, source_mode);",
  para: "    const run_id = M.adapter.runIdDe(unit_id, \"real\");",
  guarda: GUARDA_ESPINHA,
  assinatura: /C3\.4-4/,
});

/* ------------------------------------------------------------------ *
 * 4. CONCLUSÃO SEM EVIDÊNCIA NÃO VIRA RECOMENDAÇÃO
 * ------------------------------------------------------------------ */
console.log("\n4. CONCLUSAO SEM EVIDENCIA NAO VIRA RECOMENDACAO");

mutacao({
  id: "MS13",
  propriedade: "conclusão sem evidência é insuficiente, nunca sustentada",
  arquivo: "src/platform/copiloto/conference-bridge.ts",
  de: "  if (c.evidence.length === 0) return \"insuficiente\";",
  para: "  if (c.evidence.length === 0) return \"sustentada\";",
  guarda: GUARDA_COPILOTO,
  assinatura: /evid[êe]ncia|insuficiente|FALHAR/i,
});

mutacao({
  id: "MS14",
  propriedade: "recomendação de PEDIDO exige autorização para afirmar",
  arquivo: "src/platform/copiloto/conference-bridge.ts",
  de: "  if (escopo === \"pedido\" && !c.pode_afirmar) return \"insuficiente\";",
  para: "  if (escopo === \"pedido\" && !c.pode_afirmar) return \"sustentada\";",
  guarda: GUARDA_ESPINHA,
  assinatura: /C3\.4-9/,
});

/* ------------------------------------------------------------------ *
 * 5. AUSÊNCIA NÃO VIRA PEDIDO INFERIDO
 * ------------------------------------------------------------------ */
console.log("\n5. AUSENCIA NAO VIRA PEDIDO INFERIDO");

mutacao({
  id: "MS15",
  propriedade: "saúde da fonte não passa por recomendação de pedido",
  arquivo: "src/platform/runtime/intelligence-spine.ts",
  de: "        (r) => r.escopo === \"pedido\" && r.status === \"proposed\",",
  para: "        (r) => r.escopo === \"nao_existe\" && r.status === \"proposed\",",
  guarda: GUARDA_ESPINHA,
  // Acusada pelo CONTROLE POSITIVO, não pelo teste que espera zero: um
  // contador quebrado dá zero do mesmo jeito. Foi esta suíte que descobriu.
  assinatura: /C3\.4-8/,
});

/* ------------------------------------------------------------------ *
 * 6. A LEITURA VIGENTE É LIMITADA — O HISTÓRICO NÃO VIRA RECOMENDAÇÃO
 * ------------------------------------------------------------------ */
console.log("\n6. HISTORICO NAO VIRA RECOMENDACAO");

mutacao({
  id: "MS16",
  propriedade: "só o ciclo mais recente vale como condição de agora",
  arquivo: "src/platform/runtime/intelligence-spine.ts",
  de: "    const vigente = saude.length ? [saude[saude.length - 1]] : [];",
  para: "    const vigente = saude;",
  guarda: GUARDA_ESPINHA,
  assinatura: /C3\.4-(1|2|2b)/,
});

mutacao({
  id: "MS17",
  propriedade: "o corte é contável — `conclusoes_vigentes` não pode mentir",
  arquivo: "src/platform/runtime/intelligence-spine.ts",
  de: "      vigentes: vigentes.length,",
  para: "      vigentes: extraido.conclusoes.length,",
  guarda: GUARDA_ESPINHA,
  assinatura: /C3\.4-2b/,
});

/* ------------------------------------------------------------------ *
 * 7. AS PERGUNTAS ABERTAS CONTINUAM ABERTAS
 * ------------------------------------------------------------------ */
console.log("\n7. Q-003 E Q-004 CONTINUAM ABERTAS");

mutacao({
  id: "MS18",
  propriedade: "Q-003: a espinha não liga o motor de decisão ao Copiloto",
  arquivo: "src/platform/runtime/intelligence-spine.ts",
  de: "const req = createRequire(join(__dirname, \"intelligence-spine.js\"));",
  para:
    "const req = createRequire(join(__dirname, \"intelligence-spine.js\"));\n" +
    "const DECISAO = \"../../perfil-delivery/decisao.js\";\nvoid DECISAO;",
  guarda: GUARDA_ESPINHA,
  assinatura: /C3\.5-G1/,
});

mutacao({
  id: "MS19",
  propriedade: "Q-004: conversation-crm continua sem wiring no runtime",
  arquivo: "src/platform/bin/async-runtime.ts",
  de: "function dormir(ms: number): Promise<void> {",
  para: "const CRM = \"conversation-crm\";\nvoid CRM;\n\nfunction dormir(ms: number): Promise<void> {",
  guarda: GUARDA_ESPINHA,
  assinatura: /C3\.5-G2/,
});

/* ------------------------------------------------------------------ *
 * 8. SOMBRA NÃO TEM MEIO DE AGIR
 * ------------------------------------------------------------------ */
console.log("\n8. SOMBRA NAO TEM MEIO DE AGIR");

mutacao({
  id: "MS20",
  propriedade: "a espinha não ganha meio de executar efeito externo",
  arquivo: "src/platform/runtime/intelligence-spine.ts",
  de: "import { createRequire } from \"node:module\";",
  para: "import { createRequire } from \"node:module\";\nimport { spawn } from \"node:child_process\";\nvoid spawn;",
  guarda: GUARDA_ESPINHA,
  assinatura: /C3\.5-G3/,
});

mutacao({
  id: "MS21",
  propriedade: "a espinha não cria artefato durável por conta própria",
  arquivo: "src/platform/runtime/intelligence-spine.ts",
  de: "      const store = M.store.createStore({ memoryOnly: true });",
  para: "      const store = M.store.createStore({ memoryOnly: false });",
  guarda: GUARDA_ESPINHA,
  assinatura: /C3\.5-G4/,
});

/* ------------------------------------------------------------------ *
 * 9. A PRÓPRIA AUDITORIA DE TOPOLOGIA NÃO PODE SER CEGA
 * ------------------------------------------------------------------ */
console.log("\n9. A AUDITORIA NAO PODE SER CEGA");

teste("MS22 — CONTROLE NEGATIVO: a topologia acusa quando a espinha sai do worker", () => {
  // Não é mutação de propriedade: é mutação da MEDIDA. Se a auditoria
  // continuasse verde com a espinha desligada do worker, ela não estaria
  // medindo nada — seria decoração com cara de prova.
  const a = aplicar(
    "src/platform/bin/async-runtime.ts",
    "import { montarEspinhaDeInteligencia } from \"../runtime/intelligence-spine\";",
    "",
  );
  assert.ok(a.aplicou, `MUTACAO NAO APLICADA: ${a.motivo}`);
  console.log(`        aplicada · async-runtime.ts · ${a.hashAntes.slice(0, 10)} -> ${a.hashDepois.slice(0, 10)}`);
  try {
    const r = rodar(GUARDA_TOPOLOGIA);
    assert.doesNotMatch(r.saida, /__SPAWN_FALHOU__/, "o guarda nem rodou");
    assert.match(
      r.saida,
      /S[ÓO] TEST HARNESS/,
      "a auditoria continuou vendo as setas no runtime depois de elas sairem — MEDIDA CEGA",
    );
  } finally {
    restaurar("src/platform/bin/async-runtime.ts", a);
    console.log(`        restaurado · ${a.hashAntes.slice(0, 10)} == origem`);
  }
});

/* ------------------------------------------------------------------ *
 * FECHAMENTO
 * ------------------------------------------------------------------ */

const total = passaram + falhas.length;
console.log(`\n${passaram}/${total} · ${cegas} mutacao(oes) cega(s)`);
for (const f of falhas) console.log(`  XX ${f}`);

if (cegas > 0) {
  console.error("\nMUTACAO CEGA — o gate nao protege o que diz proteger.");
  process.exit(1);
}
if (falhas.length) {
  console.error("\nSPINE_MUTATIONS_RED");
  process.exit(1);
}
console.log("\nSPINE_MUTATIONS_GREEN");
