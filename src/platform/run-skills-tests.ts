/**
 * Validação das skills de projeto do DeliveryOS.
 *
 * Uma skill que não carrega é pior que skill nenhuma: ela cria a impressão de
 * que a disciplina está ativa quando não está. Estes testes afirmam que cada
 * arquivo tem a forma que o carregador exige.
 *
 * O gabarito não é inventado: é `tata-product-system`, que JÁ carrega nesta
 * base. Comparar contra o que funciona é mais forte que comparar contra o que
 * a documentação diz — a documentação pode estar velha; o comportamento não.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DIR = join(ROOT, ".claude", "skills");

/** A skill que comprovadamente carrega — o gabarito de forma. */
const GABARITO = "tata-product-system";

/** As seis skills que o Macro-Prompt 2 exige. */
const EXIGIDAS = [
  "deliveryos-architecture-guardrails",
  "deliveryos-execution-loop",
  "deliveryos-evidence-gate",
  "deliveryos-figma-code-sync",
  "deliveryos-release-readiness",
  "deliveryos-adversarial-review",
];

/** As dez seções que o briefing exige de toda skill. */
const SECOES = [
  "Objetivo",
  "Quando usar",
  "Ações permitidas",
  "Ações proibidas",
  "Verificadores",
  "Limite de iterações",
  "Condição de sucesso",
  "Condição de parada",
  "Evidências produzidas",
];

let passed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
  } catch (e) {
    failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function ler(skill: string): string {
  const p = join(DIR, skill, "SKILL.md");
  assert.ok(existsSync(p), `SKILL.md ausente para ${skill}`);
  return readFileSync(p, "utf8");
}

/** Frontmatter YAML mínimo: só o que o carregador realmente usa. */
function frontmatter(texto: string): { name?: string; description?: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texto);
  if (!m) return {};
  const bruto = m[1];
  const out: Record<string, string> = {};
  // `description: >` é bloco dobrado; junta as linhas indentadas seguintes.
  const linhas = bruto.split(/\r?\n/);
  for (let i = 0; i < linhas.length; i += 1) {
    const campo = /^(\w+):\s*(.*)$/.exec(linhas[i]);
    if (!campo) continue;
    const [, chave, valor] = campo;
    if (valor === ">" || valor === "|") {
      const corpo: string[] = [];
      for (let j = i + 1; j < linhas.length && /^\s+\S/.test(linhas[j]); j += 1) {
        corpo.push(linhas[j].trim());
        i = j;
      }
      out[chave] = corpo.join(" ");
    } else {
      out[chave] = valor.trim();
    }
  }
  return out;
}

console.log("=== Skills de projeto do DeliveryOS ===");

test("o diretório de skills existe no formato que esta versão carrega", () => {
  // `.claude/skills/<nome>/SKILL.md`. Não presumir formato antigo: este é o
  // formato do gabarito que está carregando agora.
  assert.ok(existsSync(DIR), ".claude/skills ausente");
  assert.ok(
    existsSync(join(DIR, GABARITO, "SKILL.md")),
    "o gabarito sumiu — sem ele não há prova de qual formato carrega",
  );
});

test("as seis skills exigidas existem", () => {
  const presentes = readdirSync(DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const s of EXIGIDAS) {
    assert.ok(presentes.includes(s), `skill ausente: ${s}`);
  }
});

test("cada skill tem o MESMO formato de frontmatter do gabarito", () => {
  const g = frontmatter(ler(GABARITO));
  assert.ok(g.name && g.description, "o gabarito perdeu name/description");
  for (const s of EXIGIDAS) {
    const f = frontmatter(ler(s));
    assert.ok(f.name, `${s}: frontmatter sem name`);
    assert.ok(f.description, `${s}: frontmatter sem description`);
  }
});

test("o name do frontmatter bate com o nome do diretório", () => {
  // Divergência aqui faz a skill carregar com outro nome e nunca ser
  // encontrada por quem a invoca.
  for (const s of EXIGIDAS) {
    assert.equal(frontmatter(ler(s)).name, s, `${s}: name divergente do diretório`);
  }
});

