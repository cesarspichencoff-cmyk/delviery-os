#!/usr/bin/env node
/* ============================================================================
 * Compara gabarito congelado do blind-v2 com rótulos humanos cegos.
 * NÃO executa se ROTULOS_HUMANOS_CEGOS.json não existir. NÃO recalibra.
 * NÃO altera a configuração nem o motor.
 *
 *   node tools/comparar_blind_v2.js [diretorio_blind_v2]
 * Sem argumento, usa data/capacidade-viva/calibration/blind-v2 (o pack real).
 * O argumento existe para permitir testar o comparador contra uma fixture
 * isolada (ex.: diretório temporário sem rótulos) sem tocar no pack real.
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const Blind = require("../src/capacidade-viva/calibration/blind-validation");

const root = path.join(__dirname, "..");
const blindDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "data/capacidade-viva/calibration/blind-v2");
const gabaritoPath = path.join(blindDir, "GABARITO_MOTOR_CONGELADO.json");
const labelsPath = path.join(blindDir, "ROTULOS_HUMANOS_CEGOS.json");
const manifestPath = path.join(blindDir, "MANIFESTO_CONGELAMENTO.json");

const ORDER = ["normal", "atencao", "quase_critico", "critico", "qualidade_fonte"];

/**
 * Métricas adicionais além de Blind.compareBlindLabels (reutilizada, não
 * duplicada): qualidade da fonte não detectada, adequação das intervenções,
 * divergências por faixa (do rótulo humano).
 */
function extraMetrics(rows) {
  let qualidadeFonteNaoDetectada = 0;
  let intervencoesAdequadas = 0;
  let intervencoesInadequadas = 0;
  const divergenciasPorFaixa = {};

  for (const r of rows) {
    if (r.skipped_for_agreement) continue; // impossivel_avaliar não entra em adequação
    if (r.human === "qualidade_fonte" && r.motor !== "qualidade_fonte") qualidadeFonteNaoDetectada++;

    const precisaAcao = r.human !== "normal";
    const intervConcreta =
      r.intervencao_motor && !/^observar$/i.test(r.intervencao_motor) && !/^nao_classificar_pressao$/i.test(r.intervencao_motor);
    const adequada = precisaAcao ? !!intervConcreta : !intervConcreta;
    if (adequada) intervencoesAdequadas++;
    else intervencoesInadequadas++;

    if (!r.exact) {
      const faixa = r.human || "desconhecida";
      divergenciasPorFaixa[faixa] = (divergenciasPorFaixa[faixa] || 0) + 1;
    }
  }

  return {
    qualidade_fonte_nao_detectada: qualidadeFonteNaoDetectada,
    intervencoes_adequadas: intervencoesAdequadas,
    intervencoes_inadequadas: intervencoesInadequadas,
    intervencoes_adequacao_pct:
      intervencoesAdequadas + intervencoesInadequadas
        ? Math.round((intervencoesAdequadas / (intervencoesAdequadas + intervencoesInadequadas)) * 1000) / 1000
        : null,
    divergencias_por_faixa: divergenciasPorFaixa
  };
}

function main() {
  if (!fs.existsSync(labelsPath)) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          ready: false,
          message:
            "Aguardando rótulos humanos em ROTULOS_HUMANOS_CEGOS.json (blind-v2). Não executar comparação antes. " +
            "Fase 2D.9 apenas congelou o holdout — nenhuma comparação foi feita."
        },
        null,
        2
      )
    );
    process.exit(0);
  }
  if (!fs.existsSync(gabaritoPath)) {
    console.error("gabarito blind-v2 ausente");
    process.exit(1);
  }

  let labels;
  try {
    labels = JSON.parse(fs.readFileSync(labelsPath, "utf8"));
  } catch (e) {
    console.error("JSON inválido em ROTULOS_HUMANOS_CEGOS.json:", e.message);
    process.exit(1);
  }

  const gab = JSON.parse(fs.readFileSync(gabaritoPath, "utf8"));
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : null;

  if (manifest && manifest.gabarito_sha256) {
    const liveSha = Blind.fileSha256(gabaritoPath);
    if (liveSha !== manifest.gabarito_sha256) {
      console.error(
        "INTEGRIDADE QUEBRADA: GABARITO_MOTOR_CONGELADO.json não bate com o hash do manifesto — " +
          "não comparar contra um gabarito alterado após o congelamento."
      );
      process.exit(1);
    }
  }

  const report = Blind.compareBlindLabels(gab.cases || [], labels);
  const extra = report.ok ? extraMetrics(report.rows || []) : {};

  const out = path.join(blindDir, "RESULTADO_COMPARACAO.json");
  const doc = {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    generated_at: new Date().toISOString(),
    config_sha256: gab.config_sha256,
    motor_commit: gab.motor_commit || null,
    rotulos_path: "data/capacidade-viva/calibration/blind-v2/ROTULOS_HUMANOS_CEGOS.json",
    rotulos_meta: {
      configuracao_avaliada: labels.configuracao_avaliada || null,
      config_sha256_declarado: labels.config_sha256 || null,
      referencia_congelada: labels.referencia_congelada || null,
      avaliador: labels.avaliador || null,
      metodologia: labels.metodologia || null,
      n_rotulos: Array.isArray(labels.rotulos) ? labels.rotulos.length : null
    },
    natureza_da_avaliacao:
      "Os rótulos comparados aqui são um julgamento retrospectivo do avaliador sobre fatos " +
      "operacionais de episódios já registrados (CASOS_CEGOS_CESAR.md), feito antes da abertura " +
      "do gabarito — não são observações presenciais em loja nem decisões tomadas durante " +
      "operação ao vivo. Ver ROTULOS_HUMANOS_CEGOS.json.metodologia para o texto completo.",
    validation: {
      file_exists: true,
      json_valid: true,
      gabarito_integrity_ok: !manifest || !manifest.gabarito_sha256 ? null : true
    },
    report: Object.assign({}, report, extra),
    note: "Este é o SEGUNDO holdout, independente do blind-v1. Não misturar métricas entre packs."
  };
  fs.writeFileSync(out, JSON.stringify(doc, null, 2));
  console.log(JSON.stringify(doc, null, 2));
  console.log("wrote", out);
}

main();
