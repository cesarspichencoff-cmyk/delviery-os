#!/usr/bin/env node
/* ============================================================================
 * Compara gabarito congelado com rótulos humanos cegos.
 * NÃO executa se ROTULOS_HUMANOS_CEGOS.json não existir.
 * NÃO recalibra.
 *
 *   node tools/comparar_blind_v1.js
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const Blind = require("../src/capacidade-viva/calibration/blind-validation");

const root = path.join(__dirname, "..");
const blindDir = path.join(root, "data/capacidade-viva/calibration/blind-v1");
const gabaritoPath = path.join(blindDir, "GABARITO_MOTOR_CONGELADO.json");
const labelsPath = path.join(blindDir, "ROTULOS_HUMANOS_CEGOS.json");

function main() {
  if (!fs.existsSync(labelsPath)) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          ready: false,
          message:
            "Aguardando rótulos humanos em ROTULOS_HUMANOS_CEGOS.json. Não executar comparação antes."
        },
        null,
        2
      )
    );
    process.exit(0);
  }
  if (!fs.existsSync(gabaritoPath)) {
    console.error("gabarito missing");
    process.exit(1);
  }
  const gab = JSON.parse(fs.readFileSync(gabaritoPath, "utf8"));
  const labels = JSON.parse(fs.readFileSync(labelsPath, "utf8"));
  const byId = labels.cases
    ? Object.fromEntries(labels.cases.map((c) => [c.case_id, c]))
    : labels.by_case_id || labels;

  const report = Blind.compareBlindLabels(gab.cases || [], byId);
  const out = path.join(blindDir, "RESULTADO_COMPARACAO.json");
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
        generated_at: new Date().toISOString(),
        config_sha256: gab.config_sha256,
        report
      },
      null,
      2
    )
  );
  console.log(JSON.stringify(report, null, 2));
  console.log("wrote", out);
}

main();
