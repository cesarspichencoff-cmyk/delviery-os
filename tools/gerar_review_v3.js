#!/usr/bin/env node
/* ============================================================================
 * Fase 2D.5 — pack humano representativo por episódio (não por tick).
 * Não altera motor, pesos, config, UI ou replay.
 *
 *   node tools/gerar_review_v3.js
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const RV3 = require("../src/capacidade-viva/calibration/review-v3");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "data", "capacidade-viva", "calibration", "review-v3");
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
  if (!fs.existsSync(episodesPath)) {
    console.error("episodes artifact missing:", episodesPath);
    process.exit(1);
  }
  const full = JSON.parse(fs.readFileSync(episodesPath, "utf8"));
  const episodes = full.episodes || [];
  console.log("episodes source:", episodes.length);

  const pack = RV3.selectRepresentativePack(episodes, {
    min_n: 16,
    max_n: 24,
    team_profile: "estrutura_media"
  });

  const validation = RV3.validateRepresentativePack(pack);
  console.log("validation", validation);
  console.log("stats", pack.stats);

  fs.mkdirSync(outDir, { recursive: true });

  write(path.join(outDir, "00_README.md"), [
    "# Review pack v3 — representativo por episódio",
    "",
    "**Não enviar** `review/` (2D.3) nem `review-v2/` (2D.4) ao César.",
    "Use este diretório.",
    "",
    "- `CASOS_REPRESENTATIVOS.md` — ground truth operacional",
    "- `CASOS_LIMITROFES.md` — seção separada",
    ""
  ].join("\n"));

  write(path.join(outDir, "casos-representativos.json"), {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    version: "2D.5",
    pack: "representativos",
    generated_at: pack.generated_at,
    n_cases: pack.representativos.length,
    stats: pack.stats,
    validation,
    cases: pack.representativos,
    selection: "por_episodio_um_por_order_turno",
    motor_changed: false,
    config_changed: false,
    full_replay: false
  });

  write(path.join(outDir, "casos-limitrofes.json"), {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    version: "2D.5",
    pack: "limitrofes",
    note: "Não usar como ground truth de controlável/crítico forçado",
    n_cases: pack.limitrofes.length,
    cases: pack.limitrofes
  });

  write(path.join(outDir, "CASOS_REPRESENTATIVOS.md"), RV3.representativosToMarkdown(pack));
  write(path.join(outDir, "CASOS_LIMITROFES.md"), RV3.limitrofesToMarkdown(pack));

  write(path.join(outDir, "99_SUMMARY.json"), {
    version: "2D.5",
    n_representativos: pack.representativos.length,
    n_limitrofes: pack.limitrofes.length,
    buckets: pack.stats.bucket_counts,
    dates: pack.stats.dates,
    dias_semana: pack.stats.dias_semana,
    pracas: pack.stats.pracas,
    types: pack.stats.types,
    validation,
    source_episodes: episodesPath
  });

  console.log("DONE", outDir);
  console.log(
    JSON.stringify(
      {
        n: pack.representativos.length,
        lim: pack.limitrofes.length,
        buckets: pack.stats.bucket_counts,
        dates: pack.stats.dates.length,
        pracas: pack.stats.pracas,
        validation_ok: validation.ok,
        errors: validation.errors
      },
      null,
      2
    )
  );

  if (!validation.ok) process.exit(1);
  if (pack.representativos.length < 16 || pack.representativos.length > 24) {
    console.error("n fora de 16–24:", pack.representativos.length);
    process.exit(1);
  }
}

main();
