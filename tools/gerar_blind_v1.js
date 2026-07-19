#!/usr/bin/env node
/* ============================================================================
 * Fase 2D.7 — gera validação cega holdout (sem recalibrar).
 * Não altera cv-cal-tata-human-v1.
 *
 *   node tools/gerar_blind_v1.js
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const Blind = require("../src/capacidade-viva/calibration/blind-validation");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "data", "capacidade-viva", "calibration", "blind-v1");
const configPath = path.join(
  root,
  "data",
  "capacidade-viva",
  "calibration",
  "configs",
  "cv-cal-tata-human-v1.json"
);
const episodesPath = path.join(
  root,
  "results",
  "capacidade-viva",
  "sane-episodes-2d3-1784446646346",
  "04b_episodes_full.json"
);

function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content, null, 2));
}

function main() {
  if (!fs.existsSync(configPath)) throw new Error("config missing");
  if (!fs.existsSync(episodesPath)) throw new Error("episodes missing");

  const freezePath = path.join(outDir, "FREEZE.json");
  if (fs.existsSync(freezePath)) {
    const existing = JSON.parse(fs.readFileSync(freezePath, "utf8"));
    if (existing.frozen === true && !process.argv.includes("--force")) {
      console.error("ALREADY FROZEN — recusar regeneração silenciosa. Use --force só se souber o que faz.");
      process.exit(2);
    }
  }

  const configRaw = fs.readFileSync(configPath);
  const humanConfig = JSON.parse(configRaw);
  const configSha = Blind.fileSha256(configPath);
  const generated_at = new Date().toISOString();

  const exclusion = Blind.loadTrainingExclusion(root);
  console.log("training exclusion", {
    cases: exclusion.n_case_ids,
    orders: exclusion.n_order_tokens,
    turns: exclusion.n_turn_keys
  });

  const full = JSON.parse(fs.readFileSync(episodesPath, "utf8"));
  const holdout = Blind.selectBlindHoldout(full.episodes || [], exclusion, { min_n: 16, max_n: 24 });
  console.log("holdout", holdout.stats);

  // verify zero leak
  let leaks = 0;
  for (const ep of holdout.episodes) {
    if (Blind.isTrainingLeak(ep, exclusion)) leaks++;
  }
  if (leaks > 0) {
    console.error("LEAK DETECTED", leaks);
    process.exit(1);
  }

  const freezeMeta = {
    frozen: true,
    generated_at,
    config_version: humanConfig.config_version || "cv-cal-tata-human-v1",
    config_path: "data/capacidade-viva/calibration/configs/cv-cal-tata-human-v1.json",
    config_sha256: configSha,
    config_bytes: configRaw.length,
    n_cases: holdout.episodes.length,
    case_ids: [],
    no_silent_regeneration: true,
    note: "Não substituir casos após o César responder."
  };

  const factsList = [];
  const gabaritoCases = [];
  let nFonte = 0;
  let nOp = 0;

  holdout.episodes.forEach((ep, i) => {
    const { facts, gabarito } = Blind.buildBlindCase(ep, i, humanConfig, freezeMeta);
    // strip internal tokens from public facts copy
    const publicFacts = Object.assign({}, facts);
    delete publicFacts._episode_id_anon;
    delete publicFacts._order_token;
    delete publicFacts._episode_turn_key;
    delete publicFacts._type;
    factsList.push(publicFacts);
    gabaritoCases.push(gabarito);
    freezeMeta.case_ids.push(facts.case_id);
    if (gabarito.classificacao === "qualidade_fonte" || gabarito.zombie) nFonte++;
    else nOp++;
  });

  const md = Blind.blindCasesToMarkdown(factsList, freezeMeta);
  const clean = Blind.assertBlindMarkdownClean(md);
  if (!clean.ok) {
    console.error("MARKDOWN LEAK", clean.leaks);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  write(path.join(outDir, "CASOS_CEGOS_CESAR.md"), md);
  write(path.join(outDir, "casos-cegos-fatos.json"), {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    version: "2D.7-blind-v1",
    for: "César",
    note: "Somente fatos. Sem classificação do motor.",
    config_sha256: configSha,
    generated_at,
    n: factsList.length,
    cases: factsList
  });

  write(path.join(outDir, "GABARITO_MOTOR_CONGELADO.json"), {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    version: "2D.7-blind-v1",
    frozen: true,
    config_version: freezeMeta.config_version,
    config_sha256: configSha,
    generated_at,
    n: gabaritoCases.length,
    cases: gabaritoCases,
    note: "NÃO usar para produzir o Markdown do César. Congelado antes das respostas humanas."
  });

  write(path.join(outDir, "FREEZE.json"), freezeMeta);

  write(path.join(outDir, "TRAINING_EXCLUSION.json"), {
    n_case_ids: exclusion.n_case_ids,
    n_order_tokens: exclusion.n_order_tokens,
    n_turn_keys: exclusion.n_turn_keys,
    case_ids: [...exclusion.caseIds].sort(),
    order_tokens: [...exclusion.orderTokens].sort(),
    turn_keys_sample: [...exclusion.turnKeys].slice(0, 5)
  });

  write(path.join(outDir, "COMPARISON_READY.json"), Blind.prepareComparisonScaffold(
    "data/capacidade-viva/calibration/blind-v1/GABARITO_MOTOR_CONGELADO.json",
    "data/capacidade-viva/calibration/blind-v1/ROTULOS_HUMANOS_CEGOS.json"
  ));

  write(path.join(outDir, "00_README.md"), [
    "# Blind-v1 — validação cega",
    "",
    "1. Enviar **somente** `CASOS_CEGOS_CESAR.md` ao César.",
    "2. Não abrir `GABARITO_MOTOR_CONGELADO.json` na sessão de avaliação humana.",
    "3. Após respostas, gravar em `ROTULOS_HUMANOS_CEGOS.json` e rodar:",
    "   `node tools/comparar_blind_v1.js`",
    "4. Não recalibrar antes da comparação.",
    ""
  ].join("\n"));

  write(path.join(outDir, "99_SUMMARY.json"), {
    version: "2D.7",
    n_cegos: factsList.length,
    independentes: true,
    vazamento_treino: leaks,
    datas: holdout.stats.dates,
    dias: holdout.stats.dias,
    faixas: holdout.stats.faixas,
    pracas: holdout.stats.pracas,
    operacionais: nOp,
    qualidade_fonte: nFonte,
    config_sha256: configSha,
    markdown_clean: clean.ok,
    frozen: true
  });

  console.log(
    JSON.stringify(
      {
        n: factsList.length,
        leaks,
        dates: holdout.stats.dates.length,
        dias: holdout.stats.dias,
        faixas: holdout.stats.faixas,
        pracas: holdout.stats.pracas,
        op: nOp,
        fonte: nFonte,
        config_sha256: configSha,
        clean: clean.ok
      },
      null,
      2
    )
  );

  if (factsList.length < 16 || factsList.length > 24) process.exit(1);
}

main();
