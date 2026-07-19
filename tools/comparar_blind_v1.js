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
  // Validação prévia: arquivo existe (já checado) + JSON válido
  let labels;
  try {
    labels = JSON.parse(fs.readFileSync(labelsPath, "utf8"));
  } catch (e) {
    console.error("JSON inválido em ROTULOS_HUMANOS_CEGOS.json:", e.message);
    process.exit(1);
  }

  const gab = JSON.parse(fs.readFileSync(gabaritoPath, "utf8"));

  // Usa exatamente o arquivo salvo (formato rotulos[].caso/estado/acao)
  const report = Blind.compareBlindLabels(gab.cases || [], labels);
  const out = path.join(blindDir, "RESULTADO_COMPARACAO.json");
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
        generated_at: new Date().toISOString(),
        config_sha256: gab.config_sha256,
        rotulos_path: "data/capacidade-viva/calibration/blind-v1/ROTULOS_HUMANOS_CEGOS.json",
        rotulos_meta: {
          configuracao_avaliada: labels.configuracao_avaliada || null,
          referencia_congelada: labels.referencia_congelada || null,
          avaliador: labels.avaliador || null,
          n_rotulos: Array.isArray(labels.rotulos) ? labels.rotulos.length : null
        },
        validation: {
          file_exists: true,
          json_valid: true
        },
        report
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ validation: { file_exists: true, json_valid: true }, report }, null, 2));
  console.log("wrote", out);
}

main();
