/**
 * CADEIA REAL — SUÍTE ADVERSARIAL.
 *
 * Cada mutação devolve um defeito que a cadeia existe para impedir, e o gate
 * `test:platform:cadeia` tem de cair PELA PROPRIEDADE atacada — nunca por
 * acaso. Uma mutação que deixa o gate verde é uma mutação CEGA, e cega é
 * vermelho aqui.
 *
 * Mecânica, a mesma das suítes anteriores: âncora com ocorrência ÚNICA, disco
 * relido, `dist/` reconstruído quando a mutação toca código que o binário
 * carrega, restauração byte a byte conferida por SHA-256. Nenhum detector
 * procura palavra: quem acusa é o gate, executando.
 *
 *   M1  aparelho DESCONHECIDO recebe token
 *   M2  REVOGADO continua ingerindo · M2b REVOGADO continua renovando
 *   M3  token EXPIRADO passa na ingestão
 *   M4  token de A envia pontos como B
 *   M5  falha de credencial APAGA o GPS local (o cliente marca como enviado)
 *   M6  401 vira sucesso definitivo no cliente
 *   M7  lote repetido duplica fato (o cliente troca a chave no reenvio)
 *   M8  simulated vira real (o crítico carimba `real` ignorando a instância)
 *   M9  restart perde a projeção (o assíncrono pula o replay)
 *   M10 a UI chama o demo de real
 *   M11 ausência vira saudável (aparelho sem lote aparece com GPS fresco)
 *   M12 o piloto e a plataforma ganham autoridade juntos (o token da
 *       plataforma vaza para o piloto no Kotlin)
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
let passaram = 0;
let cegas = 0;
const falhas: string[] = [];

console.log("\n=== CADEIA REAL — SUITE ADVERSARIAL ===\n");

if (!(process.env.DELIVERYOS_PG_URL ?? "").trim()) {
  console.log("PULADO: DELIVERYOS_PG_URL não definida — o gate atacado precisa de PostgreSQL real.");
  process.exit(0);
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

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

const GATE = "src/platform/run-cadeia-real-tests.ts";

function construir(): void {
  execFileSync("npm", ["run", "-s", "build:platform"], { cwd: raiz, encoding: "utf8", timeout: 600_000, stdio: ["ignore", "pipe", "pipe"] });
}

function rodar(): { ok: boolean; saida: string } {
  try {
    const saida = execFileSync("npx", ["tsx", GATE], { cwd: raiz, encoding: "utf8", timeout: 900_000, env: { ...process.env } });
    if (/PULADO/.test(saida)) return { ok: false, saida: `__PULADO__${saida}` };
    return { ok: true, saida };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: string };
    const saida = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    if (saida.trim() === "") return { ok: false, saida: `__SPAWN_FALHOU__ ${err.code ?? "?"}` };
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
      const n = atual.split(e.de).length - 1;
      assert.equal(n, 1, `MUTACAO NAO APLICADA: âncora com ${n} ocorrência(s) em ${e.arquivo}: ${e.de.slice(0, 70)}`);
      const novo = atual.replace(e.de, () => e.para);
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

/** `CADEIA_MUT=M2,M4` roda só estas — para reexecutar uma mutação corrigida sem pagar a suíte inteira. */
const SOMENTE = (process.env.CADEIA_MUT ?? "").split(",").map((x) => x.trim()).filter(Boolean);

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
        assert.fail("o gate cadeia ficou VERDE com o defeito restaurado — MUTACAO CEGA");
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
teste("dist/ é desta árvore e o gate cadeia está verde ANTES de qualquer mutação", () => {
  construir();
  const r = rodar();
  assert.ok(r.ok, `gate já vermelho antes de mutar:\n${r.saida.slice(-900)}`);
});
if (falhas.length) {
  console.error("\nO gate precisa estar verde ANTES das mutacoes. Abortado.");
  process.exit(1);
}

const SESSAO = "src/platform/auth/device-session.ts";
const AUTH = "src/platform/auth/device-auth.ts";
const TOKEN = "src/platform/auth/device-token.ts";
const INGEST = "src/platform/ingest/device-ingest.ts";
const CRITICO = "src/platform/bin/critical.ts";
const ASSINCRONO = "src/platform/bin/async-runtime.ts";
const CLIENTE = "src/platform/aparelho-logico.ts";
const VM = "src/product/viewmodels/entregas-vm.ts";
const KOTLIN = "android/app/src/main/java/br/com/tata/entregas/sync/SyncWorker.kt";

/* ================================================================== */
console.log("\n1. QUEM PODE FALAR");

mutacao({
  id: "M1",
  propriedade: "aparelho DESCONHECIDO recebe token",
  edicoes: [{
    arquivo: SESSAO,
    de: `  if (!dispositivo) return recusar("dispositivo_desconhecido");\n`,
    para:
      `  if (!dispositivo) {\n` +
      `    const f = emitirToken({ device_id, unit_id: "SEM-CADASTRO", issued_by: EMISSOR_POR_VINCULO, agora: o.agora, segredo: o.segredo_de_assinatura });\n` +
      `    return { ok: true, token: f.token, claims: f.claims, expires_in_s: f.claims.exp - f.claims.iat, vinculou_agora: false, dispositivo: { device_id, unit_id: "SEM-CADASTRO", revoked_at: null } };\n` +
      `  }\n`,
  }],
  assinatura: /XX {2}B1 [\s\S]*XX {2}C2 /,
});