test("a description diz QUANDO usar, não só o que é", () => {
  // Description sem gatilho não é acionada: o modelo não sabe reconhecer a
  // situação. É a diferença entre uma skill que existe e uma que atua.
  for (const s of EXIGIDAS) {
    const d = frontmatter(ler(s)).description ?? "";
    assert.ok(d.length >= 80, `${s}: description curta demais (${d.length})`);
    assert.match(d, /\buse\b/i, `${s}: description não diz quando usar`);
  }
});

test("cada skill traz as nove seções obrigatórias", () => {
  for (const s of EXIGIDAS) {
    const texto = ler(s);
    for (const secao of SECOES) {
      assert.match(
        texto,
        new RegExp(`^#{2,3} .*${secao}`, "im"),
        `${s}: falta a seção "${secao}"`,
      );
    }
  }
});

test("cada skill declara um limite de iterações NUMÉRICO", () => {
  // "iterar até resolver" não é limite. Sem número, não há condição de saída.
  const numeros = /\b(um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|\d+)\b/i;
  for (const s of EXIGIDAS) {
    const texto = ler(s);
    const m = /^#{2,3} .*Limite de itera[çc][õo]es\s*$([\s\S]*?)(?=^#{2,3} |\Z)/im.exec(texto);
    assert.ok(m, `${s}: seção de limite não encontrada`);
    assert.match(m[1], numeros, `${s}: limite sem número`);
  }
});

test("cada skill nomeia ao menos um verificador executável", () => {
  // Verificador que não é comando é opinião.
  for (const s of EXIGIDAS) {
    const texto = ler(s);
    const m = /^#{2,3} .*Verificadores\s*$([\s\S]*?)(?=^#{2,3} |\Z)/im.exec(texto);
    assert.ok(m, `${s}: seção de verificadores não encontrada`);
    assert.match(
      m[1],
      /(npm run|node |git |```)/,
      `${s}: verificadores sem comando executável`,
    );
  }
});

test("as skills de guardrail citam os limites que existem no código", () => {
  // Uma skill que cita uma regra inexistente ensina errado.
  const g = ler("deliveryos-architecture-guardrails");
  for (const termo of ["/ready", "outbox", "append-only", "lease", "source_mode"]) {
    assert.ok(g.includes(termo), `guardrails não menciona ${termo}`);
  }
  // E os comandos citados precisam existir de fato no package.json.
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  for (const cmd of ["test:platform", "test:platform:repos", "test:entregas:android"]) {
    assert.ok(pkg.scripts[cmd], `guardrails cita script inexistente: ${cmd}`);
  }
});

test("a skill do Figma aponta para o arquivo oficial e as três páginas", () => {
  const f = ler("deliveryos-figma-code-sync");
  assert.ok(f.includes("IMWH8ZKMF5ra3QJYiR6vGa"), "fileKey oficial ausente");
  for (const pagina of ["00 — Overview", "01 — Design System", "02 — Product Flows"]) {
    assert.ok(f.includes(pagina), `página ausente: ${pagina}`);
  }
});

test("nenhuma skill promete ação proibida pelo contrato", () => {
  // Kubernetes, Kafka e afins só podem aparecer na LISTA DE PROIBIÇÃO.
  const proibidas = ["Kubernetes", "Kafka", "RabbitMQ"];
  for (const s of EXIGIDAS) {
    const texto = ler(s);
    for (const p of proibidas) {
      if (!texto.includes(p)) continue;
      const linha = texto.split("\n").find((l) => l.includes(p)) ?? "";
      assert.match(
        linha,
        /proibid|nunca|não |Kubernetes ·/i,
        `${s}: menciona ${p} fora de contexto de proibição`,
      );
    }
  }
});

test("o CLAUDE.md aponta para as skills", () => {
  // Skill que ninguém sabe que existe não é usada.
  const claude = readFileSync(join(ROOT, "CLAUDE.md"), "utf8");
  assert.ok(
    claude.includes(".claude/skills") || claude.includes("deliveryos-execution-loop"),
    "CLAUDE.md não aponta para as skills",
  );
});

if (failures.length) {
  console.error(`\n=== ${failures.length} FALHA(S) ===`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`\n=== ${passed} skills tests OK ===`);
