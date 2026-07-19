#!/usr/bin/env node
/* ============================================================================
 * Avalia cv-cal-sane-v2 vs cv-cal-tata-human-v1 nos casos review-v3 + rótulos César.
 * Não afirma precisão geral — amostra pequena.
 * ==========================================================================*/
"use strict";

const fs = require("fs");
const path = require("path");
const { classifyOrderSignals } = require("../src/capacidade-viva/calibration/taxonomy");
const { sugerirMenorIntervencaoSane } = require("../src/capacidade-viva/calibration/intervencao-sane");
const { classifyOrderHuman, classifyMotoboyWait, classifyProntoSemSaida, isZombieOrder } = require("../src/capacidade-viva/calibration/human-rules");

const root = path.join(__dirname, "..");

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function extractMinutesFromRazao(razao) {
  if (!razao) return null;
  const m1 = String(razao).match(/espera na loja\s+([\d.]+)\s*min/i);
  if (m1) return Number(m1[1]);
  const m2 = String(razao).match(/idade\s+([\d.]+)/i);
  if (m2) return Number(m2[1]);
  const m3 = String(razao).match(/([\d.]+)\s*min/);
  if (m3) return Number(m3[1]);
  return null;
}

function stateFromCase(c) {
  const mins = extractMinutesFromRazao(c.razao);
  const type = c.type || "";
  const age =
    c.intervalo_episodio && c.intervalo_episodio.observed_span_min != null
      ? null
      : null;
  // prefer explicit age from razao for delayed
  let age_min = type.indexOf("atrasado") >= 0 || type.indexOf("pedido_atrasado") >= 0 ? mins : 30;
  if (type.indexOf("atrasado") >= 0 && mins != null) age_min = mins;

  let courier = null;
  let ready = 0;
  if (type === "motoboy_na_loja") {
    courier = mins != null ? mins : 10;
    ready = courier;
  } else if (type.indexOf("pronto") >= 0 || type === "entregador_alocado_sem_retirada") {
    ready = mins != null ? mins : 20;
  } else if (type === "prontos_acumulando") {
    ready = 20;
  }

  // zombie ages from razao
  if (mins != null && mins > 1000) age_min = mins;

  return {
    id: c.order_token || c.case_id,
    age_min: age_min || 20,
    ready_wait_min: ready,
    pronto: type !== "pedido_atrasado_vs_prometido_operacional" || ready > 0,
    saiu: false,
    cancelado: false,
    alocado: type === "entregador_alocado_sem_retirada",
    alocado_epistemic: "inferido_alta_confianca",
    courier_wait_store_min: courier,
    courier_wait_epistemic: courier != null ? "inferido_alta_confianca" : null,
    prontos_acumulando: type === "prontos_acumulando",
    queue_growing: false,
    carga_alta: (c.pedidos_ativos || 0) > 40,
    item_complexo: false,
    capacidade_baixa: false
  };
}

function motorSaysCritical(cls) {
  return cls.level === "excecao_critica" || cls.has_critical;
}

function motorSaysAttention(cls) {
  return cls.level === "atencao" || cls.has_attention;
}

function agreeWithHuman(human, cls, iv) {
  if (!human || !human.valido_calibracao) return null;
  const g = human.gravidade_humana || human.rotulo;
  if (human.rotulo === "qualidade_fonte" || human.excluir_capacidade) {
    return cls.zombie || cls.level === "qualidade_fonte" || cls.exclude_from_capacity;
  }
  if (human.critico || g === "critico" || g === "critico_confirmado") {
    return motorSaysCritical(cls);
  }
  if (g === "quase_critico" || g === "atencao_forte" || g === "atencao_forte_quase_critico") {
    return motorSaysAttention(cls) || motorSaysCritical(cls);
  }
  if (g === "observacao" || g === "observacao_normal_proximo_limite" || g === "normal_ou_observacao") {
    // não deve ser crítico
    return !motorSaysCritical(cls);
  }
  if (g === "atencao" || g === "atencao_confianca_baixa" || g === "atencao_forte_confianca_baixa") {
    return motorSaysAttention(cls) || motorSaysCritical(cls);
  }
  return null;
}

