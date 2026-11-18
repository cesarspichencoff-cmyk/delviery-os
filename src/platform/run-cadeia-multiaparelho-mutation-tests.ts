/**
 * CADEIA MULTIAPARELHO — SUÍTE ADVERSARIAL.
 *
 * Cada mutação devolve um defeito de MISTURA entre aparelhos, motoboys ou
 * viagens, e `run-cadeia-multiaparelho-tests.ts` tem de cair pela propriedade
 * atacada. Mutação que deixa o gate verde é CEGA, e cega é vermelho aqui.
 *
 * Mesma mecânica de `run-cadeia-mutation-tests.ts`: âncora de ocorrência
 * única, `dist/` reconstruído quando o binário carrega o arquivo, restauração
 * conferida por SHA-256. Quem acusa é o gate, executando.
 *
 *   MA1  aparelho que ninguém autorizou recebe sessão
 *   MA2  o token de um envia pontos como o outro
 *   MA3  o segredo de um abre a sessão do outro
 *   MA4  revogar um aparelho não o para (e A2 precisa notar sem confundir com B)
 *   MA5  o reenvio duplica (o cliente troca a chave a cada envio)
 *   MA6  a leitura da viagem devolve pontos de outra viagem
 *   MA7  a projeção funde as duas viagens numa só
 *   MA8  X1 reaberta: a ingestão aceita viagem sem concessão
 *   MA9  X1 reaberta: a concessão de outro aparelho e motoboy passa a valer
 */

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
let passaram = 0;
let cegas = 0;
const falhas: string[] = [];

console.log("\n=== CADEIA MULTIAPARELHO — SUITE ADVERSARIAL ===\n");