// A revogação na ingestão tem DUAS camadas — `autenticarDispositivo` e
// `traduzirLoteGps` — e cada uma sozinha segura o lote (medido: derrubar só a
// primeira deixa o gate verde). A mutação devolve o defeito de verdade:
// derruba as duas. A comparação com uma string impossível é a forma que
// compila — `false && x` faz o tsc perder a narrativa de nulo e o build cai.
mutacao({
  id: "M2",
  propriedade: "REVOGADO continua INGERINDO com token vigente (as duas camadas derrubadas)",
  edicoes: [
    { arquivo: AUTH, de: `  if (dispositivo.revoked_at) {\n`, para: `  if (dispositivo.revoked_at === "nunca") {\n` },
    { arquivo: INGEST, de: `  if (dispositivo.revoked_at) {\n`, para: `  if (dispositivo.revoked_at === "nunca") {\n` },
  ],
  assinatura: /XX {2}R1 /,
});

mutacao({
  id: "M2b",
  propriedade: "REVOGADO continua RENOVANDO a credencial",
  edicoes: [{ arquivo: SESSAO, de: `  if (dispositivo.revoked_at) return recusar("dispositivo_revogado");\n`, para: `` }],
  assinatura: /XX {2}B3 [\s\S]*XX {2}R1 /,
});

mutacao({
  id: "M3",
  propriedade: "token EXPIRADO passa na ingestão",
  edicoes: [{ arquivo: TOKEN, de: `  if (agoraS >= claims.exp) {\n`, para: `  if (false && agoraS >= claims.exp) {\n` }],
  assinatura: /XX {2}E1 /,
});

mutacao({
  id: "M4",
  propriedade: "token de A envia pontos como B",
  edicoes: [{ arquivo: INGEST, de: `    if (bruto.device_id !== dispositivo.device_id) {\n`, para: `    if (bruto.device_id !== dispositivo.device_id && bruto.device_id === "nunca") {\n` }],
  assinatura: /XX {2}E2 /,
});

/* ================================================================== */
console.log("\n2. O CLIENTE NUNCA PERDE PONTO");

mutacao({
  id: "M5",
  propriedade: "falha de credencial APAGA o GPS local — o cliente dá o lote por enviado",
  edicoes: [{
    arquivo: CLIENTE,
    de: `        case "unauthorized":\n          // Credencial recusada é problema de credencial, não do que foi coletado.\n          db.markFailed(ids, r.reason);\n`,
    para: `        case "unauthorized":\n          db.markSent(ids);\n`,
  }],
  assinatura: /XX {2}E1 /,
});

mutacao({
  id: "M6",
  propriedade: "401 vira sucesso definitivo — o cliente não limpa a credencial nem retenta",
  edicoes: [{ arquivo: CLIENTE, de: `    if (credencialRecusada) {\n`, para: `    if (false && credencialRecusada) {\n` }],
  assinatura: /XX {2}E1 /,
});

mutacao({
  id: "M7",
  propriedade: "lote repetido duplica fato — o cliente troca a chave a cada envio",
  edicoes: [{ arquivo: CLIENTE, de: `        idempotency_key: p.idempotencyKey,\n`, para: `        idempotency_key: \`\${p.idempotencyKey}:\${correlationId}\`,\n` }],
  assinatura: /XX {2}C14 /,
});

/* ================================================================== */
console.log("\n3. O FATO É O CERTO, E SOBREVIVE");

mutacao({
  id: "M8",
  propriedade: "simulated vira real — o crítico carimba `real` ignorando o modo da instância",
  edicoes: [{ arquivo: CRITICO, de: `            source_mode: modoDaInstancia,\n`, para: `            source_mode: "real" as SourceMode,\n` }],
  assinatura: /XX {2}C13 /,
});

mutacao({
  id: "M9",
  propriedade: "restart perde a projeção — o assíncrono sobe sem replay",
  edicoes: [{
    arquivo: ASSINCRONO,
    de: `    const replay = await reconstruirNoBoot(cliente, ponteOperacaoViva, new Date());\n`,
    para: `    const replay = { fonte: "platform.event_log", estado: "completo", aplicados: 0, duplicados: 0, escopos: [] } as unknown as Awaited<ReturnType<typeof reconstruirNoBoot>>;\n`,
  }],
  assinatura: /XX {2}C17/,
});

/* ================================================================== */
console.log("\n4. A TELA NÃO MENTE");

mutacao({
  id: "M10",
  propriedade: "a UI chama o demo de real",
  edicoes: [{ arquivo: VM, de: `  const procedencia: Procedencia = "simulado";\n`, para: `  const procedencia: Procedencia = "real";\n` }],
  assinatura: /XX {2}D3 /,
});

mutacao({
  id: "M11",
  propriedade: "ausência vira saudável — aparelho sem lote aparece com GPS fresco",
  edicoes: [{
    arquivo: VM,
    de: `      : (semLote as Campo<Frescor>),\n`,
    para: `      : observado("fresh" as Frescor, "real", lidaEm),\n`,
  }],
  assinatura: /XX {2}D4 /,
});

mutacao({
  id: "M12",
  propriedade: "o piloto e a plataforma ganham autoridade juntos — o token da plataforma vaza para o piloto no Kotlin",
  edicoes: [{ arquivo: KOTLIN, de: `            when (val r = piloto.sendEvents(payloads, correlationId)) {\n`, para: `            when (val r = api.sendEvents(payloads, correlationId)) {\n` }],
  assinatura: /XX {2}K1 /,
});

const total = passaram + falhas.length;
console.log(`\n${passaram}/${total} · ${cegas} mutacao(oes) cega(s)`);
for (const f of falhas) console.log(`  XX ${f}`);
if (cegas > 0) {
  console.error("\nMUTACAO CEGA — o gate nao protege o que diz proteger.");
  process.exit(1);
}
if (falhas.length) {
  console.error("\nCADEIA_MUTATIONS_RED");
  process.exit(1);
}
console.log("\nCADEIA_MUTATIONS_GREEN");