function main() {
  const sane = loadJson(
    path.join(root, "data/capacidade-viva/calibration/configs/cv-cal-sane-v2.json")
  );
  const humanCfg = loadJson(
    path.join(root, "data/capacidade-viva/calibration/configs/cv-cal-tata-human-v1.json")
  );
  const labels = loadJson(
    path.join(root, "data/capacidade-viva/calibration/review-v3/rotulos-humanos-cesar.json")
  );
  const rep = loadJson(
    path.join(root, "data/capacidade-viva/calibration/review-v3/casos-representativos.json")
  );
  const lim = loadJson(
    path.join(root, "data/capacidade-viva/calibration/review-v3/casos-limitrofes.json")
  );

  const allCases = [...(rep.cases || []), ...(lim.cases || [])];
  const labelMap = Object.assign({}, labels.representativos, labels.limitrofes);

  let falseCriticalMotoboyBefore = 0;
  let falseCriticalMotoboyAfter = 0;
  let critical40Before = 0;
  let critical40After = 0;
  let zombiesRemoved = 0;
  let agreeBefore = 0;
  let agreeAfter = 0;
  let agreeN = 0;
  let intervencoesChanged = 0;
  const details = [];

  for (const c of allCases) {
    const human = labelMap[c.case_id];
    if (!human) continue;
    const state = stateFromCase(c);
    const ctx = {
      n_ready: c.pedidos_ativos > 20 ? 5 : 1,
      n_delayed: 0,
      n_motoboys_waiting: c.type === "motoboy_na_loja" ? 1 : 0
    };

    const clsOld = classifyOrderSignals(state, sane, ctx);
    const clsNew = classifyOrderSignals(state, humanCfg, ctx);

    const ivOld = sugerirMenorIntervencaoSane({
      tick_class: {
        has_critical: clsOld.level === "excecao_critica",
        has_attention: clsOld.level === "atencao",
        critical_items: clsOld.exceptions || [],
        attention_items: clsOld.attentions || [],
        n_zombie_orders: clsOld.zombie ? 1 : 0
      },
      isf: { confidence: "media", por_praca: {}, praca_critica: null },
      config: sane,
      confidence: "media"
    });
    const ivNew = sugerirMenorIntervencaoSane({
      tick_class: {
        has_critical: clsNew.level === "excecao_critica",
        has_attention: clsNew.level === "atencao",
        critical_items: clsNew.exceptions || [],
        attention_items: clsNew.attentions || [],
        n_zombie_orders: clsNew.zombie ? 1 : 0
      },
      isf: { confidence: clsNew.confidence || "media", por_praca: {}, praca_critica: null },
      config: humanCfg,
      confidence: clsNew.confidence || "media"
    });

    // falsos críticos motoboy: humano diz não crítico, motor diz exceção, type motoboy
    if (c.type === "motoboy_na_loja" && human.valido_calibracao && !human.critico) {
      if (clsOld.level === "excecao_critica") falseCriticalMotoboyBefore++;
      if (clsNew.level === "excecao_critica") falseCriticalMotoboyAfter++;
    }

    // pedidos >40 min → crítico
    const age = state.age_min;
    if (age >= 40 && age < 180 && human.valido_calibracao) {
      if (clsOld.level === "excecao_critica") critical40Before++;
      if (clsNew.level === "excecao_critica") critical40After++;
    }

    if (clsNew.zombie || clsNew.level === "qualidade_fonte") {
      if (human.excluir_capacidade || human.rotulo === "qualidade_fonte") zombiesRemoved++;
    }

    const a0 = agreeWithHuman(human, clsOld, ivOld);
    const a1 = agreeWithHuman(human, clsNew, ivNew);
    if (a0 != null) {
      agreeN++;
      if (a0) agreeBefore++;
      if (a1) agreeAfter++;
    }

    if (ivOld.action !== ivNew.action || (ivNew.message && ivNew.message !== ivOld.reason)) {
      intervencoesChanged++;
    }

    details.push({
      case_id: c.case_id,
      type: c.type,
      human: human.rotulo,
      old_level: clsOld.level,
      new_level: clsNew.level,
      old_action: ivOld.action,
      new_action: ivNew.action,
      new_message: ivNew.message || null,
      agree_old: a0,
      agree_new: a1
    });
  }

  const report = {
    labels: ["CALIBRAÇÃO", "MODO SOMBRA", "NÃO OPERACIONAL"],
    version: "2D.6",
    config_previous: "cv-cal-sane-v2",
    config_new: "cv-cal-tata-human-v1",
    n_cases_evaluated: details.length,
    validos: Object.values(labelMap).filter((h) => h.valido_calibracao).length,
    excluidos: Object.values(labelMap).filter((h) => h.valido_calibracao === false).length,
    falsos_criticos_motoboy: {
      antes: falseCriticalMotoboyBefore,
      depois: falseCriticalMotoboyAfter,
      reduzidos: Math.max(0, falseCriticalMotoboyBefore - falseCriticalMotoboyAfter)
    },
    criticos_acima_40_min: {
      antes: critical40Before,
      depois: critical40After,
      novos_ou_mantidos: critical40After
    },
    zumbis_removidos_capacidade: zombiesRemoved,
    concordancia: {
      n: agreeN,
      antes: agreeBefore,
      depois: agreeAfter,
      taxa_antes: agreeN ? Math.round((agreeBefore / agreeN) * 1000) / 1000 : null,
      taxa_depois: agreeN ? Math.round((agreeAfter / agreeN) * 1000) / 1000 : null
    },
    intervencoes_atualizadas: intervencoesChanged,
    note: "Amostra pequena (review-v3 + rótulos César). Não afirmar precisão geral.",
    details
  };

  const out = path.join(
    root,
    "data/capacidade-viva/calibration/review-v3/avaliacao-calibracao-humana-2d6.json"
  );
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    falsos_criticos_reduzidos: report.falsos_criticos_motoboy.reduzidos,
    criticos_40: report.criticos_acima_40_min,
    zumbis: report.zumbis_removidos_capacidade,
    concordancia: report.concordancia,
    intervencoes: report.intervencoes_atualizadas,
    out
  }, null, 2));
}

main();
