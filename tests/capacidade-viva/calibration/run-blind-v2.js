/**
 * Testes 2D.9/2D.10 — segundo holdout cego independente (blind-v2):
 * congelamento (2D.9) + fechamento formal pós-avaliação do César (2D.10).
 * node tests/capacidade-viva/calibration/run-blind-v2.js
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const Blind = require("../../../src/capacidade-viva/calibration/blind-validation");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  OK ", name);
  } catch (e) {
    failed++;
    console.log("  FAIL", name, "-", e.message);
  }
}

const root = path.join(__dirname, "../../..");
const blindDir = path.join(root, "data/capacidade-viva/calibration/blind-v2");
const blindV1Dir = path.join(root, "data/capacidade-viva/calibration/blind-v1");
const configPath = path.join(root, "data/capacidade-viva/calibration/configs/cv-cal-tata-human-v2.json");

console.log("=== blind-v2 (2D.9) ===");

test("HEAD inicial obrigatório é ancestral do commit atual (b620aef)", () => {
  const log = execFileSync("git", ["log", "--oneline", "--all"], { cwd: root, encoding: "utf8" });
  assert.ok(/\bb620aef\b/.test(log), "commit b620aef não encontrado no histórico");
});

test("configuração v2 permanece a MESMA usada na Fase 2D.8 (versão e conteúdo estrutural)", () => {
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.strictEqual(cfg.config_version, "cv-cal-tata-human-v2");
  assert.strictEqual(cfg.human_calibration.version, 2);
  assert.strictEqual(cfg.pausa.auto_aplicar, false);
});

const manifest = JSON.parse(fs.readFileSync(path.join(blindDir, "MANIFESTO_CONGELAMENTO.json"), "utf8"));
const freeze = JSON.parse(fs.readFileSync(path.join(blindDir, "FREEZE.json"), "utf8"));
const gabarito = JSON.parse(fs.readFileSync(path.join(blindDir, "GABARITO_MOTOR_CONGELADO.json"), "utf8"));
const md = fs.readFileSync(path.join(blindDir, "CASOS_CEGOS_CESAR.md"), "utf8");

test("manifesto: hash da configuração bate com o arquivo real no disco", () => {
  const liveSha = Blind.fileSha256(configPath);
  assert.strictEqual(manifest.config_sha256, liveSha);
  assert.strictEqual(freeze.config_sha256, liveSha);
});

test("manifesto: hash do gabarito e do markdown batem com os arquivos reais", () => {
  const gabSha = Blind.fileSha256(path.join(blindDir, "GABARITO_MOTOR_CONGELADO.json"));
  const mdSha = Blind.fileSha256(path.join(blindDir, "CASOS_CEGOS_CESAR.md"));
  assert.strictEqual(manifest.gabarito_sha256, gabSha);
  assert.strictEqual(manifest.casos_cegos_md_sha256, mdSha);
});

test("manifesto: commit do motor é b620aef", () => {
  assert.strictEqual(manifest.motor_commit, "b620aef");
  assert.strictEqual(freeze.motor_commit, "b620aef");
});

test("manifesto: frozen=true e política de não regeneração silenciosa declarada", () => {
  assert.strictEqual(manifest.frozen, true);
  assert.strictEqual(manifest.no_silent_regeneration, true);
  assert.ok(freeze.no_silent_regeneration);
});

test("manifesto consistente: n_casos, ids_congelados e tokens batem com o gabarito", () => {
  assert.strictEqual(manifest.n_casos, gabarito.n);
  assert.strictEqual(manifest.ids_congelados.length, gabarito.n);
  assert.deepStrictEqual(manifest.ids_congelados, gabarito.cases.map((c) => c.case_id));
});

test("casos únicos: case_id, order_token (quando presente) e episode_id_anon sem duplicata", () => {
  const ids = gabarito.cases.map((c) => c.case_id);
  assert.strictEqual(new Set(ids).size, ids.length);
  const tokens = gabarito.cases.map((c) => c.order_token).filter(Boolean);
  assert.strictEqual(new Set(tokens).size, tokens.length);
  const eps = gabarito.cases.map((c) => c.episode_id_anon).filter(Boolean);
  assert.strictEqual(new Set(eps).size, eps.length);
});

test("gabarito completo: todo caso tem classificação, severidade, confiança, intervenção e regra", () => {
  for (const c of gabarito.cases) {
    assert.ok(c.case_id, "case_id ausente");
    assert.ok(c.classificacao, c.case_id + " sem classificacao");
    assert.ok(c.severity_label, c.case_id + " sem severity_label");
    assert.ok(c.confianca, c.case_id + " sem confianca");
    assert.ok(c.intervencao, c.case_id + " sem intervencao");
    assert.ok(c.regra_acionada, c.case_id + " sem regra_acionada");
    assert.strictEqual(c.config_version, "cv-cal-tata-human-v2");
    assert.strictEqual(c.motor_commit, "b620aef");
    assert.ok("participa_do_isf" in c, c.case_id + " sem participacao no ISF declarada");
    assert.ok("excluido_por_qualidade_da_fonte" in c, c.case_id + " sem flag de exclusão por fonte");
  }
});

test("zero episode_id conhecido do blind-v1 no blind-v2", () => {
  const g1 = JSON.parse(fs.readFileSync(path.join(blindV1Dir, "GABARITO_MOTOR_CONGELADO.json"), "utf8"));
  const knownEps = new Set(g1.cases.map((c) => c.episode_id_anon).filter(Boolean));
  for (const c of gabarito.cases) {
    if (c.episode_id_anon) assert.ok(!knownEps.has(c.episode_id_anon), c.case_id + " reusa episode_id do blind-v1");
  }
});

test("zero order token conhecido do blind-v1 no blind-v2", () => {
  const g1 = JSON.parse(fs.readFileSync(path.join(blindV1Dir, "GABARITO_MOTOR_CONGELADO.json"), "utf8"));
  const knownTokens = new Set(g1.cases.map((c) => c.order_token).filter(Boolean));
  for (const c of gabarito.cases) {
    if (c.order_token) assert.ok(!knownTokens.has(c.order_token), c.case_id + " reusa order_token do blind-v1");
  }
});

test("zero episode_turn_key (derivação/tick adjacente) conhecido do blind-v1", () => {
  const g1 = JSON.parse(fs.readFileSync(path.join(blindV1Dir, "GABARITO_MOTOR_CONGELADO.json"), "utf8"));
  const knownTurns = new Set(g1.cases.map((c) => c.episode_turn_key).filter(Boolean));
  for (const c of gabarito.cases) {
    if (c.episode_turn_key) assert.ok(!knownTurns.has(c.episode_turn_key), c.case_id + " reusa turn_key do blind-v1");
  }
});

test("zero raiz de pedido zumbi conhecida (order_token dos zumbis do blind-v1 fora do blind-v2)", () => {
  const g1 = JSON.parse(fs.readFileSync(path.join(blindV1Dir, "GABARITO_MOTOR_CONGELADO.json"), "utf8"));
  const zombieTokens = new Set(g1.cases.filter((c) => c.zombie).map((c) => c.order_token).filter(Boolean));
  assert.ok(zombieTokens.size > 0, "pré-condição: blind-v1 deveria ter zumbis com order_token conhecido");
  for (const c of gabarito.cases) {
    if (c.order_token) assert.ok(!zombieTokens.has(c.order_token), c.case_id + " reusa raiz de pedido zumbi do blind-v1");
  }
});

test("nenhum case_id do blind-v1 (namespace CV-B-) aparece no blind-v2 (namespace CV-B2-)", () => {
  for (const c of gabarito.cases) {
    assert.ok(/^CV-B2-\d{3}$/.test(c.case_id), c.case_id + " fora do namespace CV-B2-");
  }
});

test("exclusão combinada cobre review/, review-v2/, review-v3/ e blind-v1 (4 fontes, >0 cada)", () => {
  const exclusion = JSON.parse(fs.readFileSync(path.join(blindDir, "TRAINING_EXCLUSION.json"), "utf8"));
  assert.ok(exclusion.sources.review_v1 > 0);
  assert.ok(exclusion.sources.review_v2 > 0);
  assert.ok(exclusion.sources.review_v3_base > 0);
  assert.ok(exclusion.sources.blind_v1 === 24, "blind-v1 deveria contribuir com os 24 casos");
});

test("Markdown do César: ausência total de classificação/severidade/bucket/ISF/regra", () => {
  const clean = Blind.assertBlindMarkdownClean(md);
  assert.ok(clean.ok, "vazamento: " + JSON.stringify(clean.leaks));
});

test("Markdown do César: ausência de intervenção automática sugerida", () => {
  assert.doesNotMatch(md, /intervenção sugerida/i);
  assert.doesNotMatch(md, /intervencao_motor/i);
  assert.doesNotMatch(md, /priorizar_liberacao|intervir_agora|corrigir_status_pedido_antigo/i);
});

test("Markdown do César: contém só os campos de fatos + avaliação (checklist humano presente)", () => {
  assert.match(md, /Estado real:/);
  assert.match(md, /impossível avaliar/);
  assert.match(md, /Ação que deveria ser tomada:/);
  assert.match(md, /Observação:/);
  assert.match(md, /Pack: \*\*blind-v2\*\*/);
});

