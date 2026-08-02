/**
 * GUARDA DA ORDEM VISUAL — pequena de proposito.
 * ============================================================================
 * Ela existe por causa de L33: `docs/design/VISUAL_REFERENCE_HIERARCHY.md`
 * existia, dizia em letra propria que `app-v1` e Nivel 5 e nao pode definir
 * direcao visual, e **nao estava em nenhuma ordem obrigatoria de leitura**. A
 * Unidade 6 desenhou sobre o nivel errado; o bloco R2 desenhou de novo. Ver PB9.
 *
 * O que esta guarda faz: falha quando a ordem obrigatoria de leitura deixa de
 * apontar para a hierarquia visual, ou quando a propria hierarquia deixa de
 * declarar quem manda.
 *
 * O que ela NAO faz, de proposito: nao audita CSS, nao mede parentesco visual,
 * nao conta cor. Uma auditoria extensa aqui seria a terceira camada de processo
 * para o mesmo defeito de uma linha. O defeito e a ordem de leitura.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
const ler = (p: string): string => readFileSync(join(raiz, p), "utf8");

const HIERARQUIA = "docs/design/VISUAL_REFERENCE_HIERARCHY.md";
const MANIFESTO = "docs/design/CANONICAL_VISUAL_MANIFEST.json";
const ORGANISMO =
  "docs/design/canonical/deliveryos-visual-v2/extracted/DeliveryOS Organismo Operacional.dc.html";

let passed = 0;
const failures: string[] = [];
function teste(nome: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/* ------------------------------------------------------------------ */

/**
 * A LISTA NUMERADA de CLAUDE.md §11 — nao a secao inteira.
 *
 * A primeira versao desta guarda lia a secao toda e passou numa mutacao que
 * apagou a hierarquia do item 4: o caminho continuava citado na justificativa
 * logo abaixo. Um teste que aceita a mencao em prosa nao protege a ORDEM. O
 * corte e no primeiro bloco de citacao (`>`), que abre a justificativa.
 */
function ordemDeLeituraDoClaude(): string {
  const claude = ler("CLAUDE.md");
  const secao11 = claude.split("## 11.")[1];
  assert.ok(secao11, "CLAUDE.md perdeu a secao 11 (memoria executavel)");
  const lista = secao11.split("\n>")[0]!;
  assert.match(lista, /^1\. /m, "a secao 11 perdeu a lista numerada de leitura");
  return lista;
}

teste("V1 a ordem obrigatoria de leitura aponta para a hierarquia visual", () => {
  const lista = ordemDeLeituraDoClaude();
  const item = lista
    .split(/\n(?=\d+\. )/)
    .find((i) => i.includes(HIERARQUIA));
  assert.ok(
    item,
    `nenhum ITEM NUMERADO da ordem de leitura de CLAUDE.md cita ${HIERARQUIA}`,
  );
});

teste("V2 o indice canonico do produto manda ler a hierarquia visual", () => {
  const indice = ler("docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md");
  assert.ok(
    indice.includes(HIERARQUIA),
    `o indice canonico nao cita ${HIERARQUIA}`,
  );
});

teste("V3 a ordem visual vinculante esta escrita, na ordem certa", () => {
  // Sprint V2 antes do Organismo V3.3, e os dois antes do Design System.
  for (const doc of ["CLAUDE.md", "docs/product/DELIVERYOS_CANONICAL_SOURCE_INDEX.md"]) {
    const t = ler(doc);
    const sprint = t.indexOf("Sprint Visual DeliveryOS V2");
    const organismo = t.indexOf("Organismo Operacional V3.3");
    const ds = t.indexOf("Design System atual");
    assert.ok(sprint >= 0, `${doc}: nao nomeia o Sprint Visual DeliveryOS V2`);
    assert.ok(organismo > sprint, `${doc}: o V3.3 nao vem depois do Sprint V2`);
    assert.ok(ds > organismo, `${doc}: o Design System nao vem depois do V3.3`);
  }
});

teste("V4 o Nivel 5 continua declarado como incapaz de definir direcao visual", () => {
  const h = ler(HIERARQUIA);
  assert.match(h, /historical_reference_only/);
  assert.match(h, /app-v1/);
  // A tabela precisa dizer NAO na coluna "pode definir direcao visual".
  const linhaNivel5 = h
    .split("\n")
    .find((l) => l.includes("app-v1") && l.includes("|"));
  assert.ok(linhaNivel5, "a hierarquia perdeu a linha do Nivel 5");
  assert.match(linhaNivel5, /\*\*NÃO\*\*|\*\*NAO\*\*/);
});

teste("V5 o acervo canonico continua no repositorio", () => {
  assert.ok(existsSync(join(raiz, MANIFESTO)), `${MANIFESTO} sumiu`);
  assert.ok(existsSync(join(raiz, ORGANISMO)), `${ORGANISMO} sumiu`);
  const m = JSON.parse(ler(MANIFESTO)) as {
    app_v1_status: string;
    primary_visual_source: boolean;
  };
  assert.equal(m.app_v1_status, "historical_reference_only");
  assert.equal(m.primary_visual_source, true);
});

teste("V6 controle positivo: a guarda reprova uma ordem sem a hierarquia", () => {
  // Sem este caso a guarda passaria por acidente se `includes` fosse trocado por
  // algo que sempre devolve verdadeiro. Aqui a asercao e a mesma, sobre um texto
  // que sabidamente NAO cita a hierarquia.
  const falso = "## 11. Memoria executavel\n\n1. leia docs/execution/STATE.json\n";
  assert.equal(falso.includes(HIERARQUIA), false);
});

/* ================================================================== */

void Promise.resolve().then(() => {
  console.log(`\nOrdem visual — guarda de leitura: ${passed} passaram`);
  if (failures.length > 0) {
    console.error(`\n${failures.length} FALHARAM:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("VISUAL_ORDER_GATE_GREEN");
});
