/**
 * PROCEDÊNCIA DO PRODUTOR — SUÍTE ADVERSARIAL.
 *
 * Cada mutação devolve um defeito que a fronteira existe para impedir, e
 * `run-producer-attestation-tests.ts` tem de cair PELA PROPRIEDADE atacada —
 * a assinatura exige o teste que a guarda. Mutação que deixa o gate verde é
 * CEGA, e cega é vermelho aqui.
 *
 * Mesma mecânica de `run-relogio-mutation-tests.ts`: âncora com ocorrência
 * ÚNICA, disco relido, restauração byte a byte conferida por SHA-256. O gate
 * roda por tsx sobre o fonte; não há `dist/` a reconstruir.
 *
 *   M0  controle: sem mutação o gate é verde
 *   M1  assinatura deixa de ser conferida
 *   M2  a fronteira admite `real`
 *   M3  o consumidor sem fronteira volta a gravar `real`
 *   M4  unidade da chave ignorada
 *   M5  revogação ignorada
 *   M6  antirreplay por nonce ignorado
 *   M7  registro indisponível vira quarentena (descarta evento legítimo)
 *   M8  consumidor avança o cursor quando a procedência está indisponível
 *   M9  registro da outbox não é comparado com o assinado
 *   M10 decisão anterior de quarentena ignorada na releitura
 *   M11 frescor volta a ser medido pela hora do poll (R3)
 *   M12 piloto deixa de assinar a outbox
 *   M13 feed atestável descarta a atestação
 *   M14 config aceita sinônimo para "required"
 *   M15 tipo de evento não concedido passa
 *   M16 iat no futuro passa
 *   M17 sinal independente admitido sem registro de admissão
 *   M18 falha de assinatura volta a derrubar o comando de Entregas
 *   M19 assinador deixa de conferir o teto do token
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

console.log("\n=== PROCEDENCIA DO PRODUTOR — SUITE ADVERSARIAL ===\n");

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

const GATE = "src/platform/run-producer-attestation-tests.ts";
const WIN = process.platform === "win32";

function rodar(): { ok: boolean; saida: string } {
  try {
    const saida = execFileSync(WIN ? "npx.cmd" : "npx", ["tsx", GATE], {
      cwd: raiz, encoding: "utf8", timeout: 600_000, env: { ...process.env }, shell: WIN,
    });
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

/** `PROCEDENCIA_MUT=M2,M4` roda só estas. */
const SOMENTE = (process.env.PROCEDENCIA_MUT ?? "").split(",").map((x) => x.trim()).filter(Boolean);

function mutacao(o: { id: string; propriedade: string; edicoes: Edicao[]; assinatura: RegExp }): void {
  if (SOMENTE.length && !SOMENTE.includes(o.id)) return;
  teste(`${o.id} — ${o.propriedade}`, () => {
    const feitas = aplicar(o.edicoes);
    console.log(`        aplicada · ${feitas.map((f) => `${f.arquivo.split("/").pop()} ${f.hash.slice(0, 8)}`).join(" · ")}`);
    try {
      const r = rodar();
      assert.doesNotMatch(r.saida, /__SPAWN_FALHOU__/, `o gate não mediu:\n${r.saida.slice(0, 600)}`);
      if (r.ok) {
        cegas += 1;
        assert.fail("o gate ficou VERDE com o defeito — MUTACAO CEGA");
      }
      const perdas = r.saida.split("\n").filter((l) => /^ {2}XX {2}PA\d+/.test(l)).map((l) => l.trim().slice(4).split(" ")[0]);
      assert.ok(perdas.length > 0, `reprovou sem acusar teste nenhum (erro de compilação?):\n${r.saida.slice(-900)}`);
      assert.match(perdas.join(" "), o.assinatura, `reprovou, mas NÃO pela assinatura esperada: ${perdas.join(" ")}`);
      console.log(`        acusaram · ${perdas.join(" ")}`);
    } finally {
      restaurar(feitas);
      console.log(`        restaurado · ${feitas.length} arquivo(s) == origem`);
    }
  });
}