test("no mínimo 20 casos avaliáveis", () => {
  assert.ok(gabarito.n_avaliaveis >= 20, "avaliáveis=" + gabarito.n_avaliaveis);
});

test("no máximo 4 casos de evidência insuficiente", () => {
  assert.ok(gabarito.n_evidencia_insuficiente <= 4, "insuficientes=" + gabarito.n_evidencia_insuficiente);
});

test("total entre 24 e 32 casos", () => {
  assert.ok(gabarito.n >= 24 && gabarito.n <= 32, "n=" + gabarito.n);
});

test("cobertura das 4 faixas de motoboy (10/15/20)", () => {
  const bandas = manifest.diversidade.motoboy_bandas_cobertas;
  assert.deepStrictEqual([...bandas].sort(), ["10-15", "15-20", "gte20", "lt10"]);
});

test("diversidade mínima de datas, dias e faixas do dia", () => {
  assert.ok(manifest.diversidade.dates.length >= 10);
  assert.ok(manifest.diversidade.dias.length >= 4);
  assert.ok(manifest.diversidade.faixas.length >= 3);
});

/* ----------------------------------------------------------------------------
 * Fase 2D.10 — fechamento formal. A avaliação do César já aconteceu: o pack
 * real tem ROTULOS_HUMANOS_CEGOS.json e RESULTADO_COMPARACAO.json de verdade.
 * Os três testes abaixo substituem os que assumiam "ainda não avaliado" —
 * comportamento do comparador sem rótulos agora é testado numa fixture
 * ISOLADA (nunca mais contra o pack real, que legitimamente já avançou).
 * -------------------------------------------------------------------------- */