if (!(process.env.DELIVERYOS_PG_URL ?? "").trim()) {
  console.log("PULADO: DELIVERYOS_PG_URL não definida — o gate atacado precisa de PostgreSQL real.");
  process.exit(0);
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const GATE = "src/platform/run-cadeia-multiaparelho-tests.ts";

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

/** Pelo shell: no Windows `npm` e `npx` são `.cmd`. Nenhum argumento vem de fora. */
function construir(): void {
  execSync("npm run -s build:platform", { cwd: raiz, encoding: "utf8", timeout: 600_000, stdio: ["ignore", "pipe", "pipe"] });
}

function rodar(): { ok: boolean; saida: string } {
  try {
    const saida = execSync(`npx tsx ${GATE}`, { cwd: raiz, encoding: "utf8", timeout: 900_000, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
    if (/PULAD[OA]/.test(saida)) return { ok: false, saida: `__PULADO__${saida}` };
    return { ok: true, saida };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: string };
    const saida = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    if (!/provas da cadeia multiaparelho|falha inesperada na suíte/.test(saida)) {
      return { ok: false, saida: `__SPAWN_FALHOU__ ${err.code ?? "?"} ${saida.slice(-300)}` };
    }
    return { ok: false, saida };
  }
}

interface Edicao { arquivo: string; de: string; para: string }
interface Aplicada { arquivo: string; original: string; hash: string }

function aplicar(edicoes: readonly Edicao[]): Aplicada[] {
  const feitas: Aplicada[] = [];
  const vistos = new Set<string>();
  try {
    for (const e of edicoes) {
      const caminho = join(raiz, e.arquivo);
      if (!vistos.has(e.arquivo)) {
        const original = readFileSync(caminho, "utf8");
        vistos.add(e.arquivo);
        feitas.push({ arquivo: e.arquivo, original, hash: sha(original) });
      }
      const atual = readFileSync(caminho, "utf8");
      const eol = atual.includes("\r\n") ? "\r\n" : "\n";
      const de = e.de.replace(/\r?\n/g, eol);
      const para = e.para.replace(/\r?\n/g, eol);
      const n = atual.split(de).length - 1;
      assert.equal(n, 1, `MUTACAO NAO APLICADA: âncora com ${n} ocorrência(s) em ${e.arquivo}: ${e.de.slice(0, 70)}`);
      const novo = atual.replace(de, () => para);
      assert.notEqual(novo, atual, `MUTACAO NAO APLICADA: a troca não mudou ${e.arquivo}`);
      writeFileSync(caminho, novo);
      assert.equal(readFileSync(caminho, "utf8"), novo, `MUTACAO NAO APLICADA: o disco não confirmou ${e.arquivo}`);
    }
  } catch (err) {
    restaurar(feitas);
    throw err;
  }
  return feitas;
}

function restaurar(feitas: readonly Aplicada[]): void {
  for (const f of feitas) {
    writeFileSync(join(raiz, f.arquivo), f.original);
    assert.equal(sha(readFileSync(join(raiz, f.arquivo), "utf8")), f.hash, `RESTAURACAO FALHOU em ${f.arquivo}`);
  }
}

/** O binário carrega estes diretórios: mutação neles exige reconstruir `dist/`. */
const NO_BINARIO = /^src\/platform\/(auth|ingest|bin|runtime|persistence|projections|contracts)\//;
/** `MULTI_MUT=MA2,MA6` roda só estas. */
const SOMENTE = (process.env.MULTI_MUT ?? "").split(",").map((x) => x.trim()).filter(Boolean);

function mutacao(o: { id: string; propriedade: string; edicoes: Edicao[]; assinatura: RegExp }): void {
  if (SOMENTE.length && !SOMENTE.includes(o.id)) return;
  teste(`${o.id} — ${o.propriedade}`, () => {
    const feitas = aplicar(o.edicoes);
    const precisaBuild = o.edicoes.some((e) => NO_BINARIO.test(e.arquivo));
    console.log(`        aplicada · ${feitas.map((f) => `${f.arquivo.split("/").pop()} ${f.hash.slice(0, 8)}`).join(" · ")}${precisaBuild ? " · dist/ reconstruído" : ""}`);
    try {
      if (precisaBuild) construir();
      const r = rodar();
      assert.doesNotMatch(r.saida, /__SPAWN_FALHOU__|__PULADO__/, `o gate não mediu:\n${r.saida.slice(0, 600)}`);
      if (r.ok) {
        cegas += 1;
        assert.fail("o gate multiaparelho ficou VERDE com o defeito restaurado — MUTACAO CEGA");
      }
      assert.match(r.saida, o.assinatura, `reprovou, mas NÃO pela assinatura esperada:\n${r.saida.slice(-900)}`);
      const perdas = r.saida.split("\n").filter((l) => /^ {2}XX {2}\S/.test(l)).map((l) => l.trim().slice(4).split(" ")[0]);
      console.log(`        acusaram · ${perdas.join(" ")}`);
    } finally {
      restaurar(feitas);
      if (precisaBuild) construir();
      console.log(`        restaurado · ${feitas.length} arquivo(s) == origem${precisaBuild ? " · dist/ reconstruído" : ""}`);
    }
  });
}

/* ---- controle positivo ---- */
console.log("0. CONTROLE POSITIVO");
teste("dist/ é desta árvore e o gate multiaparelho está verde, sem lacuna aberta (X1 fechada), ANTES de qualquer mutação", () => {
  construir();
  const r = rodar();
  assert.ok(r.ok, `gate já vermelho antes de mutar:\n${r.saida.slice(-900)}`);
  assert.match(r.saida, /CADEIA_MULTIAPARELHO_GREEN\s*$/m);
  assert.doesNotMatch(r.saida, /LACUNA ABERTA/);
});
if (falhas.length) {
  console.error("\nO gate precisa estar verde ANTES das mutacoes. Abortado.");
  process.exit(1);
}

const SESSAO = "src/platform/auth/device-session.ts";
const AUTH = "src/platform/auth/device-auth.ts";
const INGEST = "src/platform/ingest/device-ingest.ts";
const CLIENTE = "src/platform/aparelho-logico.ts";
const LEITURA = "src/platform/leitura/localizacao-de-viagem.ts";
const PROJECAO = "src/platform/projections/operacao-viva.ts";

console.log("\n1. QUEM ENTRA");

mutacao({
  id: "MA1",
  propriedade: "aparelho que ninguém autorizou recebe sessão no meio dos outros",
  edicoes: [{
    arquivo: SESSAO,
    de: `  if (!dispositivo) return recusar("dispositivo_desconhecido");\n`,
    para:
      `  if (!dispositivo) {\n` +
      `    const f = emitirToken({ device_id, unit_id: "SEM-CADASTRO", issued_by: EMISSOR_POR_VINCULO, agora: o.agora, segredo: o.segredo_de_assinatura });\n` +
      `    return { ok: true, token: f.token, claims: f.claims, expires_in_s: f.claims.exp - f.claims.iat, vinculou_agora: false, dispositivo: { device_id, unit_id: "SEM-CADASTRO", revoked_at: null } };\n` +
      `  }\n`,
  }],
  assinatura: /XX {2}M2 /,
});

mutacao({
  id: "MA3",
  propriedade: "o segredo de um aparelho abre a sessão do outro",
  edicoes: [{
    arquivo: SESSAO,
    de: `  if (!mesmoHash(dispositivo.secret_hash, hash)) {\n`,
    para: `  if (hash === "nunca") {\n`,
  }],
  assinatura: /XX {2}I2 /,
});

console.log("\n2. QUEM ESCREVE ONDE");

mutacao({
  id: "MA2",
  propriedade: "o token de um aparelho envia pontos como o outro",
  edicoes: [{
    arquivo: INGEST,
    de: `    if (bruto.device_id !== dispositivo.device_id) {\n`,
    para: `    if (bruto.device_id === "nunca") {\n`,
  }],
  assinatura: /XX {2}I1 /,
});

mutacao({
  id: "MA4",
  propriedade: "revogar um aparelho não o para (as duas camadas derrubadas)",
  edicoes: [
    { arquivo: AUTH, de: `  if (dispositivo.revoked_at) {\n`, para: `  if (dispositivo.revoked_at === "nunca") {\n` },
    { arquivo: INGEST, de: `  if (dispositivo.revoked_at) {\n`, para: `  if (dispositivo.revoked_at === "nunca") {\n` },
  ],
  assinatura: /XX {2}A2 /,
});

mutacao({
  id: "MA5",
  propriedade: "o reenvio simultâneo duplica — o cliente troca a chave a cada envio",
  edicoes: [{ arquivo: CLIENTE, de: `        idempotency_key: p.idempotencyKey,\n`, para: `        idempotency_key: \`\${p.idempotencyKey}:\${correlationId}\`,\n` }],
  assinatura: /XX {2}R3 /,
});

console.log("\n3. QUEM APARECE ONDE");

mutacao({
  id: "MA6",
  propriedade: "a leitura da viagem devolve pontos de outra viagem",
  edicoes: [{ arquivo: LEITURA, de: `          AND object_id = $2\n`, para: `          AND $2::text IS NOT NULL\n` }],
  assinatura: /XX {2}S2 /,
});

mutacao({
  id: "MA7",
  propriedade: "a projeção funde as duas viagens numa só",
  edicoes: [{ arquivo: PROJECAO, de: `    const tripId = ev.trip_id;\n`, para: `    const tripId = ev.trip_id ? "uma-viagem-so" : ev.trip_id;\n` }],
  assinatura: /XX {2}S3 [\s\S]*XX {2}A1 /,
});

console.log("\n4. X1 — A POSSE DA VIAGEM NA INGESTÃO");

// Antes um controle da lacuna; agora a correção existe e estas mutações a desfazem.
mutacao({
  id: "MA8",
  propriedade: "a ingestão aceita a viagem de outro motoboy sem concessão (X1 reaberta)",
  edicoes: [{
    arquivo: INGEST,
    de: `    const daViagem = concessoes.get(bruto.trip_id);
`,
    para: `    const daViagem = concessoes.get(bruto.trip_id) ?? [{ window_start: 0, window_end: 9e9 } as never];
`,
  }],
  assinatura: /XX {2}X1 /,
});

mutacao({
  id: "MA9",
  propriedade: "a concessão vale para outro aparelho e outro motoboy (X1 reaberta pela concessão vazada)",
  edicoes: [{
    arquivo: INGEST,
    de: `        !dispositivo.actor_id || c.actor_id !== dispositivo.actor_id) continue;
`,
    para: `        !dispositivo.actor_id) continue;
`,
  }, {
    arquivo: INGEST,
    de: `    if (c.unit_id !== dispositivo.unit_id || c.device_id !== dispositivo.device_id ||
`,
    para: `    if (c.unit_id !== dispositivo.unit_id ||
`,
  }],
  assinatura: /XX {2}X1 /,
});

console.log(`\n${passaram}/${passaram + falhas.length} verificações · ${cegas} mutação(ões) cega(s)`);
if (falhas.length) {
  console.log("\nFALHAS:");
  for (const f of falhas) console.log(`  - ${f.slice(0, 700)}`);
  process.exit(1);
}
console.log("\nCADEIA_MULTIAPARELHO_MUTACOES_GREEN");
