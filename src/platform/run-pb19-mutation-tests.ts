/**
 * PB19 — SUÍTE ADVERSARIAL DOS DEFEITOS DE IMPLANTAÇÃO.
 *
 * Para cada defeito fechado (D1, D2, D3a, D3b), uma mutação **restaura o
 * defeito** no disco e exige que o gate acuse — pela assinatura certa, não por
 * acaso. Zero mutações cegas.
 *
 * As três recusas herdadas de `run-spine-mutation-tests.ts` valem aqui igual:
 * mutação que não entrou no disco não conta; guarda que nem rodou não conta;
 * e reprovar por outro motivo significa que a propriedade não estava sendo
 * defendida.
 *
 * Nenhuma mutação procura palavra. Todas trocam **comportamento**, **contrato**
 * ou **estrutura declarada** — o erro que o PB19 corrigiu nas guardas do C3 não
 * se repete aqui.
 *
 * Exige `DELIVERYOS_PG_URL`, porque o gate que elas atacam sobe processo real.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
const falhas: string[] = [];
let passaram = 0;
let cegas = 0;

console.log("\n=== PB19 — SUITE ADVERSARIAL DE IMPLANTACAO ===\n");

if (!(process.env.DELIVERYOS_PG_URL ?? "").trim()) {
  console.log("PULADO: DELIVERYOS_PG_URL não definida — o gate atacado sobe processo real.");
  process.exit(0);
}

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

const GATE = "src/platform/run-pb19-deploy-tests.ts";

/**
 * Roda o gate. Precisa de `tsx` e do `dist` reconstruído — o gate lê o
 * artefato, e é essa a propriedade dele.
 */
