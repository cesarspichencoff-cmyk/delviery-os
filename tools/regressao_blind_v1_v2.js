#!/usr/bin/env node
/* ============================================================================
 * REGRESSÃO blind-v1 com cv-cal-tata-human-v2
 *
 * NÃO É NOVA VALIDAÇÃO CEGA.
 * É REAVALIAÇÃO SOBRE CONJUNTO JÁ REVELADO.
 *
 *   node tools/regressao_blind_v1_v2.js
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const Blind = require("../src/capacidade-viva/calibration/blind-validation");

const root = path.join(__dirname, "..");
const blindDir = path.join(root, "data/capacidade-viva/calibration/blind-v1");
const cfgPath = path.join(root, "data/capacidade-viva/calibration/configs/cv-cal-tata-human-v2.json");
const factsPath = path.join(blindDir, "casos-cegos-fatos.json");
const labelsPath = path.join(blindDir, "ROTULOS_HUMANOS_CEGOS.json");
const outPath = path.join(blindDir, "RESULTADO_REGRESSAO_V2.json");

const ALERT =
  "NÃO É NOVA VALIDAÇÃO CEGA. É REAVALIAÇÃO SOBRE CONJUNTO JÁ REVELADO (blind-v1).";

function motorScale(pred) {
  const cls = pred.classificacao;
  const sev = pred.severity_label;
  if (cls === "qualidade_fonte") return "qualidade_fonte";
  if (cls === "evidencia_insuficiente") return "impossivel_avaliar";
  if (cls === "excecao_critica") return "critico";
  if (sev === "quase_critico") return "quase_critico";
  if (sev === "normal") return "normal";
  if (cls === "atencao") return "atencao";
  if (cls === "sinal" || cls === "quieto") return "normal";
  return "atencao";
}

function main() {
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const facts = JSON.parse(fs.readFileSync(factsPath, "utf8"));
  const labels = JSON.parse(fs.readFileSync(labelsPath, "utf8"));
  const byHuman = Blind.normalizeHumanBlindLabels(labels);

  const rows = [];
  let exact = 0;
  let within1 = 0;
  let nComp = 0;
  let nImp = 0;
  let falseCrit = 0;
  let missedCrit = 0;
  let falseFonte = 0;
  let zombieContam = 0;

  const order = ["normal", "atencao", "quase_critico", "critico", "qualidade_fonte", "impossivel_avaliar"];

  const must = {
    "CV-B-006": "normal",
    "CV-B-008": "normal",
    "CV-B-015": "normal",
    "CV-B-017": "normal",
    "CV-B-022": "normal",
    "CV-B-021": "atencao",
    "CV-B-011": "qualidade_fonte",
    "CV-B-023": "qualidade_fonte",
    "CV-B-007": "critico",
    "CV-B-012": "critico",
    "CV-B-013": "critico",
    "CV-B-020": "critico"
  };
  const mustOk = {};

  for (const fact of facts.cases || []) {
    const pred = Blind.classifyBlindFactCase(fact, cfg);
    const m = motorScale(pred);
    const h = byHuman[fact.case_id];
    const human = h ? h.estado_real : null;

    const row = {
      case_id: fact.case_id,
      motor: m,
      human,
      classificacao: pred.classificacao,
      severity_label: pred.severity_label,
      intervencao: pred.intervencao,
      exclude_from_capacity: pred.exclude_from_capacity,
      zombie: pred.zombie,
      regra: pred.regra_acionada,
      evidencias: pred.evidencias
    };

    if (must[fact.case_id]) {
      mustOk[fact.case_id] = m === must[fact.case_id] || (must[fact.case_id] === "qualidade_fonte" && pred.zombie);
    }

    if (!human) {
      rows.push(row);
      continue;
    }

    if (human === "impossivel_avaliar") {
      nImp++;
      row.exact = m === "impossivel_avaliar" || m === "normal";
      // volume-only: aceitar impossivel_avaliar OU normal (sem pressão)
      if (m === "impossivel_avaliar") exact++;
      nComp++; // conta como comparável para impossivel se motor também não pressiona
      if (m === "impossivel_avaliar" || m === "normal") {
        within1++;
        row.within1 = true;
      }
      rows.push(row);
      continue;
    }

    nComp++;
    row.exact = m === human;
    if (row.exact) exact++;
    const mi = order.indexOf(m);
    const hi = order.indexOf(human);
    row.within1 = mi >= 0 && hi >= 0 && Math.abs(mi - hi) <= 1;
    if (row.within1) within1++;
    if (m === "critico" && human !== "critico" && human !== "quase_critico") falseCrit++;
    if (human === "critico" && m !== "critico") missedCrit++;
    if (m === "qualidade_fonte" && human !== "qualidade_fonte") falseFonte++;
    if (human === "qualidade_fonte" && !pred.exclude_from_capacity && m !== "qualidade_fonte") zombieContam++;

    rows.push(row);
  }

  const report = {
    ALERTA_VALIDADE: ALERT,
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL", "REGRESSÃO_NÃO_CEGA"],
    generated_at: new Date().toISOString(),
    config_version: cfg.config_version,
    note: "Reavaliação do conjunto blind-v1 já revelado. Não usar como precisão independente da v2.",
    n: rows.length,
    n_comparaveis: nComp,
    n_impossivel_avaliar_humano: nImp,
    concordancia_exata_count: exact,
    concordancia_exata: nComp ? exact / nComp : null,
    concordancia_dentro_de_um_nivel_count: within1,
    concordancia_dentro_de_um_nivel: nComp ? within1 / nComp : null,
    falsos_criticos: falseCrit,
    criticos_nao_detectados: missedCrit,
    falsos_qualidade_fonte: falseFonte,
    zumbis_contaminaram_capacidade: zombieContam,
    checks_obrigatorios: mustOk,
    checks_obrigatorios_ok: Object.values(mustOk).every(Boolean),
    rows
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(ALERT);
  console.log(
    JSON.stringify(
      {
        config: cfg.config_version,
        exact: report.concordancia_exata_count,
        within1: report.concordancia_dentro_de_um_nivel_count,
        n_comp: nComp,
        false_crit: falseCrit,
        missed_crit: missedCrit,
        checks: mustOk,
        checks_ok: report.checks_obrigatorios_ok,
        out: outPath
      },
      null,
      2
    )
  );
  for (const r of rows) {
    const mark = r.exact ? "OK" : r.within1 ? "~1" : "XX";
    console.log(`${mark} ${r.case_id} motor=${r.motor} human=${r.human} sev=${r.severity_label}`);
  }
  if (!report.checks_obrigatorios_ok) process.exitCode = 1;
}

main();