test("comparador recusa comparar sem rótulos, numa fixture isolada (sem tocar o pack real)", () => {
  const toolPath = path.join(root, "tools/comparar_blind_v2.js");
  assert.ok(fs.existsSync(toolPath));
  const tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "blind-v2-fixture-"));
  try {
    // fixture vazia: sem ROTULOS_HUMANOS_CEGOS.json — o comparador deve
    // recusar antes mesmo de olhar para qualquer gabarito.
    const out = execFileSync(process.execPath, [toolPath, tmpDir], { cwd: root, encoding: "utf8" });
    const parsed = JSON.parse(out);
    assert.strictEqual(parsed.ready, false);
    assert.strictEqual(fs.existsSync(path.join(tmpDir, "RESULTADO_COMPARACAO.json")), false);
    // e o pack real não foi tocado por essa chamada isolada
    assert.ok(fs.existsSync(path.join(blindDir, "ROTULOS_HUMANOS_CEGOS.json")), "fixture isolada não deveria afetar o pack real");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("estado concluído: rótulos humanos presentes, exatamente 30, resultado presente, hashes preservados", () => {
  const labelsPath = path.join(blindDir, "ROTULOS_HUMANOS_CEGOS.json");
  const resultPath = path.join(blindDir, "RESULTADO_COMPARACAO.json");
  assert.ok(fs.existsSync(labelsPath), "ROTULOS_HUMANOS_CEGOS.json deveria existir — avaliação já concluída");
  assert.ok(fs.existsSync(resultPath), "RESULTADO_COMPARACAO.json deveria existir — comparação já executada");

  const labels = JSON.parse(fs.readFileSync(labelsPath, "utf8"));
  assert.strictEqual(labels.rotulos.length, 30, "esperava exatamente 30 rótulos");
  assert.strictEqual(labels.configuracao_avaliada, "cv-cal-tata-human-v2");
  assert.match(
    labels.metodologia || "",
    /regras operacionais fornecidas pelo César.*antes da abertura do gabarito/i,
    "nota de proveniência da metodologia ausente ou incompleta"
  );
  const casos = labels.rotulos.map((r) => r.caso);
  assert.deepStrictEqual(
    casos,
    Array.from({ length: 30 }, (_, i) => "CV-B2-" + String(i + 1).padStart(3, "0")),
    "sequência de casos deveria ser CV-B2-001..030 sem lacunas"
  );

  // hashes do gabarito/manifesto/config permanecem os do congelamento — a
  // avaliação humana NUNCA deveria ter alterado o que foi congelado.
  const liveGabSha = Blind.fileSha256(path.join(blindDir, "GABARITO_MOTOR_CONGELADO.json"));
  const liveCfgSha = Blind.fileSha256(configPath);
  assert.strictEqual(manifest.gabarito_sha256, liveGabSha);
  assert.strictEqual(manifest.config_sha256, liveCfgSha);

  const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  assert.strictEqual(
    result.config_sha256,
    "f248a17328ca71fc8608e0897d24ee3966bf0b7bcd55afbebb6feaa4cc7534dc",
    "comparação precisa estar vinculada ao hash congelado correto"
  );
  assert.strictEqual(result.config_sha256, manifest.config_sha256, "hash da comparação diverge do hash congelado no manifesto");
  assert.strictEqual(result.validation.gabarito_integrity_ok, true);
  assert.strictEqual(result.report.n, 30);
  assert.strictEqual(result.report.n_comparaveis, 26);
  assert.strictEqual(result.report.n_impossivel_avaliar, 4);
  assert.strictEqual(result.report.concordancia_exata_count, 26);
  assert.strictEqual(result.report.concordancia_dentro_de_um_nivel_count, 26);
  assert.strictEqual(result.report.falsos_criticos, 0);
  assert.strictEqual(result.report.criticos_nao_detectados, 0);
  assert.strictEqual(result.report.zumbis_contaminaram_capacidade, 0);
  assert.strictEqual(result.report.intervencoes_adequadas, 26);
});

test("imutabilidade: rodar o comparador de novo produz o mesmo conteúdo semântico (só o timestamp muda)", () => {
  const resultPath = path.join(blindDir, "RESULTADO_COMPARACAO.json");
  const before = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  const toolPath = path.join(root, "tools/comparar_blind_v2.js");
  execFileSync(process.execPath, [toolPath], { cwd: root, encoding: "utf8" });
  const after = JSON.parse(fs.readFileSync(resultPath, "utf8"));

  assert.notStrictEqual(before.generated_at, after.generated_at, "timestamp deveria avançar a cada execução (não é o que fica congelado)");
  const stripTimestamp = (doc) => {
    const copy = JSON.parse(JSON.stringify(doc));
    delete copy.generated_at;
    return copy;
  };
  assert.deepStrictEqual(
    stripTimestamp(before),
    stripTimestamp(after),
    "o conteúdo semântico da comparação deveria ser idêntico entre execuções — mesmos rótulos, mesmo gabarito, mesmo resultado"
  );
});

test("gerador recusa regeneração silenciosa (já congelado)", () => {
  const toolPath = path.join(root, "tools/gerar_blind_v2.js");
  let threw = false;
  try {
    execFileSync(process.execPath, [toolPath], { cwd: root, encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    threw = true;
    assert.strictEqual(e.status, 2, "esperava exit code 2, veio " + e.status);
    const out = String(e.stderr || "") + String(e.stdout || "");
    assert.match(out, /ALREADY FROZEN/);
  }
  assert.ok(threw, "gerador deveria ter recusado regeneração e saído com erro");
});

test("cv-cal-tata-human-v1 continua intocada (arquivo diferente, config independente)", () => {
  const v1Path = path.join(root, "data/capacidade-viva/calibration/configs/cv-cal-tata-human-v1.json");
  const v1 = JSON.parse(fs.readFileSync(v1Path, "utf8"));
  assert.strictEqual(v1.config_version, "cv-cal-tata-human-v1");
});

console.log("\n=== RESULT ===");
console.log(`passed=${passed} failed=${failed}`);
process.exit(failed ? 1 : 0);