function rodarGate(): { ok: boolean; saida: string } {
  try {
    // `dist` é APAGADO antes de cada build. Sem isso, uma mutação que remove
    // um passo de cópia fica cega: o asset continua lá, sobrando do build
    // anterior, e o gate confere presença sem nunca perguntar quem a produziu.
    // Foi exatamente o que aconteceu com MP3 na primeira execução.
    rmSync(join(raiz, "dist"), { recursive: true, force: true });
    execFileSync("npm", ["run", "build:platform"], { cwd: raiz, encoding: "utf8", timeout: 600_000 });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    // Mutação que quebra o BUILD também é acusação válida — desde que o
    // motivo apareça. Um build que morre sem dizer nada é falha de ambiente.
    return { ok: false, saida: `__BUILD__${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
  try {
    const saida = execFileSync("npx", ["tsx", GATE], {
      cwd: raiz,
      encoding: "utf8",
      timeout: 900_000,
      env: { ...process.env },
    });
    return { ok: true, saida };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: string };
    const saida = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    if (saida.trim() === "") return { ok: false, saida: `__SPAWN_FALHOU__ ${err.code ?? "?"}` };
    return { ok: false, saida };
  }
}

interface Aplicacao {
  aplicou: boolean;
  motivo: string;
  original: string;
  hashAntes: string;
}

function aplicar(rel: string, de: string, para: string): Aplicacao {
  const caminho = join(raiz, rel);
  const original = readFileSync(caminho, "utf8");
  const hashAntes = sha(original);
  if (!original.includes(de)) {
    return { aplicou: false, motivo: `ancora nao encontrada em ${rel}`, original, hashAntes };
  }
  const mutado = original.replace(de, () => para);
  if (mutado === original) return { aplicou: false, motivo: "a troca nao mudou nada", original, hashAntes };
  writeFileSync(caminho, mutado);
  const noDisco = readFileSync(caminho, "utf8");
  if (sha(noDisco) === hashAntes || !noDisco.includes(para)) {
    writeFileSync(caminho, original);
    return { aplicou: false, motivo: "escrita feita, disco nao confirmou", original, hashAntes };
  }
  return { aplicou: true, motivo: "", original, hashAntes };
}

function restaurar(rel: string, a: Aplicacao): void {
  writeFileSync(join(raiz, rel), a.original);
  assert.equal(
    sha(readFileSync(join(raiz, rel), "utf8")),
    a.hashAntes,
    `RESTAURACAO FALHOU em ${rel} — o repositorio ficou mutado`,
  );
}

function mutacao(o: { id: string; propriedade: string; arquivo: string; de: string; para: string; assinatura: RegExp }): void {
  teste(`${o.id} — ${o.propriedade}`, () => {
    const a = aplicar(o.arquivo, o.de, o.para);
    assert.ok(a.aplicou, `MUTACAO NAO APLICADA: ${a.motivo}`);
    console.log(`        aplicada · ${o.arquivo} · ${a.hashAntes.slice(0, 10)}`);
    try {
      const r = rodarGate();
      assert.doesNotMatch(r.saida, /__SPAWN_FALHOU__/, "o gate nem rodou — falha de ambiente");
      if (r.ok) {
        cegas += 1;
        assert.fail("o gate ficou VERDE com o defeito restaurado — MUTACAO CEGA");
      }
      assert.match(r.saida, o.assinatura, "reprovou, mas NAO pela assinatura esperada");
    } finally {
      restaurar(o.arquivo, a);
      console.log(`        restaurado · ${a.hashAntes.slice(0, 10)} == origem`);
    }
  });
}

/* ---- controle positivo: o gate precisa estar verde ANTES ---- */
console.log("0. CONTROLE POSITIVO");
teste("o gate PB19 está verde antes de qualquer mutação", () => {
  const r = rodarGate();
  assert.ok(r.ok, `gate já vermelho antes de mutar:\n${r.saida.slice(-800)}`);
});
if (falhas.length) {
  console.error("\nO gate precisa estar verde ANTES das mutacoes. Abortado.");
  for (const f of falhas) console.error(`  ${f}`);
  process.exit(1);
}

/* ---- D3b ---- */
console.log("\n1. D3b — ASSET OBRIGATORIO");

mutacao({
  id: "MP1",
  propriedade: "a resolução do contrato volta a depender do diretório de trabalho",
  arquivo: "src/platform/contracts/event-schema.ts",
  de: 'export const RAIZ_DOS_CONTRATOS = join(__dirname, "..", "..", "..");',
  para: "export const RAIZ_DOS_CONTRATOS = process.cwd();",
  assinatura: /D3b-2|não resolveu a partir do módulo|D3b-3/,
});

mutacao({
  id: "MP2",
  propriedade: "o crítico volta a subir sem conferir o contrato",
  arquivo: "src/platform/bin/critical.ts",
  de: "    const catalogo = carregarCatalogo();",
  para: "    const catalogo = { version: 'ignorado', $defs: {} } as ReturnType<typeof carregarCatalogo>;",
  assinatura: /D3b-4/,
});

mutacao({
  id: "MP3",
  propriedade: "o contrato deixa de ser copiado para o artefato",
  arquivo: "package.json",
  de: " && node tools/copiar_contratos.js",
  para: "",
  assinatura: /D3b-1|D3a-4|__BUILD__/,
});

mutacao({
  id: "MP4",
  propriedade: "o .dockerignore volta a excluir docs/contracts do contexto",
  arquivo: ".dockerignore",
  de: "!docs/contracts",
  para: "# !docs/contracts",
  assinatura: /D3b-6/,
});

mutacao({
  id: "MP5",
  propriedade: "o Dockerfile volta a não copiar o contrato",
  arquivo: "deploy/Dockerfile.platform",
  de: "COPY docs/contracts ./docs/contracts",
  para: "COPY docs ./docs",
  assinatura: /D3b-5/,
});

/* ---- D2 ---- */
console.log("\n2. D2 — SEGREDO DE APARELHO");

mutacao({
  id: "MP6",
  propriedade: "o compose deixa de EXIGIR o segredo",
  arquivo: "deploy/compose.platform.yaml",
  de: "${DELIVERYOS_DEVICE_TOKEN_SECRET:?segredo dos tokens de aparelho obrigatorio}",
  para: "${DELIVERYOS_DEVICE_TOKEN_SECRET:-}",
  assinatura: /D2-1/,
});

mutacao({
  id: "MP7",
  propriedade: "o segredo vaza para serviços que não precisam dele",
  arquivo: "deploy/compose.platform.yaml",
  de: "  DELIVERYOS_MIGRATE_ON_BOOT: \"false\"",
  para: "  DELIVERYOS_MIGRATE_ON_BOOT: \"false\"\n  DELIVERYOS_DEVICE_TOKEN_SECRET: ${DELIVERYOS_DEVICE_TOKEN_SECRET:?x}",
  assinatura: /D2-2/,
});

/* ---- D1 ---- */
console.log("\n3. D1 — FRONTEIRA DE REDE");

mutacao({
  id: "MP8",
  propriedade: "a declaração de host privado vira regra larga (sufixo)",
  arquivo: "src/platform/persistence/sql-client.ts",
  de: "  return hostnameDe(url) === declarado;",
  para: "  return hostnameDe(url).includes(declarado);",
  assinatura: /D1-6/,
});

mutacao({
  id: "MP9",
  propriedade: "declarar o host passa a desligar TLS sozinho",
  arquivo: "src/platform/config/platform-config.ts",
  de: '  const database_ssl = booleano(env, "DELIVERYOS_DATABASE_SSL", !isLocalUrl(database_url));',
  para: '  const database_ssl = booleano(env, "DELIVERYOS_DATABASE_SSL", !dispensadoDeTls(database_url, database_private_host));',
  assinatura: /D1-4/,
});

mutacao({
  id: "MP10",
  propriedade: "o compose deixa de declarar o host privado",
  arquivo: "deploy/compose.platform.yaml",
  de: "  DELIVERYOS_DATABASE_PRIVATE_HOST: deliveryos-postgres",
  para: "  DELIVERYOS_DATABASE_PRIVATE_HOST: \"\"",
  assinatura: /D1-7/,
});

/* ---- D3a ---- */
console.log("\n4. D3a — COERENCIA DE BUILD");

mutacao({
  id: "MP11",
  propriedade: "o carimbador volta a executar ao ser importado",
  arquivo: "tools/carimbar_build.js",
  de: "if (require.main === module) principal();",
  para: "principal();",
  assinatura: /D3a-3b/,
});

mutacao({
  id: "MP12",
  propriedade: "o artefato deixa de carregar identidade de commit",
  arquivo: "tools/carimbar_build.js",
  de: "  commit: commit(),",
  para: "  commit: null,",
  assinatura: /D3a-1/,
});

mutacao({
  id: "MP13",
  propriedade: "os runtimes deixam de esperar a migration terminar",
  arquivo: "deploy/compose.platform.yaml",
  de: "      deliveryos-migrate:\n        condition: service_completed_successfully\n    environment:\n      <<: *ambiente\n      DELIVERYOS_HOST: 0.0.0.0",
  para: "    environment:\n      <<: *ambiente\n      DELIVERYOS_HOST: 0.0.0.0",
  assinatura: /D3a-5/,
});

/* ---- fechamento ---- */
const total = passaram + falhas.length;
console.log(`\n${passaram}/${total} · ${cegas} mutacao(oes) cega(s)`);
for (const f of falhas) console.log(`  XX ${f}`);

if (cegas > 0) {
  console.error("\nMUTACAO CEGA — o gate nao protege o que diz proteger.");
  process.exit(1);
}
if (falhas.length) {
  console.error("\nPB19_MUTATIONS_RED");
  process.exit(1);
}
console.log("\nPB19_MUTATIONS_GREEN");