const FRONTEIRA = "src/platform/ingest/fronteira-de-procedencia.ts";
const CONSUMIDOR = "src/platform/runtime/entregas-live-consumer.ts";
const ASSINATURA_PILOTO = "src/entregas/pilot/producer-signing.ts";
const FEED = "src/entregas/integration/durable-event-feed.ts";
const CONFIG = "src/platform/config/entregas-source-ingest-config.ts";
const CONTRATO = "src/entregas/contracts/producer-attestation.ts";

if (!SOMENTE.length || SOMENTE.includes("M0")) {
  teste("M0 — controle: sem mutação o gate é verde", () => {
    const r = rodar();
    assert.ok(r.ok, `controle vermelho:\n${r.saida.slice(-900)}`);
    assert.match(r.saida, /PRODUCER_ATTESTATION: (\d+)\/\1 PASS/);
  });
}

mutacao({
  id: "M1", propriedade: "assinatura deixa de ser conferida",
  edicoes: [{ arquivo: FRONTEIRA, de: `if (!assinaturaConfere(d, publica)) return quarentena("assinatura_invalida");`, para: `void publica;` }],
  assinatura: /PA5\b.*PA6\b|PA6\b/,
});
mutacao({
  id: "M2", propriedade: "a fronteira admite `real`",
  edicoes: [{ arquivo: FRONTEIRA, de: `  if (e.source_mode === "real") return quarentena("real_sem_autoridade_de_mundo");\n`, para: "" }],
  assinatura: /PA9\b/,
});
mutacao({
  id: "M3", propriedade: "o consumidor sem fronteira volta a gravar `real`",
  edicoes: [{ arquivo: CONSUMIDOR, de: `      if (evento.source_mode === "real") {`, para: `      if (evento.source_mode === ("nunca" as string)) {` }],
  assinatura: /PA22\b/,
});
mutacao({
  id: "M4", propriedade: "unidade da chave ignorada",
  edicoes: [{ arquivo: FRONTEIRA, de: `  if (e.unit_id !== chave.unit_id) return quarentena("unidade_nao_concedida");\n`, para: "" }],
  assinatura: /PA8\b/,
});
mutacao({
  id: "M5", propriedade: "revogação ignorada",
  edicoes: [{ arquivo: FRONTEIRA, de: `  if (chave.revoked_at !== null) return quarentena("chave_revogada");\n`, para: "" }],
  assinatura: /PA10\b.*PA12\b|PA12\b/,
});
mutacao({
  id: "M6", propriedade: "antirreplay por nonce ignorado",
  edicoes: [{ arquivo: FRONTEIRA, de: `  if (porNonce && !mesmo(porNonce)) return quarentena("nonce_reutilizado");\n`, para: "" }],
  assinatura: /PA14\b/,
});
mutacao({
  id: "M7", propriedade: "registro indisponível vira quarentena",
  edicoes: [{ arquivo: FRONTEIRA, de: `    return { tipo: "indisponivel", codigo: "registro_de_produtores_indisponivel" };`, para: `    return quarentena("produtor_desconhecido");` }],
  assinatura: /PA13\b.*PA17\b|PA13\b|PA17\b/,
});
mutacao({
  id: "M8", propriedade: "consumidor avança o cursor com procedência indisponível",
  edicoes: [{
    arquivo: CONSUMIDOR,
    de: `          return parcial("failed", "procedencia_indisponivel:" + veredito.codigo);`,
    para: `          checkpoint = item.cursor;\n          await salvar();\n          continue;`,
  }],
  assinatura: /PA17\b/,
});
mutacao({
  id: "M9", propriedade: "registro da outbox não é comparado com o assinado",
  edicoes: [{ arquivo: FRONTEIRA, de: `  if (!eventoCanonicoIgual(item.event, claims.event)) {`, para: `  if (!eventoCanonicoIgual(item.event, item.event)) {` }],
  assinatura: /PA7\b|PA24\b/,
});
mutacao({
  id: "M10", propriedade: "decisão anterior de quarentena ignorada na releitura",
  edicoes: [{ arquivo: FRONTEIRA, de: `  if (anterior?.decision === "quarantined") {`, para: `  if (anterior?.decision === ("nunca" as string)) {` }],
  assinatura: /PA15\b/,
});
mutacao({
  id: "M11", propriedade: "frescor volta a ser medido pela hora do poll",
  edicoes: [{
    arquivo: FRONTEIRA,
    de: `  if (iat > t + FOLGA_DE_RELOGIO_MS) return quarentena("iat_no_futuro");`,
    para: `  if (iat > t + FOLGA_DE_RELOGIO_MS) return quarentena("iat_no_futuro");\n  if (iat < t - 90_000) return quarentena("iat_fora_da_vida_da_chave");`,
  }],
  assinatura: /PA11\b/,
});
mutacao({
  id: "M12", propriedade: "piloto deixa de assinar a outbox",
  edicoes: [{ arquivo: ASSINATURA_PILOTO, de: `    return { ...record, attestation: assinante.assinar(record.event) };`, para: `    return record;` }],
  assinatura: /PA24\b/,
});
mutacao({
  id: "M13", propriedade: "feed atestável descarta a atestação",
  edicoes: [{ arquivo: FEED, de: `      attestation: typeof r.attestation === "string" ? r.attestation : null,`, para: `      attestation: null,` }],
  assinatura: /PA24\b/,
});
mutacao({
  id: "M14", propriedade: "config aceita sinônimo para required",
  edicoes: [{ arquivo: CONFIG, de: `  if (v === "required") return "required";`, para: `  if (v === "required" || v === "on") return "required";` }],
  assinatura: /PA27\b/,
});
mutacao({
  id: "M15", propriedade: "tipo de evento não concedido passa",
  edicoes: [{ arquivo: FRONTEIRA, de: `  if (!chave.allowed_event_types.includes(e.event_type)) return quarentena("tipo_nao_concedido");\n`, para: "" }],
  assinatura: /PA8\b/,
});
mutacao({
  id: "M16", propriedade: "iat no futuro passa",
  edicoes: [{ arquivo: FRONTEIRA, de: `  if (iat > t + FOLGA_DE_RELOGIO_MS) return quarentena("iat_no_futuro");\n`, para: "" }],
  assinatura: /PA10\b/,
});
mutacao({
  id: "M17", propriedade: "sinal independente admitido sem registro de admissão",
  edicoes: [{ arquivo: CONSUMIDOR, de: `        if (admissao && procedencia) {`, para: `        if (admissao && procedencia && false) {` }],
  assinatura: /PA16\b|PA24\b/,
});

mutacao({
  id: "M18", propriedade: "falha de assinatura volta a derrubar o comando de Entregas",
  edicoes: [{ arquivo: ASSINATURA_PILOTO, de: "    return record;\n  }\n}", para: "    throw e;\n  }\n}" }],
  assinatura: /PA31\b/,
});
mutacao({
  id: "M19", propriedade: "assinador deixa de conferir o teto do token",
  edicoes: [
    { arquivo: CONTRATO, de: `      if (token.length > PRODUCER_ATTESTATION_MAX_TOKEN) throw new Error("evento_grande_demais_para_atestar");\n`, para: "" },
    { arquivo: CONTRATO, de: `export const PRODUCER_ATTESTATION_MAX_CLAIMS = 24_000;`, para: `export const PRODUCER_ATTESTATION_MAX_CLAIMS = 24_576;` },
  ],
  assinatura: /PA32\b/,
});

console.log(`\nPRODUCER_ATTESTATION_MUTATIONS: ${passaram} verificações, ${cegas} cegas, ${falhas.length} falha(s)`);
if (falhas.length) {
  for (const f of falhas) console.log(" - " + f.split("\n")[0]);
  process.exitCode = 1;
}
